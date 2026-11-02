"use client";

import React, { useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useClerk } from "@clerk/nextjs";
import {
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles,
  X,
  AlertCircle,
  Plus,
  RefreshCw,
  BookOpen,
} from "lucide-react";
import { cn, parsePDFFile, withRetry } from "@/lib/utils";
import { upload } from "@vercel/blob/client";
import {
  checkBookExists,
  createBook,
  saveBookSegments,
} from "@/lib/actions/book.actions";
import {
  requestPresignedUpload,
  saveCoverImageAction,
} from "@/lib/actions/storage.actions";
import { DEFAULT_VOICE, voiceOptions } from "@/lib/constants";
import Image from "next/image";

type UploadStage =
  | "idle"
  | "reading"
  | "processing"
  | "saving"
  | "ready"
  | "error";

interface DirectBookUploadProps {
  className?: string;
  variant?: "primary" | "compact";
}

interface UploadCheckpoint {
  parsedPDF?: Awaited<ReturnType<typeof parsePDFFile>>;
  uploadedPdfUrl?: string;
  uploadedPdfKey?: string;
  coverUrl?: string;
  coverBlobKey?: string;
  blueprint?: any;
  createdBook?: any;
  savedChunkIndex?: number;
}

export default function DirectBookUpload({
  className,
  variant = "primary",
}: DirectBookUploadProps) {
  const router = useRouter();
  const { isSignedIn, isLoaded, userId } = useAuth();
  const clerk = useClerk();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [detectedDomain, setDetectedDomain] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const checkpointRef = useRef<UploadCheckpoint>({});

  const defaultVoiceId =
    voiceOptions[DEFAULT_VOICE as keyof typeof voiceOptions]?.id ||
    voiceOptions.rachel.id;

  const handleButtonClick = () => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      clerk.openSignIn({
        fallbackRedirectUrl: "/library",
        signUpFallbackRedirectUrl: "/library",
      });
      return;
    }

    fileInputRef.current?.click();
  };

  const executePipeline = useCallback(
    async (file: File) => {
      if (!userId) return;

      setSelectedFile(file);
      setIsOpen(true);
      setErrorMsg(null);

      // Clean title from filename
      const rawName = file.name.replace(/\.[^/.]+$/, "");
      const cleanTitle = rawName
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      setTitle(cleanTitle);

      const cp = checkpointRef.current;

      try {
        // Step 1: Check existing book (only on first attempt)
        if (!cp.createdBook) {
          setProgress(10);
          setStage("reading");
          setStatusText("Checking title in your library...");

          const existsCheck = await checkBookExists(cleanTitle);
          if (existsCheck?.exists && existsCheck.book) {
            setProgress(100);
            setStage("ready");
            setStatusText("Book already in library! Opening...");
            setTimeout(() => {
              router.push(`/books/${existsCheck.book.slug}`);
            }, 800);
            return;
          }
        }

        // Step 2: Parse PDF (1:1 page mapping)
        let parsedPDF = cp.parsedPDF;
        if (!parsedPDF) {
          setProgress(20);
          setStage("reading");
          setStatusText("Parsing PDF chapters and extracting pages...");

          parsedPDF = await parsePDFFile(file);
          if (!parsedPDF.content || parsedPDF.content.length === 0) {
            throw new Error("Could not extract readable text from PDF.");
          }
          cp.parsedPDF = parsedPDF;
        }

        setPageCount(parsedPDF.numPages);
        if (parsedPDF.cover && parsedPDF.cover.startsWith("data:image")) {
          setCoverPreview(parsedPDF.cover);
        }

        // Step 3: Run Cloud PDF Upload, Cover Upload, and AI Digestion IN PARALLEL
        setStage("processing");
        setProgress(45);
        setStatusText("Digesting study source & uploading to secure cloud...");

        // Task A: PDF Cloud Upload with 45-second timeout guard
        const uploadPdfTask = async () => {
          if (cp.uploadedPdfUrl && cp.uploadedPdfKey) {
            return { url: cp.uploadedPdfUrl, key: cp.uploadedPdfKey };
          }

          return await withRetry(
            async () => {
              let url = "";
              let key = "";
              try {
                const presigned = await requestPresignedUpload(
                  file.name,
                  file.type || "application/pdf"
                );
                if (presigned.success && presigned.data) {
                  const controller = new AbortController();
                  const timeoutId = setTimeout(() => controller.abort(), 45000);

                  const r2Res = await fetch(presigned.data.uploadUrl, {
                    method: "PUT",
                    body: file,
                    headers: {
                      "Content-Type": file.type || "application/pdf",
                    },
                    signal: controller.signal,
                  });
                  clearTimeout(timeoutId);

                  if (r2Res.ok) {
                    url = presigned.data.publicUrl;
                    key = presigned.data.key;
                  }
                }
              } catch (r2Err) {
                console.warn("Direct R2 upload attempt failed, trying fallback:", r2Err);
              }

              if (!url) {
                const fileSlug = file.name.replace(/\s+/g, "-").toLowerCase();
                const uploadedBlob = await upload(`${fileSlug}`, file, {
                  access: "public",
                  handleUploadUrl: "/api/upload",
                  contentType: "application/pdf",
                });
                url = uploadedBlob.url;
                key = uploadedBlob.pathname;
              }

              cp.uploadedPdfUrl = url;
              cp.uploadedPdfKey = key;
              return { url, key };
            },
            {
              retries: 2,
              delayMs: 1200,
              onRetry: (_err, attempt) => {
                setStatusText(`Retrying cloud upload (attempt ${attempt}/2)...`);
              },
            }
          );
        };

        // Task B: Cover Upload (completely non-blocking, times out after 10s)
        const uploadCoverTask = async () => {
          if (cp.coverUrl) {
            return { url: cp.coverUrl, key: cp.coverBlobKey || "" };
          }

          const defaultCover = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";

          if (!parsedPDF!.cover || !parsedPDF!.cover.startsWith("data:image")) {
            return { url: defaultCover, key: "" };
          }

          try {
            const coverPromise = saveCoverImageAction(
              parsedPDF!.cover,
              `${file.name}_cover.webp`
            );
            const timeoutPromise = new Promise<{ success: boolean; data?: any }>((resolve) =>
              setTimeout(() => resolve({ success: false }), 10000)
            );

            const coverRes = await Promise.race([coverPromise, timeoutPromise]);
            if (coverRes.success && coverRes.data) {
              cp.coverUrl = coverRes.data.url;
              cp.coverBlobKey = coverRes.data.key;
              return { url: coverRes.data.url, key: coverRes.data.key };
            }
          } catch (coverErr) {
            console.warn("Cover image upload non-fatal warning:", coverErr);
          }

          cp.coverUrl = defaultCover;
          cp.coverBlobKey = "";
          return { url: defaultCover, key: "" };
        };

        // Task C: AI Deep Source Digestion (times out after 15s to never stall the upload)
        const digestTask = async () => {
          if (cp.blueprint) {
            return cp.blueprint;
          }

          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const digestRes = await fetch("/api/books/digest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: cleanTitle,
                author: "Author Unknown",
                totalPages: parsedPDF!.numPages,
                textPreview: parsedPDF!.textPreview,
              }),
              signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (digestRes.ok) {
              const data = await digestRes.json();
              if (data?.blueprint) {
                cp.blueprint = data.blueprint;
                if (data.blueprint.domain) {
                  setDetectedDomain(data.blueprint.domain);
                }
                return data.blueprint;
              }
            }
          } catch (digestErr) {
            console.warn("AI digestion non-fatal error:", digestErr);
          }

          return null;
        };

        // Execute all 3 in parallel
        const [uploadPdfRes, uploadCoverRes, digestRes] = await Promise.all([
          uploadPdfTask(),
          uploadCoverTask(),
          digestTask(),
        ]);

        setProgress(75);
        if (digestRes?.domain) {
          setStatusText(`Grounded in ${digestRes.domain}. Creating workspace...`);
        } else {
          setStatusText("Creating your interactive study space...");
        }

        // Step 4: Create or retrieve book record
        let book = cp.createdBook;
        if (!book) {
          const createRes = await createBook({
            clerkId: userId,
            title: cleanTitle,
            author: "Author Unknown",
            persona: defaultVoiceId,
            fileURL: uploadPdfRes.url,
            fileBlobKey: uploadPdfRes.key,
            coverURL: uploadCoverRes.url,
            coverBlobKey: uploadCoverRes.key,
            fileSize: file.size,
            totalPages: parsedPDF.numPages,
            totalSegments: parsedPDF.content.length,
            topic: digestRes?.topic || "General",
            summary: digestRes?.summary || "",
            blueprint: digestRes || {},
          });

          if (!createRes.success) {
            throw new Error(
              typeof createRes.error === "string"
                ? createRes.error
                : "Failed to create book record"
            );
          }
          book = createRes.data;
          cp.createdBook = book;
        }

        // Step 5: Save Segments with resilience
        setStage("saving");
        const allSegments = parsedPDF.content;
        const CHUNK_SIZE = 60;
        const totalChunks = Math.ceil(allSegments.length / CHUNK_SIZE);
        const startChunk = cp.savedChunkIndex ? cp.savedChunkIndex + 1 : 0;

        for (let c = startChunk; c < totalChunks; c++) {
          const chunk = allSegments.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
          const chunkProgress = 78 + Math.round(((c + 1) / totalChunks) * 20);
          setProgress(chunkProgress);
          setStatusText(
            totalChunks > 1
              ? `Indexing knowledge pages (${Math.min(
                  (c + 1) * CHUNK_SIZE,
                  allSegments.length
                )} of ${allSegments.length})...`
              : "Synthesizing learning nodes and active recall index..."
          );

          await withRetry(
            async () => {
              const res = await saveBookSegments(book._id, userId, chunk, {
                isAppend: c > 0,
                totalExpectedSegments: allSegments.length,
              });

              if (!res.success) {
                throw new Error(
                  typeof res.error === "string"
                    ? res.error
                    : "Failed to index book segments."
                );
              }
              cp.savedChunkIndex = c;
            },
            {
              retries: 3,
              delayMs: 1000,
              onRetry: (_err, attempt) => {
                setStatusText(`Network pause, retrying page index (${attempt}/3)...`);
              },
            }
          );
        }

        // Done!
        setProgress(100);
        setStage("ready");
        setStatusText("Synthesis complete! Opening study studio...");

        // Clear checkpoint on success
        checkpointRef.current = {};

        setTimeout(() => {
          router.push(`/books/${book.slug}`);
        }, 500);
      } catch (err) {
        console.error("Direct upload failed:", err);
        setStage("error");
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "Upload failed. Click 'Resume from Checkpoint' to continue."
        );
      }
    },
    [userId, defaultVoiceId, router]
  );

  const startDirectUpload = (file: File) => {
    checkpointRef.current = {};
    executePipeline(file);
  };

  const resumeUpload = () => {
    if (selectedFile) {
      executePipeline(selectedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      const isPdf =
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf");
      if (!isPdf) {
        alert("Please select a PDF document (.pdf)");
        return;
      }
      startDirectUpload(file);
    }
    e.target.value = "";
  };

  const handleClose = () => {
    if (stage === "reading" || stage === "processing" || stage === "saving") {
      if (
        !window.confirm(
          "Synthesis is in progress. Are you sure you want to cancel?"
        )
      ) {
        return;
      }
    }
    checkpointRef.current = {};
    setIsOpen(false);
    setSelectedFile(null);
    setCoverPreview(null);
    setDetectedDomain(null);
    setStage("idle");
    setProgress(0);
    setErrorMsg(null);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {variant === "compact" ? (
        <button
          type="button"
          onClick={handleButtonClick}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5 cursor-pointer active:translate-y-0",
            className
          )}
          title="Directly upload any PDF book or study material"
        >
          <Plus className="size-3.5 stroke-[3]" />
          Add Book
        </button>
      ) : (
        <button
          type="button"
          onClick={handleButtonClick}
          className={cn(
            "group flex shrink-0 items-center justify-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-5 py-2.5 text-[12px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 cursor-pointer active:translate-y-0",
            className
          )}
          title="Directly upload any PDF book or study material"
        >
          <Plus className="size-4 stroke-[3]" />
          Add Book
        </button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 sm:p-7 shadow-frame">
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-5 top-5 rounded-full border border-[color:var(--ink)]/30 p-1.5 text-[color:var(--ink)] hover:bg-[color:var(--ink)]/10 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-11 items-center justify-center rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h3 className="display text-xl font-bold text-[color:var(--ink)]">
                  Fast Source Digestion & Upload
                </h3>
                <p className="text-xs text-[color:var(--ink)] opacity-75">
                  AI ingestion & canonical textbook grounding in progress
                </p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-[color:var(--ink)]/20 bg-[color:var(--panel)] p-4 flex gap-4 items-center">
              {coverPreview ? (
                <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-[color:var(--ink)] shadow-xs">
                  <Image
                    src={coverPreview}
                    alt="Cover preview"
                    fill
                    className="object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-20 w-14 shrink-0 items-center justify-center rounded-lg border border-dashed border-[color:var(--ink)]/40 bg-[color:var(--cream)]">
                  <FileText className="size-6 text-[color:var(--ink)]/60" />
                </div>
              )}

              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-[color:var(--ink)] truncate">
                  {title || selectedFile?.name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px] text-[color:var(--ink)] opacity-70">
                  <span>
                    {selectedFile
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                      : "PDF"}
                  </span>
                  {pageCount && (
                    <>
                      <span>•</span>
                      <span>{pageCount} pages (1:1 synced)</span>
                    </>
                  )}
                  {detectedDomain && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                        {detectedDomain}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-[color:var(--ink)]">
                <span className="flex items-center gap-2">
                  {stage === "ready" ? (
                    <CheckCircle2 className="size-4 text-emerald-600" />
                  ) : stage === "error" ? (
                    <AlertCircle className="size-4 text-rose-600" />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-[color:var(--ink)]" />
                  )}
                  {statusText}
                </span>
                <span className="tabular-nums font-mono text-[11px] font-bold">
                  {progress}%
                </span>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-0.5">
                <div
                  className="h-full rounded-full bg-[color:var(--orange)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 text-center text-[10px] font-bold uppercase tracking-wider text-[color:var(--ink)]">
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 20
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/30"
                      : "border-transparent opacity-40"
                  }`}
                >
                  1. Parse
                </div>
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 45
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/30"
                      : "border-transparent opacity-40"
                  }`}
                >
                  2. Digest
                </div>
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 78
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/30"
                      : "border-transparent opacity-40"
                  }`}
                >
                  3. Index
                </div>
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 100
                      ? "border-[color:var(--ink)] bg-emerald-100 text-emerald-800"
                      : "border-transparent opacity-40"
                  }`}
                >
                  4. Ready
                </div>
              </div>
            </div>

            {stage === "error" && errorMsg && (
              <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
                <span className="flex-1 mr-2">{errorMsg}</span>
                <button
                  type="button"
                  onClick={resumeUpload}
                  className="inline-flex items-center gap-1 font-bold bg-rose-600 text-white px-3 py-1.5 rounded-lg hover:bg-rose-700 cursor-pointer text-[11px] shrink-0"
                >
                  <RefreshCw className="size-3.5" />
                  Resume
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
