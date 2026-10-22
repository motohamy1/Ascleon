import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { getUserSessions, SessionHistoryItem } from '@/lib/actions/session.actions';

const formatDuration = (seconds: number) => {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

const RevisionPage = async () => {
  const { userId } = await auth();
  if (!userId) redirect('/');

  const sessionsResult = await getUserSessions(40);
  const sessions = sessionsResult.success
    ? (sessionsResult.data as SessionHistoryItem[])
    : [];

  const totalMinutes = Math.round(
    sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60,
  );

  return (
    <main className="mx-auto w-full max-w-[1580px] px-3 pt-[108px] pb-16 sm:px-4 sm:pt-[116px] acid-bg">
      <div className="rounded-[32px] bg-[color:var(--ink)] p-3 shadow-frame sm:p-4">
        <div className="flex flex-col gap-3">
          {/* HEADER + LOG STATS */}
          <section className="grid gap-3 lg:grid-cols-12">
            <div className="flex flex-col justify-between rounded-[22px] bg-[color:var(--cream)] p-6 sm:p-9 lg:col-span-8">
              <div className="flex items-center justify-between gap-6">
                <p className="meta-label text-[color:var(--ink)]/70">
                  Revision · the logbook
                </p>
                <div className="barcode h-7 w-20 text-[color:var(--ink)]" />
              </div>
              <h1 className="display mt-8 text-[clamp(2.6rem,6vw,4.6rem)] text-[color:var(--ink)]">
                Replay &amp; re-think.
              </h1>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
                Every conversation you&apos;ve had with a book, in one place.
                Open the reader again and pick up the thread.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:col-span-4">
              <div className="card-lift flex flex-col justify-between rounded-[18px] bg-[color:var(--orange)] p-5">
                <p className="meta-label text-[color:var(--ink)]/70">
                  Sessions
                </p>
                <p className="display mt-6 text-[44px] text-[color:var(--ink)]">
                  {sessions.length}
                </p>
              </div>
              <div className="card-lift flex flex-col justify-between rounded-[18px] bg-[color:var(--panel)] p-5">
                <p className="meta-label text-[color:var(--ink)]/55">
                  Minutes logged
                </p>
                <p className="display mt-6 text-[44px] text-[color:var(--ink)]">
                  {totalMinutes}
                </p>
              </div>
              <div className="col-span-2 flex items-center justify-between rounded-[18px] bg-[color:var(--ink)] p-5 text-[color:var(--cream)]">
                <p className="meta-label text-[color:var(--cream)]/55">
                  Second pass
                </p>
                <div className="chrome-sphere size-10" />
              </div>
            </div>
          </section>

          {/* LOG LIST */}
          <section className="rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center gap-4 py-14 text-center">
                <div className="chrome-sphere-violet size-14" />
                <h2 className="display text-[30px] text-[color:var(--ink)]">
                  Nothing to revise yet.
                </h2>
                <p className="max-w-sm text-[13px] font-medium leading-relaxed text-[color:var(--ink)]/60">
                  Once you talk with a book, every session is logged here for a
                  second pass.
                </p>
                <Link
                  href="/library"
                  className="group mt-1 inline-flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-6 py-3 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5"
                >
                  Open the library
                  <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </Link>
              </div>
            ) : (
              <ul className="flex flex-col divide-y divide-[color:var(--ink)]/10">
                {sessions.map((s) => (
                  <li key={s._id}>
                    <Link
                      href={`/books/${s.bookSlug}`}
                      className="group flex items-center gap-4 rounded-lg px-2 py-3.5 transition-colors hover:bg-[color:var(--ink)]/[0.04]"
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-[color:var(--paper)]">
                        {s.bookCoverURL && (
                          <Image
                            src={s.bookCoverURL}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[color:var(--ink)]">
                          {s.bookTitle}
                        </p>
                        <p className="meta-label mt-0.5 text-[color:var(--ink)]/50">
                          {formatDate(s.startedAt)}
                        </p>
                      </div>
                      <p className="shrink-0 text-[13px] font-bold text-[color:var(--ink)]/70">
                        {formatDuration(s.durationSeconds)}
                      </p>
                      <ArrowUpRight className="size-4 shrink-0 text-[color:var(--ink)]/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </main>
  );
};

export default RevisionPage;
