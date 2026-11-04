"use client";

import React, { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Upload, ImageIcon, LogIn, Sparkles, AlertCircle } from "lucide-react";
import { UploadSchema } from "@/lib/zod";
import { BookUploadFormValues } from "@/types";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ACCEPTED_PDF_TYPES,
  ACCEPTED_IMAGE_TYPES,
  DEFAULT_VOICE,
  voiceOptions,
} from "@/lib/constants";
import FileUploader from "./FileUploader";
import VoiceSelector from "./VoiceSelector";
import LoadingOverlay from "./LoadingOverlay";
import { useAuth, useClerk } from "@clerk/nextjs";
import { toast } from "sonner";
import {
  checkBookExists,
  createBook,
  saveBookSegments,
} from "@/lib/actions/book.actions";
import {
  saveCoverImageAction,
} from "@/lib/actions/storage.actions";
import { uploadPdfWithProgress } from "@/lib/storage/client-upload";
import { useRouter } from "next/navigation";
import { parsePDFFile, withRetry } from "@/lib/utils";
import { cachePdfBuffer } from "@/lib/storage/pdf-local-cache";

const UploadForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Synthesizing book...");
  const [isMounted, setIsMounted] = useState(false);
  const { userId, isSignedIn, isLoaded } = useAuth();
  const clerk = useClerk();
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const defaultVoiceId =
    voiceOptions[DEFAULT_VOICE as keyof typeof voiceOptions]?.id ||
    voiceOptions.rachel.id;

  const form = useForm<BookUploadFormValues>({
    resolver: zodResolver(UploadSchema),
    defaultValues: {
      title: "",
      author: "",
      persona: defaultVoiceId,
      pdfFile: undefined,
      coverImage: undefined,
    },
  });

  const onSubmit = async (data: BookUploadFormValues) => {
    if (!isLoaded) return;

    if (!isSignedIn || !userId) {
      toast.error("Please sign in to upload books to your personal library.");
      clerk.openSignIn({
        fallbackRedirectUrl: "/books/new",
        signUpFallbackRedirectUrl: "/books/new",
      });
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("Checking title availability...");

    try {
      const existsCheck = await checkBookExists(data.title);

      if (existsCheck && existsCheck.exists && existsCheck.book) {
        toast.info("A book with this title already exists in your library.");
        form.reset();
        router.push(`/books/${existsCheck.book.slug}`);
        return;
      }

      const fileTitle = data.title.replace(/\s+/g, "-").toLowerCase();
      const pdfFile = data.pdfFile;

      setStatusMessage("Parsing PDF & extracting text chapters...");
      const parsedPDF = await parsePDFFile(pdfFile);

      if (!parsedPDF.content || parsedPDF.content.length === 0) {
        toast.error("Failed to extract readable content from PDF. Please try another file.");
        setIsSubmitting(false);
        return;
      }

      setStatusMessage("Digesting study source & uploading to cloud in parallel...");

      // Task A: PDF Upload with live MB progress and smart stall detection
      const uploadPdfTask = async () => {
        return await uploadPdfWithProgress(pdfFile, {
          onProgress: (p) => {
            setStatusMessage(
              `Uploading PDF (${(p.loaded / 1024 / 1024).toFixed(1)} / ${(p.total / 1024 / 1024).toFixed(1)} MB)...`
            );
          },
          onStatus: (st) => {
            setStatusMessage(st);
          },
        });
      };

      // Task B: Cover Upload with Non-Blocking Fallback
      const uploadCoverTask = async () => {
        let coverUrl = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";
        let coverBlobKey = "";

        if (data.coverImage) {
          try {
            const coverFile = data.coverImage;
            const reader = new FileReader();
            const base64Promise = new Promise<string>((resolve, reject) => {
              reader.onload = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(coverFile);
            });
            const base64Data = await base64Promise;
            const coverRes = await saveCoverImageAction(base64Data, `${fileTitle}_cover.png`);
            if (coverRes.success && coverRes.data) {
              coverUrl = coverRes.data.url;
              coverBlobKey = coverRes.data.key;
            }
          } catch (coverErr) {
            console.warn("Custom cover upload failed, using default cover fallback:", coverErr);
          }
        } else if (parsedPDF.cover && parsedPDF.cover.startsWith("data:image")) {
          try {
            const coverRes = await saveCoverImageAction(parsedPDF.cover, `${fileTitle}_cover.webp`);
            if (coverRes.success && coverRes.data) {
              coverUrl = coverRes.data.url;
              coverBlobKey = coverRes.data.key;
            }
          } catch (coverErr) {
            console.warn("Cover upload failed, using fallback:", coverErr);
          }
        }
        return { coverUrl, coverBlobKey };
      };

      // Task C: AI Deep Source Digestion
      const digestTask = async () => {
        try {
          const digestRes = await fetch("/api/books/digest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: data.title,
              author: data.author || "Author Unknown",
              totalPages: parsedPDF.numPages,
              textPreview: parsedPDF.textPreview,
            }),
          });
          if (digestRes.ok) {
            const d = await digestRes.json();
            return d?.blueprint || null;
          }
        } catch (dErr) {
          console.warn("AI digestion non-fatal warning:", dErr);
        }
        return null;
      };

      const [pdfUploadRes, coverUploadRes, digestBlueprint] = await Promise.all([
        uploadPdfTask(),
        uploadCoverTask(),
        digestTask(),
      ]);

      // Cache in IndexedDB immediately for instant reader opening
      pdfFile.arrayBuffer().then((buf) => {
        cachePdfBuffer(pdfUploadRes.url, buf);
      }).catch(() => {});

      setStatusMessage("Creating your interactive study space...");
      const book = await createBook({
        clerkId: userId,
        title: data.title,
        author: data.author || "Author Unknown",
        persona: data.persona || defaultVoiceId,
        fileURL: pdfUploadRes.url,
        fileBlobKey: pdfUploadRes.key,
        coverURL: coverUploadRes.coverUrl,
        coverBlobKey: coverUploadRes.coverBlobKey,
        fileSize: pdfFile.size,
        totalPages: parsedPDF.numPages,
        totalSegments: parsedPDF.content.length,
        topic: digestBlueprint?.topic || "General",
        summary: digestBlueprint?.summary || "",
        sourceCategory: digestBlueprint?.sourceCategory || "textbook",
        domain: digestBlueprint?.domain,
        subspecialty: digestBlueprint?.subspecialty,
        pedagogicalStyle: digestBlueprint?.pedagogicalStyle,
        ingestionStatus: "processing",
        blueprint: digestBlueprint || {},
      });

      if (!book.success) {
        toast.error(
          typeof book.error === "string" ? book.error : "Failed to create book",
        );
        if ("isBillingError" in book && book.isBillingError) {
          router.push("/subscriptions");
        }
        setIsSubmitting(false);
        return;
      }

      setStatusMessage("Synthesizing learning pages & knowledge index...");
      const allSegments = parsedPDF.content;
      const CHUNK_SIZE = 60;
      const totalChunks = Math.ceil(allSegments.length / CHUNK_SIZE);

      for (let c = 0; c < totalChunks; c++) {
        const chunk = allSegments.slice(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE);
        if (totalChunks > 1) {
          setStatusMessage(
            `Synthesizing learning pages (${Math.min((c + 1) * CHUNK_SIZE, allSegments.length)} of ${allSegments.length})...`,
          );
        }

        await withRetry(
          async () => {
            const res = await saveBookSegments(book.data._id, userId, chunk, {
              isAppend: c > 0,
              totalExpectedSegments: allSegments.length,
            });

            if (!res.success) {
              throw new Error(
                typeof res.error === "string"
                  ? res.error
                  : "Failed to save book segments",
              );
            }
          },
          { retries: 3, delayMs: 1000 }
        );
      }

      // Trigger whole-source background topic ingestion worker asynchronously
      fetch("/api/books/ingest-background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId: book.data._id }),
      }).catch((e) => console.warn("Background ingestion trigger notice:", e));

      toast.success("Book uploaded successfully! Opening interactive study...");
      form.reset();
      router.push(`/books/${book.data.slug}`);
    } catch (error) {
      console.error("Upload error:", error);
      const msg =
        error instanceof Error
          ? error.message
          : "Failed to upload book. Please try again later.";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isMounted) return null;

  return (
    <>
      {isSubmitting && <LoadingOverlay isVisible={true} />}

      <div className="w-full">
        {/* Authentication Notice if Guest */}
        {isLoaded && !isSignedIn && (
          <div className="mb-6 flex flex-col items-center justify-between gap-3 rounded-2xl border-2 border-[color:var(--ink)] bg-[color:var(--orange)]/15 p-4 sm:flex-row">
            <div className="flex items-center gap-3">
              <AlertCircle className="size-5 shrink-0 text-[color:var(--ink)]" />
              <p className="text-xs font-semibold text-[color:var(--ink)]">
                You are currently browsing as a guest. Sign in to save books to your personal shelf and unlock live AI synthesis.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                clerk.openSignIn({
                  fallbackRedirectUrl: "/books/new",
                  signUpFallbackRedirectUrl: "/books/new",
                })
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 cursor-pointer"
            >
              <LogIn className="size-3.5" />
              Sign In
            </button>
          </div>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* 1 & 2. Uploaders Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FileUploader
                control={form.control}
                name="pdfFile"
                label="Book PDF File"
                acceptTypes={ACCEPTED_PDF_TYPES}
                icon={Upload}
                placeholder="Click to upload or drag & drop PDF"
                hint="PDF files up to 50MB"
                disabled={isSubmitting}
              />

              <FileUploader
                control={form.control}
                name="coverImage"
                label="Cover Image (Optional)"
                acceptTypes={ACCEPTED_IMAGE_TYPES}
                icon={ImageIcon}
                placeholder="Click to upload custom cover artwork"
                hint="Leave empty to auto-extract the first page from the PDF"
                disabled={isSubmitting}
              />
            </div>

            {/* 3 & 4. Title and Author Grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label">Book Title</FormLabel>
                    <FormControl>
                      <Input
                        className="form-input"
                        placeholder="e.g. Clean Architecture, Atomic Habits"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="author"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="form-label">Author Name</FormLabel>
                    <FormControl>
                      <Input
                        className="form-input"
                        placeholder="e.g. Robert C. Martin"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* 5. Voice Selector */}
            <FormField
              control={form.control}
              name="persona"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="form-label">
                    Interactive Co-Reader Voice
                  </FormLabel>
                  <FormControl>
                    <VoiceSelector
                      value={field.value}
                      onChange={field.onChange}
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* 6. Submit Button */}
            <Button
              type="submit"
              className="form-btn flex items-center justify-center gap-2"
              disabled={isSubmitting}
            >
              <Sparkles className="size-5" />
              {isSubmitting ? statusMessage : "Begin Synthesis & Add to Library"}
            </Button>
          </form>
        </Form>
      </div>
    </>
  );
};

export default UploadForm;
