import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { IBook, UserStudyProgressData } from '@/types';
import { SessionHistoryItem } from '@/lib/actions/session.actions';
import { AscleonLogo } from '@/components/ui/AscleonLogo';
import type { ActiveStudySourceResult } from '@/lib/actions/study-progress.actions';
import type { StudyPlanDTO } from '@/types/study-plan';
import StudyPlanPanel from './StudyPlanPanel';

interface ProgressViewProps {
  books: IBook[];
  sessions?: SessionHistoryItem[];
  firstName: string | null;
  latestStudyProgress?: UserStudyProgressData | null;
  activeStudy?: ActiveStudySourceResult | null;
  initialPlans?: StudyPlanDTO[];
}

const greetingPeriod = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
};

const ProgressView = ({
  books,
  firstName,
  latestStudyProgress,
  activeStudy,
  initialPlans = [],
}: ProgressViewProps) => {
  const name = (firstName ?? 'reader').toUpperCase();

  const targetStudyBook = latestStudyProgress
    ? books.find((b) => b.slug === latestStudyProgress.bookSlug)
    : null;

  const fallbackBook = books.find((b) => b.readingStatus === 'in_progress') ?? books[0] ?? null;

  const resume: {
    href: string;
    title: string;
    cover?: string;
    page?: number;
    totalPages?: number;
    progressPercent?: number;
  } | null = activeStudy
    ? {
        href: `/books/${activeStudy.slug}`,
        title: activeStudy.title,
        cover: activeStudy.coverURL,
        page: activeStudy.totalPages > 0 ? activeStudy.lastStudiedPage : undefined,
        totalPages: activeStudy.totalPages > 0 ? activeStudy.totalPages : undefined,
        progressPercent: activeStudy.totalPages > 0 ? activeStudy.progressPercent : undefined,
      }
    : targetStudyBook
      ? {
          href: `/books/${targetStudyBook.slug}`,
          title: targetStudyBook.title,
          cover: targetStudyBook.coverURL,
          page: latestStudyProgress?.lastStudiedPage,
          totalPages: latestStudyProgress?.totalPages,
          progressPercent: latestStudyProgress?.progressPercent,
        }
      : fallbackBook
        ? {
            href: `/books/${fallbackBook.slug}`,
            title: fallbackBook.title,
            cover: fallbackBook.coverURL,
          }
        : null;

  return (
    <div className="flex flex-col gap-3">
      {/* Compact Study Hub Header */}
      <section className="flex flex-col justify-between gap-4 rounded-[24px] bg-[color:var(--cream)] p-5 sm:p-6 shadow-chip md:flex-row md:items-center">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <AscleonLogo size={26} className="shrink-0" />
            <p className="meta-label text-[color:var(--ink)]/75">
              Study Hub · Exam Plans
            </p>
            <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--ink)]/20 bg-[#7fd8c9] px-2 py-0.5 font-mono text-[9.5px] font-bold text-[color:var(--ink)]">
              <span className="size-1.5 rounded-full bg-[color:var(--ink)] animate-pulse" />
              Live Sync
            </span>
          </div>
          <h1 className="display mt-2 text-[color:var(--ink)] text-[clamp(2rem,4vw,3.1rem)] leading-[0.98]">
            {greetingPeriod()}, {name}.
          </h1>
          <p className="mt-1.5 max-w-xl text-xs sm:text-sm font-medium text-[color:var(--ink-soft)]">
            Build, customize, and execute your day-by-day exam roadmaps.
          </p>
        </div>

        {resume ? (
          <Link
            href={resume.href}
            className="card-lift group flex shrink-0 items-center gap-3.5 rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-3 shadow-xs md:max-w-sm"
          >
            <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-lg border border-[color:var(--ink)]/25 bg-white/40">
              {resume.cover ? (
                <Image
                  src={resume.cover}
                  alt={resume.title}
                  fill
                  sizes="40px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[color:var(--ink)]">
                  <BookOpen className="size-4 opacity-75" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="meta-label text-[10px] text-[color:var(--ink)]/75">
                Continue studying
              </p>
              <p className="truncate text-sm font-black text-[color:var(--ink)]">
                {resume.title}
              </p>
              {typeof resume.progressPercent === 'number' && (
                <p className="text-[11px] font-bold text-[color:var(--ink)]/80">
                  Page {resume.page ?? 1} of {Math.max(1, resume.totalPages ?? 1, resume.page ?? 1)} · {Math.min(100, Math.max(0, resume.progressPercent))}%
                </p>
              )}
            </div>
            <ArrowUpRight className="size-5 shrink-0 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <Link
            href="/library"
            className="card-lift group flex shrink-0 items-center gap-3 rounded-[18px] border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-3 text-sm font-black text-[color:var(--ink)] shadow-xs"
          >
            <span>Add your first book</span>
            <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
          </Link>
        )}
      </section>

      {/* Isolated Exam Study Plans */}
      <StudyPlanPanel books={books} initialPlans={initialPlans} />
    </div>
  );
};

export default ProgressView;
