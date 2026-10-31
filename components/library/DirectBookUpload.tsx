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
} from "lucide-react";
import { cn, parsePDFFile } from "@/lib/utils";
import { upload } from "@vercel/blob/client";
import {
  checkBookExists,
  createBook,
  saveBookSegments,
} from "@/lib/actions/book.actions";
import { DEFAULT_VOICE, voiceOptions } from "@/lib/constants";
import Image from "next/image";

type UploadStage =
  | "idle"
  | "reading"
  | "extracting_cover"
  | "uploading"
  | "saving"
  | "ready"
  | "error";

interface DirectBookUploadProps {
  className?: string;
  variant?: "primary" | "compact";
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
  const [author, setAuthor] = useState("");
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [stage, setStage] = useState<UploadStage>("idle");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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

    // Trigger direct file picker immediately
    fileInputRef.current?.click();
  };

  const startDirectUpload = useCallback(
    async (file: File) => {
      if (!userId) return;

      setSelectedFile(file);
      setIsOpen(true);
      setErrorMsg(null);
      setProgress(10);
      setStage("reading");
      setStatusText("Reading PDF and extracting text...");

      // Clean title from filename
      const rawName = file.name.replace(/\.[^/.]+$/, "");
      const cleanTitle = rawName
        .replace(/[-_]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
      setTitle(cleanTitle);
      setAuthor("Author Unknown");

      try {
        // Step 1: Check existing book
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

        // Step 2: Parse PDF
        setProgress(25);
        const parsedPDF = await parsePDFFile(file);
        if (!parsedPDF.content || parsedPDF.content.length === 0) {
          throw new Error("Could not extract readable text from PDF.");
        }

        if (parsedPDF.numPages) {
          setPageCount(parsedPDF.numPages);
        }

        if (parsedPDF.cover && parsedPDF.cover.startsWith("data:image")) {
          setCoverPreview(parsedPDF.cover);
        }

        // Step 3: Upload PDF to Blob Storage
        setStage("uploading");
        setProgress(50);
        setStatusText("Uploading document to secure cloud storage...");

        const fileSlug = file.name.replace(/\s+/g, "-").toLowerCase();
        const uploadedPdf = await upload(`${fileSlug}`, file, {
          access: "public",
          handleUploadUrl: "/api/upload",
          contentType: "application/pdf",
        });

        // Step 4: Upload Cover Image
        setProgress(70);
        setStatusText("Preparing book cover & metadata...");
        let coverUrl = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";
        let coverBlobKey = "";

        if (parsedPDF.cover && parsedPDF.cover.startsWith("data:image")) {
          try {
            const res = await fetch(parsedPDF.cover);
            const blob = await res.blob();
            const uploadedCover = await upload(`${fileSlug}_cover.png`, blob, {
              access: "public",
              handleUploadUrl: "/api/upload",
              contentType: "image/png",
            });
            coverUrl = uploadedCover.url;
            coverBlobKey = uploadedCover.pathname;
          } catch (coverErr) {
            console.warn("Cover upload fallback used:", coverErr);
          }
        }

        // Step 5: Save Book in Database
        setStage("saving");
        setProgress(85);
        setStatusText("Creating your interactive study space...");

        const book = await createBook({
          clerkId: userId,
          title: cleanTitle,
          author: "Author Unknown",
          persona: defaultVoiceId,
          fileURL: uploadedPdf.url,
          fileBlobKey: uploadedPdf.pathname,
          coverURL: coverUrl,
          coverBlobKey: coverBlobKey,
          fileSize: file.size,
        });

        if (!book.success) {
          throw new Error(
            typeof book.error === "string" ? book.error : "Failed to create book record",
          );
        }

        // Step 6: Save Segments for AI and LivingReader
        setProgress(95);
        setStatusText("Synthesizing learning nodes and active recall index...");

        const segments = await saveBookSegments(
          book.data._id,
          userId,
          parsedPDF.content,
        );

        if (!segments.success) {
          throw new Error("Failed to index book segments.");
        }

        // Done!
        setProgress(100);
        setStage("ready");
        setStatusText("Synthesis complete! Opening study studio...");

        setTimeout(() => {
          router.push(`/books/${book.data.slug}`);
        }, 600);
      } catch (err) {
        console.error("Direct upload failed:", err);
        setStage("error");
        setErrorMsg(
          err instanceof Error ? err.message : "Upload failed. Please try again.",
        );
      }
    },
    [userId, defaultVoiceId, router],
  );

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
    // reset input so the same file can be re-selected if needed
    e.target.value = "";
  };

  const handleClose = () => {
    if (stage === "reading" || stage === "uploading" || stage === "saving") {
      if (
        !window.confirm(
          "Synthesis is in progress. Are you sure you want to cancel?",
        )
      ) {
        return;
      }
    }
    setIsOpen(false);
    setSelectedFile(null);
    setCoverPreview(null);
    setStage("idle");
    setProgress(0);
    setErrorMsg(null);
  };

  return (
    <>
      {/* Hidden File Input for Direct Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Main Direct Add Book Button */}
      {variant === "compact" ? (
        <button
          type="button"
          onClick={handleButtonClick}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ink)] bg-[color:var(--orange)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[color:var(--ink)] shadow-xs transition-transform hover:-translate-y-0.5 cursor-pointer active:translate-y-0",
            className,
          )}
          title="Directly upload any PDF book or lecture"
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
            className,
          )}
          title="Directly upload any PDF book or lecture"
        >
          <Plus className="size-4 stroke-[3]" />
          Add Book
        </button>
      )}

      {/* Direct Upload & Synthesis Modal Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-6 sm:p-7 shadow-frame">
            {/* Close Button */}
            <button
              type="button"
              onClick={handleClose}
              className="absolute right-5 top-5 rounded-full border border-[color:var(--ink)]/30 p-1.5 text-[color:var(--ink)] hover:bg-[color:var(--ink)]/10 transition-colors cursor-pointer"
            >
              <X className="size-4" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="flex size-11 items-center justify-center rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--orange)] text-[color:var(--ink)]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <h3 className="display text-xl font-bold text-[color:var(--ink)]">
                  Direct Book Synthesis
                </h3>
                <p className="text-xs text-[color:var(--ink)] opacity-75">
                  Transforming PDF into your interactive living reader
                </p>
              </div>
            </div>

            {/* Book Preview Card */}
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
                <div className="flex items-center gap-2 mt-1 text-[11px] text-[color:var(--ink)] opacity-70">
                  <span>
                    {selectedFile
                      ? `${(selectedFile.size / 1024 / 1024).toFixed(1)} MB`
                      : "PDF"}
                  </span>
                  {pageCount && (
                    <>
                      <span>•</span>
                      <span>{pageCount} pages</span>
                    </>
                  )}
                  <span>•</span>
                  <span>Voice: Rachel</span>
                </div>
              </div>
            </div>

            {/* Progress Section */}
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

              {/* Progress Bar */}
              <div className="h-3 w-full overflow-hidden rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] p-0.5">
                <div
                  className="h-full rounded-full bg-[color:var(--orange)] transition-all duration-300 ease-out"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {/* Pipeline Step Indicators */}
              <div className="grid grid-cols-4 gap-2 pt-2 text-center text-[10px] font-bold uppercase tracking-wider text-[color:var(--ink)]">
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 25
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/30"
                      : "border-transparent opacity-40"
                  }`}
                >
                  1. Parse
                </div>
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 50
                      ? "border-[color:var(--ink)] bg-[color:var(--orange)]/30"
                      : "border-transparent opacity-40"
                  }`}
                >
                  2. Upload
                </div>
                <div
                  className={`rounded-lg py-1 border ${
                    progress >= 85
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

            {/* Error Message if any */}
            {stage === "error" && errorMsg && (
              <div className="mt-4 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800 flex items-center justify-between">
                <span>{errorMsg}</span>
                <button
                  type="button"
                  onClick={() => selectedFile && startDirectUpload(selectedFile)}
                  className="font-bold underline uppercase tracking-wider hover:opacity-80 cursor-pointer ml-3 shrink-0"
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
