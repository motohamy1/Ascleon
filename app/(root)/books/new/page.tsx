import React from "react";
import Link from "next/link";
import { ArrowLeft, BookPlus } from "lucide-react";
import UploadForm from "@/components/UploadForm";

export const metadata = {
  title: "Add Book | Ascleon",
  description: "Upload a PDF to generate your interactive reading and study space.",
};

const NewBookPage = () => {
  return (
    <main className="mx-auto w-full max-w-[1000px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      <div className="rounded-[32px] bg-[color:var(--ink)] p-3 shadow-frame sm:p-5">
        {/* Header Card */}
        <header className="rounded-[22px] bg-[color:var(--cream)] p-5 sm:p-8 border-2 border-[color:var(--ink)]">
          <div className="mb-4">
            <Link
              href="/library"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[color:var(--ink)] opacity-75 hover:opacity-100 transition-opacity"
            >
              <ArrowLeft className="size-4" />
              Back to Library
            </Link>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[color:var(--orange)] border-2 border-[color:var(--ink)]">
                  <BookPlus className="size-5 text-[color:var(--ink)]" />
                </div>
                <h1 className="display text-[32px] text-[color:var(--ink)] sm:text-[40px]">
                  Add New Book
                </h1>
              </div>
              <p className="mt-2 text-sm text-[color:var(--ink)] opacity-80 max-w-xl">
                Upload your PDF lecture notes, textbooks, or study materials. Ascleon transforms them into an interactive study workspace with voice synthesis, dynamic concept morphs, and auto-generated quizzes.
              </p>
            </div>
          </div>
        </header>

        {/* Form Container */}
        <div className="mt-3 rounded-[18px] bg-[color:var(--panel)] p-4 sm:p-8 border border-[color:var(--ink)]/15">
          <UploadForm />
        </div>
      </div>
    </main>
  );
};

export default NewBookPage;
