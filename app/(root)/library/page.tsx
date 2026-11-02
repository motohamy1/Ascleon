import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Library as LibraryIcon, ArrowUpRight, BookOpen, Clock, Sparkles } from 'lucide-react';
import { AscleonLogo } from '@/components/ui/AscleonLogo';
import { getUserBooks } from '@/lib/actions/book.actions';
import { getUserSessions, SessionHistoryItem } from '@/lib/actions/session.actions';
import PersonalLibrary from '@/components/library/PersonalLibrary';
import Search from '@/components/Search';
import DirectBookUpload from '@/components/library/DirectBookUpload';
import { IBook } from '@/types';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

interface LibraryPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

const LibraryPage = async ({ searchParams }: LibraryPageProps) => {
  const { userId } = await auth();
  if (!userId) redirect('/');

  const params = await searchParams;
  const searchQuery = typeof params.search === 'string' ? params.search : undefined;

  const [bookResults, sessionsResult] = await Promise.all([
    getUserBooks(searchQuery),
    getUserSessions(6),
  ]);

  const books: IBook[] = bookResults.success
    ? (bookResults.data as IBook[]) ?? []
    : [];

  const sessions: SessionHistoryItem[] = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[]) ?? []
    : [];

  // Active Desk Book: latest session book > in_progress book > first book
  const lastSessionSlug = sessions[0]?.bookSlug;
  const activeBook =
    (lastSessionSlug ? books.find((b) => b.slug === lastSessionSlug) : null) ||
    books.find((b) => b.readingStatus === 'in_progress') ||
    books[0] ||
    null;

  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <div className="rounded-[24px] sm:rounded-[32px] bg-[color:var(--ink)] p-2.5 sm:p-4 shadow-frame">
        <header className="flex flex-col gap-4 rounded-[22px] bg-[color:var(--cream)] p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 shadow-chip">
          <div className="flex items-center gap-4">
            <AscleonLogo size={46} className="shadow-xs transition-transform duration-200 hover:scale-105" />
            <h1 className="display text-[42px] text-[color:var(--ink)] sm:text-[54px]">
              Library
            </h1>
            <span className="meta-label flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] px-3.5 py-1.5 text-[color:var(--ink)]">
              <LibraryIcon className="size-4" />
              {books.length} {books.length === 1 ? 'book' : 'books'}
            </span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Suspense fallback={<div className="h-11 w-64 rounded-full bg-[color:var(--panel)] animate-pulse" />}>
              <Search />
            </Suspense>
            <DirectBookUpload />
          </div>
        </header>

        {/* 1. Bookshelf & Filter Section */}
        <div className="mt-3 rounded-[22px] bg-[color:var(--panel)] p-4 sm:p-7 min-h-[320px] shadow-chip">
          <PersonalLibrary initialBooks={books} />
        </div>

        {/* 2. Active Desk Card Below the Shelf */}
        {activeBook && (
          <div className="mt-3 min-h-[260px] sm:min-h-[290px] rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-7 sm:p-9 shadow-chip">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="flex-1 space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--ink)]/30 bg-[color:var(--panel)] px-3.5 py-1 text-xs font-bold text-[color:var(--ink)]">
                    <span className="size-2 rounded-full bg-[#ff4c00] animate-pulse" />
                    Active Study Desk
                  </span>
                  {activeBook.totalPages ? (
                    <span className="font-mono text-xs font-semibold text-[color:var(--ink)]/60">
                      • {activeBook.totalPages} pages
                    </span>
                  ) : null}
                </div>

                <h2 className="display text-3xl sm:text-4xl text-[color:var(--ink)] leading-tight">
                  {activeBook.title}
                </h2>

                <p className="text-sm font-bold text-[color:var(--ink)]/80">
                  By {activeBook.author}
                </p>

                <p className="max-w-2xl text-xs sm:text-sm font-medium leading-relaxed text-[color:var(--ink)]/75">
                  Ready to jump back in? Open your living dual-pane Study Space with authentic PDF rendering, NotebookLM concept maps, and grounded AI mentoring.
                </p>

                <div className="pt-3">
                  <Link
                    href={`/books/${activeBook.slug}`}
                    className="group inline-flex items-center gap-2.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-7 py-3.5 text-xs font-black uppercase tracking-wider text-[color:var(--cream)] shadow-chip transition-transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                  >
                    <span>Enter Study Space</span>
                    <ArrowUpRight className="size-4.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              </div>

              {activeBook.coverURL && (
                <div className="relative mx-auto aspect-[2/3] w-34 sm:w-44 shrink-0 overflow-hidden rounded-2xl border-2 border-[color:var(--ink)] shadow-frame md:mx-0">
                  <Image
                    src={activeBook.coverURL}
                    alt={activeBook.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 176px"
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default LibraryPage;
