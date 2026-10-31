import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getUserBooks } from '@/lib/actions/book.actions';
import {
  getUserSessions,
  SessionHistoryItem,
} from '@/lib/actions/session.actions';
import { IBook } from '@/types';
import AddBookButton from '@/components/library/AddBookButton';

const ActiveSpacePage = async () => {
  const { userId } = await auth();
  if (!userId) redirect('/');

  const booksResult = await getUserBooks();
  const books = (booksResult.success ? (booksResult.data as IBook[]) ?? [] : []);

  const sessionsResult = await getUserSessions(40);
  const sessions = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[])
    : [];

  const activeBook =
    books.find((b) => b.readingStatus === 'in_progress') || books[0] || null;

  const recentSessions = sessions.slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-[1580px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      <div className="rounded-[32px] bg-[color:var(--ink)] p-3 shadow-frame sm:p-4">
        {/* TOP STATUS BAR */}
        <header className="flex flex-col gap-3 rounded-[22px] bg-[color:var(--cream)] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
          <div className="flex items-center gap-4">
            <span className="live-dot" />
            <div>
              <p className="meta-label text-[color:var(--ink)]/70">Study Space</p>
              <h2 className="display text-2xl text-[color:var(--ink)] sm:text-3xl">
                Active Desk
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-[color:var(--ink)]">
            <span className="rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-1.5 shadow-xs">
              {books.length} Books on Shelf
            </span>
            <span className="rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-3 py-1.5 shadow-xs">
              {sessions.length} Study Sessions
            </span>
          </div>
        </header>

        {/* MAIN DESK GRID */}
        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-12">
          {/* ACTIVE READING HERO */}
          <div className="rounded-[22px] bg-[color:var(--cream)] p-6 shadow-chip sm:p-8 lg:col-span-8">
            {activeBook ? (
              <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="meta-label rounded-full border border-[color:var(--ink)]/30 bg-[color:var(--panel)] px-2.5 py-1 text-[color:var(--ink)]">
                      Current Book
                    </span>
                    <span className="meta-label text-[color:var(--ink)]/60">
                      • {activeBook.totalSegments || 0} segments
                    </span>
                  </div>

                  <h1 className="display text-[clamp(2rem,4vw,3.2rem)] leading-[1.05] text-[color:var(--ink)]">
                    {activeBook.title}
                  </h1>

                  <p className="text-sm font-semibold tracking-wide text-[color:var(--ink)]/80">
                    By {activeBook.author}
                  </p>

                  <p className="max-w-xl text-[15px] font-medium leading-relaxed text-[color:var(--ink)]/75">
                    Your reading desk is primed. Jump directly into your dual-pane interactive studio, explore the logic flow, or ask questions through live conversational AI.
                  </p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <Link
                      href={`/books/${activeBook.slug}`}
                      className="group inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--cream)] shadow-chip transition-transform hover:-translate-y-0.5"
                    >
                      Enter Study Space
                      <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                    <Link
                      href="/library"
                      className="inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] px-5 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-xs transition-colors hover:bg-[color:var(--cream)]"
                    >
                      Browse Shelf
                    </Link>
                  </div>
                </div>

                {activeBook.coverURL && (
                  <div className="relative mx-auto aspect-[2/3] w-48 shrink-0 overflow-hidden rounded-2xl border-2 border-[color:var(--ink)] shadow-frame md:mx-0">
                    <Image
                      src={activeBook.coverURL}
                      alt={activeBook.title}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, 192px"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-5 py-8">
                <div className="chrome-sphere size-16" />
                <h1 className="display text-[clamp(2.4rem,6vw,4.2rem)] text-[color:var(--ink)]">
                  Everything&apos;s quiet.
                </h1>
                <p className="max-w-sm text-[15px] font-medium leading-relaxed text-[color:var(--ink)]/70">
                  No book is open yet. Add one to the shelf and this desk
                  becomes your reading desk.
                </p>
                <AddBookButton />
              </div>
            )}
          </div>

          {/* SIDE STACK */}
          <div className="flex flex-col gap-3 lg:col-span-4">
            <div className="flex flex-1 flex-col justify-between rounded-[22px] bg-[color:var(--orange)] p-6 shadow-chip sm:min-h-[220px]">
              <p className="meta-label text-[color:var(--ink)]/80">
                Rules of the room
              </p>
              <div>
                <h2 className="display text-[34px] text-[color:var(--ink)]">
                  You talk.
                  <br />
                  It answers.
                </h2>
                <p className="mt-2 text-xs font-semibold text-[color:var(--ink)]/80">
                  Dual-panel layout pairs source text with instant active recall, logic trees, and voice synthesis.
                </p>
              </div>
            </div>

            <div className="rounded-[22px] bg-[color:var(--panel)] p-6 shadow-chip border border-[color:var(--ink)]/10">
              <p className="meta-label text-[color:var(--ink)]/60">
                Recent Activity
              </p>
              {recentSessions.length > 0 ? (
                <ul className="mt-3 space-y-2.5">
                  {recentSessions.map((s, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between text-xs text-[color:var(--ink)]/80"
                    >
                      <span className="font-semibold truncate max-w-[180px]">
                        Session #{idx + 1}
                      </span>
                      <span className="font-mono text-[11px] opacity-60">
                        {s.startedAt ? new Date(s.startedAt).toLocaleDateString() : 'Recent'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-[color:var(--ink)]/60">
                  No previous sessions yet. Start reading a book to log your study time.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default ActiveSpacePage;
