import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { IBook, UserStudyProgressData } from '@/types';
import { SessionHistoryItem } from '@/lib/actions/session.actions';
import { AscleonLogo } from '@/components/ui/AscleonLogo';

interface ProgressViewProps {
  books: IBook[];
  sessions: SessionHistoryItem[];
  firstName: string | null;
  latestStudyProgress?: UserStudyProgressData | null;
}

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const formatDuration = (seconds: number) => {
  const m = Math.max(1, Math.round(seconds / 60));
  return `${m} min`;
};

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });

const greetingPeriod = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

// Sessions-per-day minutes for the last 7 days (oldest first)
const computeLastWeek = (sessions: SessionHistoryItem[]) => {
  const days: { key: string; letter: string; minutes: number; isToday: boolean }[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toDateString();
    days.push({
      key,
      letter: DAY_LETTERS[d.getDay()],
      minutes: 0,
      isToday: i === 0,
    });
  }
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const s of sessions) {
    const d = byKey.get(new Date(s.startedAt).toDateString());
    if (d) d.minutes += Math.round((s.durationSeconds ?? 0) / 60);
  }
  return days;
};

const StatTile = ({
  value,
  label,
  cardClass = 'bg-[color:var(--panel)] text-[color:var(--ink)]',
  dimClass = 'text-[color:var(--ink)]/55',
}: {
  value: number | string;
  label: string;
  cardClass?: string;
  dimClass?: string;
}) => (
  <div className={`card-lift flex min-h-[130px] sm:min-h-[155px] lg:min-h-[175px] flex-col justify-between rounded-[22px] p-5 sm:p-6 shadow-chip ${cardClass}`}>
    <p className="display text-[38px] sm:text-[44px] lg:text-[48px] leading-none">{value}</p>
    <p className={`meta-label mt-2 text-xs sm:text-[13px] ${dimClass}`}>{label}</p>
  </div>
);

const ProgressView = ({
  books,
  sessions,
  firstName,
  latestStudyProgress,
}: ProgressViewProps) => {
  const name = (firstName ?? 'reader').toUpperCase();
  const favorites = books.filter((b) => b.isFavorite).length;
  const minutes = Math.round(
    sessions.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0) / 60,
  );

  const week = computeLastWeek(sessions);
  const peak = Math.max(1, ...week.map((d) => d.minutes));
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);

  const statusCounts = {
    read: books.filter((b) => b.readingStatus === 'read').length,
    in_progress: books.filter((b) => b.readingStatus === 'in_progress').length,
    not_started: books.filter(
      (b) => !b.readingStatus || b.readingStatus === 'not_started',
    ).length,
  };
  const statusTotal = books.length;

  // Resume target: book from latest study progress > latest voice session > in-progress book > newest book
  const targetStudyBook = latestStudyProgress
    ? books.find((b) => b.slug === latestStudyProgress.bookSlug)
    : null;

  const resume =
    (targetStudyBook && {
      href: `/books/${targetStudyBook.slug}`,
      title: targetStudyBook.title,
      cover: targetStudyBook.coverURL,
      page: latestStudyProgress?.lastStudiedPage,
      totalPages: latestStudyProgress?.totalPages,
      progressPercent: latestStudyProgress?.progressPercent,
      activeIntent: latestStudyProgress?.studioState?.activeIntent,
    }) ??
    (sessions[0]?.bookSlug && {
      href: `/books/${sessions[0].bookSlug}`,
      title: sessions[0].bookTitle,
      cover: sessions[0].bookCoverURL,
      page: undefined,
      totalPages: undefined,
      progressPercent: undefined,
      activeIntent: undefined,
    }) ??
    (books.find((b) => b.readingStatus === 'in_progress') ?? books[0]) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* ROW 1 — journey header + pick up where you left */}
      <section className="grid gap-3 md:grid-cols-12">
        <div className="flex min-h-[310px] sm:min-h-[340px] lg:min-h-[370px] flex-col justify-between rounded-[24px] bg-[color:var(--cream)] p-6 sm:p-9 lg:p-10 md:col-span-7 lg:col-span-8">
          <div className="flex items-start justify-between gap-6">
            <div className="flex items-center gap-2">
              <p className="meta-label text-[color:var(--ink)]/70">
                Progress · the journey
              </p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/20 bg-[#7fd8c9] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--ink)]">
                <span className="size-1.5 rounded-full bg-[color:var(--ink)] animate-pulse" />
                Live Sync
              </span>
            </div>
            <div className="flex size-14 shrink-0 items-center justify-center">
              <AscleonLogo size={56} className="transition-transform duration-200 hover:scale-105" />
            </div>
          </div>
          <div>
            <h1 className="display text-[color:var(--ink)] text-[clamp(2.6rem,6vw,5.2rem)] leading-[0.98]">
              {greetingPeriod()},
              <br />
              {name}.
            </h1>
            <p className="mt-5 max-w-md text-[15px] sm:text-base leading-relaxed text-[color:var(--ink-soft)]">
              Your whole study run in one view — the sessions, the minutes and
              the heavy books you are out-muscling. Med-school dense counts
              double.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 md:col-span-5 lg:col-span-4">
          {resume ? (
            <Link
              href={resume.href}
              className="card-lift group flex min-h-[310px] sm:min-h-[340px] lg:min-h-[370px] flex-1 cursor-pointer flex-col justify-between gap-5 rounded-[24px] bg-[color:var(--orange)] p-6 sm:p-7 shadow-chip"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="meta-label text-[color:var(--ink)]/80">
                  Pick it up
                </p>
                <ArrowUpRight className="size-8 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </div>
              <div className="flex items-end gap-5">
                <div className="relative h-36 w-26 sm:h-42 sm:w-30 shrink-0 overflow-hidden rounded-xl border-2 border-[color:var(--ink)]/20 bg-white/40 shadow-sm">
                  {resume.cover && (
                    <Image
                      src={resume.cover}
                      alt={resume.title}
                      fill
                      sizes="144px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="meta-label text-[color:var(--ink)]/70">
                    Continue reading
                  </p>
                  <h2 className="display mt-1 line-clamp-2 text-[24px] sm:text-[28px] leading-[1.05] text-[color:var(--ink)]">
                    {resume.title}
                  </h2>
                  {"progressPercent" in resume && typeof (resume as any).progressPercent === "number" && (
                    <div className="mt-3 flex flex-col gap-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[color:var(--ink)]/80">
                        <span>Page {(resume as any).page} of {(resume as any).totalPages}</span>
                        <span>{(resume as any).progressPercent}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--ink)]/15">
                        <div
                          className="h-full bg-[color:var(--ink)] transition-all duration-700 ease-out"
                          style={{ width: `${(resume as any).progressPercent}%` }}
                        />
                      </div>
                      {(resume as any).activeIntent && (
                        <span className="text-[9.5px] font-bold uppercase tracking-wider text-[color:var(--ink)]/65">
                          Studio: {(resume as any).activeIntent}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/library"
              className="card-lift group flex min-h-[310px] sm:min-h-[340px] lg:min-h-[370px] flex-1 cursor-pointer flex-col justify-between rounded-[24px] bg-[color:var(--orange)] p-6 sm:p-7 shadow-chip"
            >
              <p className="meta-label text-[color:var(--ink)]/80">
                The journey starts here
              </p>
              <div>
                <h2 className="display text-[38px] sm:text-[44px] leading-[1.05] text-[color:var(--ink)]">
                  Add your
                  <br />
                  first book.
                </h2>
                <div className="mt-6 flex items-center justify-between">
                  <p className="text-sm font-bold text-[color:var(--ink)]/80">
                    Progress begins on page one.
                  </p>
                  <ArrowUpRight className="size-8 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
                </div>
              </div>
            </Link>
          )}
        </div>
      </section>

      {/* ROW 2 — the study log (real data) */}
      <section className="grid gap-3 md:grid-cols-12">
        {/* 7-day session chart */}
        <div className="flex min-h-[200px] sm:min-h-[225px] lg:min-h-[245px] flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-7 shadow-chip md:col-span-5 lg:col-span-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="meta-label text-[color:var(--ink)]/60">
              Study log · last 7 days
            </p>
            <p className="text-sm font-bold text-[color:var(--ink)]">
              {weekMinutes} min
            </p>
          </div>

          <div className="my-auto py-2.5 flex h-28 sm:h-32 items-end gap-2 sm:gap-2.5">
            {week.map((d) => (
              <div key={d.key} className="group/b flex flex-1 flex-col items-center gap-2">
                <div
                  title={`${d.minutes} min`}
                  className="w-full rounded-full transition-transform duration-200 group-hover/b:scale-y-[1.03] origin-bottom"
                  style={{
                    height: `${d.minutes > 0 ? Math.max(10, (d.minutes / peak) * 100) : 6}%`,
                    backgroundColor: d.isToday
                      ? 'var(--orange)'
                      : d.minutes > 0
                        ? '#7fd8c9'
                        : 'color-mix(in srgb, var(--ink) 12%, transparent)',
                  }}
                />
                <span
                  className={`meta-label text-[10px] ${d.isToday ? 'text-[color:var(--ink)] font-bold' : 'text-[color:var(--ink)]/40'}`}
                >
                  {d.letter}
                </span>
              </div>
            ))}
          </div>
          {sessions.length === 0 && (
            <p className="mt-2 text-[12.5px] font-medium text-[color:var(--ink)]/55">
              No sessions this week yet. Open a book and the log fills itself.
            </p>
          )}
        </div>

        {/* Row of own stats */}
        <div className="grid grid-cols-2 gap-3 md:col-span-7 lg:col-span-8 lg:grid-cols-4">
          <StatTile
            value={books.length}
            label="Books on shelf"
            cardClass="bg-[color:var(--panel)] text-[color:var(--ink)]"
            dimClass="text-[color:var(--ink)]/55"
          />
          <StatTile
            value={sessions.length}
            label="Sessions logged"
            cardClass="bg-[#7fd8c9] text-[color:var(--ink)]"
            dimClass="text-[color:var(--ink)]/70"
          />
          <StatTile
            value={minutes}
            label="Minutes in conversation"
            cardClass="bg-[color:var(--orange)] text-[color:var(--ink)]"
            dimClass="text-[color:var(--ink)]/75"
          />
          <StatTile
            value={favorites}
            label="Marked favorites"
            cardClass="bg-[color:var(--ink)] text-[color:var(--cream)]"
            dimClass="text-[color:var(--cream)]/60"
          />
        </div>
      </section>

      {/* ROW 3 — shelf status ramp + recent sessions + actions */}
      <section className="grid gap-3 md:grid-cols-12">
        {/* Reading-status distribution */}
        <div className="flex min-h-[260px] sm:min-h-[290px] flex-col justify-between rounded-[22px] bg-[color:var(--cream)] p-5 sm:p-7 md:col-span-6 lg:col-span-4">
          <div>
            <p className="meta-label text-[color:var(--ink)]/60">Shelf status</p>

            {statusTotal === 0 ? (
              <p className="mt-4 text-[13.5px] font-medium leading-relaxed text-[color:var(--ink)]/70">
                Nothing shelved yet — upload a book and this ramp starts moving.
              </p>
            ) : (
              <>
                <div className="mt-5 flex h-10 gap-1 overflow-hidden rounded-full border-2 border-[color:var(--ink)]">
                  {statusCounts.in_progress > 0 && (
                    <div
                      className="h-full bg-[color:var(--orange)]"
                      style={{ width: `${(statusCounts.in_progress / statusTotal) * 100}%` }}
                    />
                  )}
                  {statusCounts.read > 0 && (
                    <div
                      className="h-full bg-[#7fd8c9]"
                      style={{ width: `${(statusCounts.read / statusTotal) * 100}%` }}
                    />
                  )}
                  {statusCounts.not_started > 0 && (
                    <div
                      className="h-full bg-[color:var(--cream-deep)]"
                      style={{ width: `${(statusCounts.not_started / statusTotal) * 100}%` }}
                    />
                  )}
                </div>
                <ul className="meta-label mt-4 flex flex-col gap-2 text-[color:var(--ink)]/60">
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[color:var(--orange)]" />
                      In progress
                    </span>
                    <span className="font-bold text-[color:var(--ink)]">{statusCounts.in_progress}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[#7fd8c9]" />
                      Read
                    </span>
                    <span className="font-bold text-[color:var(--ink)]">{statusCounts.read}</span>
                  </li>
                  <li className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full bg-[color:var(--cream-deep)]" />
                      Not started
                    </span>
                    <span className="font-bold text-[color:var(--ink)]">{statusCounts.not_started}</span>
                  </li>
                </ul>
              </>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-[color:var(--ink)]/10 text-xs font-semibold text-[color:var(--ink)]/60">
            {statusTotal} {statusTotal === 1 ? 'total title' : 'total titles'} tracked
          </div>
        </div>

        {/* Recent sessions */}
        <div className="flex min-h-[260px] sm:min-h-[290px] flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-7 md:col-span-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-4">
            <p className="meta-label text-[color:var(--ink)]/60">
              Recent sessions
            </p>
            {sessions.length > 0 && (
              <Link
                href="/space/revision"
                className="group flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--ink)]"
              >
                Full history
                <ArrowUpRight className="size-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            )}
          </div>

          {sessions.length === 0 ? (
            <div className="flex flex-col items-start gap-3 py-10 my-auto">
              <p className="display text-[26px] text-[color:var(--ink)]">
                Nothing on tape yet.
              </p>
              <p className="max-w-sm text-sm font-medium leading-relaxed text-[color:var(--ink)]/60">
                Open a book, press the mic, and start asking. Every session
                lands here afterwards.
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-[color:var(--ink)]/10 my-auto">
              {sessions.slice(0, 4).map((s) => (
                <li key={s._id}>
                  <Link
                    href={`/books/${s.bookSlug}`}
                    className="group flex items-center gap-4 rounded-xl px-2.5 py-3 transition-colors hover:bg-[color:var(--ink)]/[0.04]"
                  >
                    <div className="relative h-15 w-11 shrink-0 overflow-hidden rounded-lg bg-[color:var(--paper)] shadow-xs">
                      {s.bookCoverURL && (
                        <Image
                          src={s.bookCoverURL}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[color:var(--ink)]">
                        {s.bookTitle}
                      </p>
                      <p className="meta-label mt-0.5 text-[color:var(--ink)]/55">
                        {formatDate(s.startedAt)} · {formatDuration(s.durationSeconds)}
                      </p>
                    </div>
                    <ArrowUpRight className="size-4 shrink-0 text-[color:var(--ink)]/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 pt-3 border-t border-[color:var(--ink)]/10 text-xs font-semibold text-[color:var(--ink)]/60">
            {sessions.length} {sessions.length === 1 ? 'session recorded' : 'total sessions recorded'}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-col sm:flex-row lg:flex-col justify-between gap-3 md:col-span-12 lg:col-span-3">
          <Link
            href="/library"
            className="card-lift group flex min-h-[125px] sm:min-h-[140px] flex-1 cursor-pointer items-start justify-between gap-4 rounded-[22px] bg-[color:var(--ink)] p-5 sm:p-6 text-[color:var(--cream)] shadow-chip"
          >
            <div>
              <p className="meta-label text-[color:var(--cream)]/55">
                Quick action
              </p>
              <h3 className="display mt-2 text-[26px] sm:text-[28px]">Add a book</h3>
              <div className="barcode mt-3 h-7 w-full max-w-[120px] text-[color:var(--cream)]" />
            </div>
            <ArrowUpRight className="size-6 shrink-0 transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
          </Link>

          <Link
            href="/library"
            className="card-lift group flex min-h-[125px] sm:min-h-[140px] flex-1 cursor-pointer items-start justify-between gap-4 rounded-[22px] bg-[#7fd8c9] p-5 sm:p-6 text-[color:var(--ink)] shadow-chip border-2 border-[color:var(--ink)]"
          >
            <div>
              <p className="meta-label text-[color:var(--ink)]/70">Browse</p>
              <h3 className="display mt-2 text-[26px] sm:text-[28px] text-[color:var(--ink)]">
                The library
              </h3>
            </div>
            <ArrowUpRight className="size-6 shrink-0 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default ProgressView;
