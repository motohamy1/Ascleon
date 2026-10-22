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
    (sessions[0]?.bookSlug &&
      books.find((b) => b.slug === sessions[0].bookSlug)) ||
    books.find((b) => b.readingStatus === 'in_progress') ||
    books[0] ||
    null;

  const queue = activeBook
    ? books
        .filter(
          (b) =>
            b._id !== activeBook._id &&
            b.readingStatus === 'in_progress',
        )
        .slice(0, 3)
    : [];

  return (
    <main className="mx-auto w-full max-w-[1580px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      <div className="rounded-[32px] bg-[color:var(--ink)] p-3 shadow-frame sm:p-4">
        <div className="flex flex-col gap-3">
          {/* HEADER STRIP */}
          <header className="flex items-center justify-between gap-4 rounded-[22px] bg-[color:var(--ink-soft)] p-5 sm:px-7">
            <div className="flex items-center gap-3">
              <span className="size-2.5 shrink-0 rounded-full bg-[color:var(--orange)]" />
              <p className="meta-label text-[color:var(--cream)]/70">
                Active Space · what&apos;s on the desk
              </p>
            </div>
            <p className="meta-label text-[color:var(--cream)]/45">
              {books.length} in rotation
            </p>
          </header>

          <section className="grid gap-3 lg:grid-cols-12">
            {/* CURRENT BOOK */}
            <div className="rounded-[22px] bg-[color:var(--cream)] p-6 sm:p-9 lg:col-span-8">
              {activeBook ? (
                <div className="flex flex-col gap-7 sm:flex-row sm:items-end">
                  <div className="relative h-62 w-42 shrink-0 overflow-hidden rounded-xl border-2 border-[color:var(--ink)]/15 bg-[color:var(--paper)] shadow-chip sm:h-70 sm:w-48">
                    {activeBook.coverURL && (
                      <Image
                        src={activeBook.coverURL}
                        alt={activeBook.title}
                        fill
                        sizes="192px"
                        className="object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="meta-label text-[color:var(--ink)]/60">
                      Currently opened
                    </p>
                    <h1 className="display mt-3 line-clamp-3 text-[clamp(1.9rem,4vw,3.4rem)] text-[color:var(--ink)]">
                      {activeBook.title}
                    </h1>
                    <p className="mt-3 text-[15px] font-semibold text-[color:var(--ink)]/70">
                      {activeBook.author}
                    </p>
                    <Link
                      href={`/books/${activeBook.slug}`}
                      className="group mt-7 inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5"
                    >
                      Open the reader
                      <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                  </div>
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
                  <Link
                    href="/books/new"
                    className="group inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5"
                  >
                    Add your first book
                    <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
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
                  <p className="mt-3 text-[13px] font-semibold leading-snug text-[color:var(--ink)]/75">
                    Sessions start inside the reader — the mic lives there.
                  </p>
                </div>
              </div>

              <div className="rounded-[22px] bg-[color:var(--panel)] p-5">
                <p className="meta-label text-[color:var(--ink)]/60">
                  Up next
                </p>
                {queue.length === 0 ? (
                  <p className="mt-3 text-[13px] font-medium text-[color:var(--ink)]/55">
                    Nothing queued. Your library decides the order.
                  </p>
                ) : (
                  <ul className="mt-3 flex flex-col divide-y divide-[color:var(--ink)]/10">
                    {queue.map((b) => (
                      <li key={b._id}>
                        <Link
                          href={`/books/${b.slug}`}
                          className="group flex items-center gap-3 py-2.5"
                        >
                          <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded-md bg-[color:var(--paper)]">
                            {b.coverURL && (
                              <Image
                                src={b.coverURL}
                                alt=""
                                fill
                                sizes="32px"
                                className="object-cover"
                              />
                            )}
                          </div>
                          <p className="min-w-0 flex-1 truncate text-[13px] font-bold text-[color:var(--ink)]">
                            {b.title}
                          </p>
                          <ArrowUpRight className="size-4 shrink-0 text-[color:var(--ink)]/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
};

export default ActiveSpacePage;
