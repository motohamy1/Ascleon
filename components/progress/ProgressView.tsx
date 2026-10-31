import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { IBook } from '@/types';
import { SessionHistoryItem } from '@/lib/actions/session.actions';

interface ProgressViewProps {
  books: IBook[];
  sessions: SessionHistoryItem[];
  firstName: string | null;
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
}: {
  value: number | string;
  label: string;
}) => (
  <div className="card-lift rounded-[18px] bg-[color:var(--panel)] p-5">
    <p className="display text-[42px] text-[color:var(--ink)]">{value}</p>
    <p className="meta-label mt-1 text-[color:var(--ink)]/55">{label}</p>
  </div>
);

const ProgressView = ({ books, sessions, firstName }: ProgressViewProps) => {
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

  // Resume target: book from the latest session, else an in-progress book, else newest book
  const resume =
    (sessions[0]?.bookSlug && {
      href: `/books/${sessions[0].bookSlug}`,
      title: sessions[0].bookTitle,
      cover: sessions[0].bookCoverURL,
    }) ??
    (books.find((b) => b.readingStatus === 'in_progress') ?? books[0]) ?? null;

  return (
    <div className="flex flex-col gap-3">
      {/* ROW 1 — journey header + pick up where you left */}
      <section className="grid gap-3 lg:grid-cols-12">
        <div className="flex min-h-[300px] flex-col justify-between rounded-[22px] bg-[color:var(--cream)] p-6 sm:p-9 lg:col-span-8 lg:min-h-[340px]">
          <div className="flex items-start justify-between gap-6">
            <p className="meta-label text-[color:var(--ink)]/70">
              Progress · the journey
            </p>
            <div className="flex size-14 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--ink)]">
              <span className="display text-[15px] leading-none">BK®</span>
            </div>
          </div>
          <div>
            <h1 className="display text-[color:var(--ink)] text-[clamp(2.6rem,6vw,5rem)]">
              {greetingPeriod()},
              <br />
              {name}.
            </h1>
            <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[color:var(--ink-soft)]">
              Your whole study run in one view — the sessions, the minutes and
              the heavy books you are out-muscling. Med-school dense counts
              double.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-4">
          {resume ? (
            <Link
              href={resume.href}
              className="card-lift group flex flex-1 cursor-pointer flex-col justify-between gap-6 rounded-[22px] bg-[color:var(--orange)] p-6 shadow-chip"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="meta-label text-[color:var(--ink)]/80">
                  Pick it up
                </p>
                <ArrowUpRight className="size-7 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </div>
              <div className="flex items-end gap-4">
                <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-lg border-2 border-[color:var(--ink)]/20 bg-white/40">
                  {resume.cover && (
                    <Image
                      src={resume.cover}
                      alt={resume.title}
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="meta-label text-[color:var(--ink)]/70">
                    Continue reading
                  </p>
                  <h2 className="display mt-2 line-clamp-3 text-[27px] leading-[1.02] text-[color:var(--ink)]">
                    {resume.title}
                  </h2>
                </div>
              </div>
            </Link>
          ) : (
            <Link
              href="/library"
              className="card-lift group flex min-h-[280px] flex-1 cursor-pointer flex-col justify-between rounded-[22px] bg-[color:var(--orange)] p-6 shadow-chip"
            >
              <p className="meta-label text-[color:var(--ink)]/80">
                The journey starts here
              </p>
              <div>
                <h2 className="display text-[36px] text-[color:var(--ink)]">
                  Add your
                  <br />
                  first book.
                </h2>
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm font-semibold text-[color:var(--ink)]/80">
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
      <section className="grid gap-3 lg:grid-cols-12">
        {/* 7-day session chart */}
        <div className="rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6 lg:col-span-4">
          <div className="flex items-baseline justify-between gap-4">
            <p className="meta-label text-[color:var(--ink)]/60">
              Study log · last 7 days
            </p>
            <p className="text-[13px] font-bold text-[color:var(--ink)]">
              {weekMinutes} min
            </p>
          </div>

          <div className="mt-5 flex h-28 items-end gap-1.5 sm:gap-2">
            {week.map((d) => (
              <div key={d.key} className="group/b flex flex-1 flex-col items-center gap-1.5">
                <div
                  title={`${d.minutes} min`}
                  className="w-full rounded-full transition-transform duration-200 group-hover/b:scale-y-[1.03] origin-bottom"
                  style={{
                    height: `${d.minutes > 0 ? Math.max(8, (d.minutes / peak) * 100) : 4}%`,
                    backgroundColor: d.isToday
                      ? 'var(--orange)'
                      : d.minutes > 0
                        ? 'var(--ink)'
                        : 'color-mix(in srgb, var(--ink) 12%, transparent)',
                  }}
                />
                <span
                  className={`meta-label text-[9px] ${d.isToday ? 'text-[color:var(--ink)]' : 'text-[color:var(--ink)]/40'}`}
                >
                  {d.letter}
                </span>
              </div>
            ))}
          </div>
          {sessions.length === 0 && (
            <p className="mt-3 text-[12px] font-medium text-[color:var(--ink)]/55">
              No sessions this week yet. Open a book and the log fills itself.
            </p>
          )}
        </div>

        {/* Row of own stats */}
        <div className="grid grid-cols-2 gap-3 lg:col-span-8 lg:grid-cols-4">
          <StatTile value={books.length} label="Books on shelf" />
          <StatTile value={sessions.length} label="Sessions logged" />
          <StatTile value={minutes} label="Minutes in conversation" />
          <StatTile value={favorites} label="Marked favorites" />
        </div>
      </section>

      {/* ROW 3 — shelf status ramp + recent sessions + actions */}
      <section className="grid gap-3 lg:grid-cols-12">
        {/* Reading-status distribution */}
        <div className="rounded-[22px] bg-[color:var(--cream)] p-5 sm:p-6 lg:col-span-4">
          <p className="meta-label text-[color:var(--ink)]/60">Shelf status</p>

          {statusTotal === 0 ? (
            <p className="mt-3 text-[13px] font-medium text-[color:var(--ink)]/70">
              Nothing shelved yet — upload a book and this ramp starts moving.
            </p>
          ) : (
            <>
              <div className="mt-4 flex h-9 gap-1 overflow-hidden rounded-full border-2 border-[color:var(--ink)]">
                {statusCounts.in_progress > 0 && (
                  <div
                    className="h-full bg-[color:var(--orange)]"
                    style={{ width: `${(statusCounts.in_progress / statusTotal) * 100}%` }}
                  />
                )}
                {statusCounts.read > 0 && (
                  <div
                    className="h-full bg-[color:var(--ink)]"
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
              <ul className="meta-label mt-3 flex flex-col gap-1.5 text-[color:var(--ink)]/60">
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[color:var(--orange)]" />
                    In progress
                  </span>
                  {statusCounts.in_progress}
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[color:var(--ink)]" />
                    Read
                  </span>
                  {statusCounts.read}
                </li>
                <li className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full bg-[color:var(--cream-deep)]" />
                    Not started
                  </span>
                  {statusCounts.not_started}
                </li>
              </ul>
            </>
          )}
        </div>

        {/* Recent sessions */}
        <div className="rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6 lg:col-span-5">
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
            <div className="flex flex-col items-start gap-3 py-10">
              <p className="display text-[26px] text-[color:var(--ink)]">
                Nothing on tape yet.
              </p>
              <p className="max-w-sm text-[13px] font-medium text-[color:var(--ink)]/60">
                Open a book, press the mic, and start asking. Every session
                lands here afterwards.
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-[color:var(--ink)]/10">
              {sessions.slice(0, 4).map((s) => (
                <li key={s._id}>
                  <Link
                    href={`/books/${s.bookSlug}`}
                    className="group flex items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-[color:var(--ink)]/[0.04]"
                  >
                    <div className="relative h-13 w-9 shrink-0 overflow-hidden rounded-md bg-[color:var(--paper)]">
                      {s.bookCoverURL && (
                        <Image
                          src={s.bookCoverURL}
                          alt=""
                          fill
                          sizes="36px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-bold text-[color:var(--ink)]">
                      {s.bookTitle}
                    </p>
                    <p className="meta-label shrink-0 text-[color:var(--ink)]/55">
                      {formatDate(s.startedAt)} · {formatDuration(s.durationSeconds)}
                    </p>
                    <ArrowUpRight className="size-4 shrink-0 text-[color:var(--ink)]/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-3 lg:col-span-3">
          <Link
            href="/library"
            className="card-lift group flex flex-1 cursor-pointer items-start justify-between gap-4 rounded-[22px] bg-[color:var(--ink)] p-6 text-[color:var(--cream)] shadow-chip"
          >
            <div>
              <p className="meta-label text-[color:var(--cream)]/55">
                Quick action
              </p>
              <h3 className="display mt-2 text-[26px]">Add a book</h3>
              <div className="barcode mt-3 h-7 w-full max-w-[120px] text-[color:var(--cream)]" />
            </div>
            <ArrowUpRight className="size-6 shrink-0 transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
          </Link>

          <Link
            href="/library"
            className="card-lift group flex flex-1 cursor-pointer items-start justify-between gap-4 rounded-[22px] bg-[color:var(--paper)] p-6 shadow-chip border-2 border-[color:var(--ink)]/10"
          >
            <div>
              <p className="meta-label text-[color:var(--ink)]/55">Browse</p>
              <h3 className="display mt-2 text-[26px] text-[color:var(--ink)]">
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
