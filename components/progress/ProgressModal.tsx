'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BookOpen, X } from 'lucide-react';
import { IBook } from '@/types';
import type { SessionHistoryItem } from '@/lib/actions/session.actions';

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

const isUnoptimizedImage = (src: string) =>
  src.startsWith('data:') ||
  src.startsWith('blob:') ||
  src.startsWith('/api/') ||
  src.endsWith('.svg');

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
  dimClass = 'text-[color:var(--ink)]/75',
}: {
  value: number | string;
  label: string;
  cardClass?: string;
  dimClass?: string;
}) => (
  <div
    className={`card-lift flex min-h-[120px] sm:min-h-[140px] flex-col justify-between rounded-[20px] p-4 sm:p-5 shadow-chip ${cardClass}`}
  >
    <p className="display text-[34px] sm:text-[42px] leading-none">{value}</p>
    <p className={`meta-label mt-2 text-xs ${dimClass}`}>{label}</p>
  </div>
);

export interface ProgressSummaryCardProps {
  books: IBook[];
  sessions: SessionHistoryItem[];
  onOpen: () => void;
}

export function ProgressSummaryCard({
  books,
  sessions,
  onOpen,
}: ProgressSummaryCardProps) {
  const week = computeLastWeek(sessions);
  const peak = Math.max(1, ...week.map((d) => d.minutes));
  const weekMinutes = week.reduce((s, d) => s + d.minutes, 0);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="card-lift group flex min-h-[160px] sm:min-h-[185px] w-full cursor-pointer flex-col justify-between rounded-[24px] bg-[color:var(--panel)] p-5 sm:p-6 text-left shadow-chip transition-transform duration-200 hover:-translate-y-1"
    >
      <div className="flex w-full items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="meta-label text-[color:var(--ink)]/75">My Progress</p>
          <span className="rounded-full border border-[color:var(--ink)]/25 bg-[#7fd8c9] px-2.5 py-0.5 text-[11px] font-bold text-[color:var(--ink)]">
            {weekMinutes} min this week
          </span>
        </div>
        <ArrowUpRight className="size-5 shrink-0 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
      </div>

      <div className="my-3 flex h-11 w-full items-end gap-1.5">
        {week.map((d) => (
          <div key={d.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <div
              title={`${d.minutes} min`}
              className="w-full rounded-full"
              style={{
                height: `${d.minutes > 0 ? Math.max(18, (d.minutes / peak) * 100) : 12}%`,
                backgroundColor: d.isToday
                  ? 'var(--orange)'
                  : d.minutes > 0
                    ? '#7fd8c9'
                    : 'color-mix(in srgb, var(--ink) 12%, transparent)',
              }}
            />
          </div>
        ))}
      </div>

      <div className="meta-label flex w-full items-center justify-between gap-2 text-xs text-[color:var(--ink)]/75">
        <span>
          {books.length} {books.length === 1 ? 'book' : 'books'} · {sessions.length}{' '}
          {sessions.length === 1 ? 'session' : 'sessions'}
        </span>
        <span className="font-bold text-[color:var(--ink)] group-hover:underline underline-offset-4">
          Open progress
        </span>
      </div>
    </button>
  );
}

export interface ProgressModalProps {
  open: boolean;
  onClose: () => void;
  books: IBook[];
  sessions: SessionHistoryItem[];
  firstName?: string | null;
}

export function ProgressModal({
  open,
  onClose,
  books,
  sessions,
  firstName,
}: ProgressModalProps) {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

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

  const heading = firstName ? `${firstName}’s Progress` : 'Your Study Progress';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="progress-modal-title"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] shadow-chip"
      >
        {/* Fixed Header */}
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[color:var(--ink)]/15 px-5 py-4 sm:px-7 sm:py-5">
          <div>
            <div className="flex items-center gap-2">
              <p className="meta-label text-[color:var(--ink)]/75">Study Progress</p>
              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/20 bg-[#7fd8c9] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--ink)]">
                <span className="size-1.5 rounded-full bg-[color:var(--ink)] animate-pulse" />
                Live Sync
              </span>
            </div>
            <h2
              id="progress-modal-title"
              className="display mt-1 text-[26px] sm:text-[32px] leading-tight text-[color:var(--ink)]"
            >
              {heading}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close progress modal"
            className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--panel)] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--orange)]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7 flex flex-col gap-4">
          {/* 4 Stat Tiles */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              value={books.length}
              label="Books on shelf"
              cardClass="bg-[color:var(--panel)] text-[color:var(--ink)]"
              dimClass="text-[color:var(--ink)]/75"
            />
            <StatTile
              value={sessions.length}
              label="Sessions logged"
              cardClass="bg-[#7fd8c9] text-[color:var(--ink)]"
              dimClass="text-[color:var(--ink)]/75"
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
              dimClass="text-[color:var(--cream)]/75"
            />
          </div>

          {/* 7-Day Log + Shelf Status */}
          <div className="grid gap-3 md:grid-cols-12">
            <div className="flex min-h-[215px] flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6 shadow-chip md:col-span-6">
              <div className="flex items-baseline justify-between gap-4">
                <p className="meta-label text-[color:var(--ink)]/75">
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
                      className={`meta-label ${d.isToday ? 'text-[color:var(--ink)] font-bold' : 'text-[color:var(--ink)]/75'}`}
                    >
                      {d.letter}
                    </span>
                  </div>
                ))}
              </div>

              {sessions.length === 0 && (
                <p className="mt-2 text-[12.5px] font-medium text-[color:var(--ink)]/75">
                  No sessions this week yet. Open a book and the log fills itself.
                </p>
              )}
            </div>

            <div className="flex min-h-[215px] flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6 shadow-chip md:col-span-6">
              <div>
                <p className="meta-label text-[color:var(--ink)]/75">Shelf status</p>

                {statusTotal === 0 ? (
                  <p className="mt-4 text-[13.5px] font-medium leading-relaxed text-[color:var(--ink)]/75">
                    Nothing shelved yet — upload a book and this ramp starts moving.
                  </p>
                ) : (
                  <>
                    <div className="mt-5 flex h-9 gap-1 overflow-hidden rounded-full border-2 border-[color:var(--ink)]">
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
                    <ul className="meta-label mt-4 flex flex-col gap-2 text-[color:var(--ink)]/75">
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
              <div className="mt-4 pt-3 border-t border-[color:var(--ink)]/10 text-xs font-semibold text-[color:var(--ink)]/75">
                {statusTotal} {statusTotal === 1 ? 'total title' : 'total titles'} tracked
              </div>
            </div>
          </div>

          {/* Recent Sessions */}
          <div className="flex flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 sm:p-6 shadow-chip">
            <div className="flex items-center justify-between gap-4">
              <p className="meta-label text-[color:var(--ink)]/75">Recent sessions</p>
              <span className="text-xs font-semibold text-[color:var(--ink)]/75">
                {sessions.length} {sessions.length === 1 ? 'session recorded' : 'total sessions recorded'}
              </span>
            </div>

            {sessions.length === 0 ? (
              <div className="flex flex-col items-start gap-2 py-6">
                <p className="display text-[24px] text-[color:var(--ink)]">
                  Nothing on tape yet.
                </p>
                <p className="max-w-md text-sm font-medium leading-relaxed text-[color:var(--ink)]/75">
                  Open a book, press the mic, and start asking. Every session lands here afterwards.
                </p>
              </div>
            ) : (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {sessions.slice(0, 6).map((s) => (
                  <li key={s._id}>
                    <Link
                      href={`/books/${s.bookSlug}`}
                      onClick={onClose}
                      className="group flex items-center gap-3.5 rounded-xl border border-[color:var(--ink)]/15 bg-white/60 px-3 py-2.5 transition-colors hover:bg-[color:var(--cream)]"
                    >
                      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg bg-[color:var(--paper)] shadow-xs">
                        {s.bookCoverURL ? (
                          <Image
                            src={s.bookCoverURL}
                            alt=""
                            fill
                            sizes="40px"
                            className="object-cover"
                            unoptimized={isUnoptimizedImage(s.bookCoverURL)}
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[color:var(--ink)]/50">
                            <BookOpen className="size-4" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-[color:var(--ink)]">
                          {s.bookTitle}
                        </p>
                        <p className="meta-label mt-0.5 text-[color:var(--ink)]/75">
                          {formatDate(s.startedAt)} · {formatDuration(s.durationSeconds)}
                        </p>
                      </div>
                      <ArrowUpRight className="size-4 shrink-0 text-[color:var(--ink)]/75 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
