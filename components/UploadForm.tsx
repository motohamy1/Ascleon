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
import { useRouter } from "next/navigation";
import { parsePDFFile } from "@/lib/utils";
import { upload } from "@vercel/blob/client";

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

      setStatusMessage("Uploading PDF document to cloud storage...");
      const uploadedPdfBlob = await upload(`${fileTitle}.pdf`, pdfFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: "application/pdf",
      });

      let coverUrl: string;
      let coverBlobKey: string;

      setStatusMessage("Uploading book cover...");
      if (data.coverImage) {
        const coverFile = data.coverImage;
        const uploadedCoverBlob = await upload(
          `${fileTitle}_cover.png`,
          coverFile,
          {
            access: "public",
            handleUploadUrl: "/api/upload",
            contentType: coverFile.type || "image/png",
          },
        );
        coverUrl = uploadedCoverBlob.url;
        coverBlobKey = uploadedCoverBlob.pathname;
      } else if (parsedPDF.cover && parsedPDF.cover.startsWith("data:image")) {
        try {
          const response = await fetch(parsedPDF.cover);
          const blob = await response.blob();

          const uploadedCoverBlob = await upload(
            `${fileTitle}_cover.png`,
            blob,
            {
              access: "public",
              handleUploadUrl: "/api/upload",
              contentType: "image/png",
            },
          );
          coverUrl = uploadedCoverBlob.url;
          coverBlobKey = uploadedCoverBlob.pathname;
        } catch (coverErr) {
          console.warn("Cover upload failed, using fallback:", coverErr);
          coverUrl = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";
          coverBlobKey = "";
        }
      } else {
        coverUrl = "https://covers.openlibrary.org/b/isbn/9780132350884-L.jpg";
        coverBlobKey = "";
      }

      setStatusMessage("Creating your interactive book record...");
      const book = await createBook({
        clerkId: userId,
        title: data.title,
        author: data.author,
        persona: data.persona || defaultVoiceId,
        fileURL: uploadedPdfBlob.url,
        fileBlobKey: uploadedPdfBlob.pathname,
        coverURL: coverUrl,
        coverBlobKey: coverBlobKey,
        fileSize: pdfFile.size,
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

      setStatusMessage("Synthesizing learning segments & search index...");
      const segments = await saveBookSegments(
        book.data._id,
        userId,
        parsedPDF.content,
      );

      if (!segments.success) {
        toast.error("Failed to save book segments");
        throw new Error("Failed to save book segments");
      }

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
            {/* 1. PDF File Upload */}
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

            {/* 2. Cover Image Upload */}
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

            {/* 3. Title Input */}
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

            {/* 4. Author Input */}
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
