'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpRight, BookOpen } from 'lucide-react';
import { SignInButton, SignedIn, SignedOut, useUser } from '@clerk/nextjs';
import { AscleonLogo } from '@/components/ui/AscleonLogo';
import {
  getActiveStudySource,
  ActiveStudySourceResult,
} from '@/lib/actions/study-progress.actions';

const features = [
  {
    n: '01',
    title: 'Upload anything',
    desc: 'Drop a PDF. Ascleon splits it into chapters and preps the conversation.',
    card: 'bg-[color:var(--panel)] text-[color:var(--ink)]',
    dim: 'text-[color:var(--ink)]/50',
    body: 'text-[color:var(--ink)]/70',
  },
  {
    n: '02',
    title: 'Talk it out',
    desc: 'Voice sessions that question, argue and re-explain until it clicks.',
    card: 'bg-[#7fd8c9] text-[color:var(--ink)]',
    dim: 'text-[color:var(--ink)]/60',
    body: 'text-[color:var(--ink)]/80',
  },
  {
    n: '03',
    title: 'Get past the hard part',
    desc: 'The AI co-reader moves at your pace. No chapter gets left behind.',
    card: 'bg-[color:var(--orange)] text-[color:var(--ink)]',
    dim: 'text-[color:var(--ink)]/50',
    body: 'text-[color:var(--ink)]/75',
  },
  {
    n: '04',
    title: 'Keep what sticks',
    desc: 'Return to anything you marked, in Revision, days or weeks later.',
    card: 'bg-[color:var(--ink)] text-[color:var(--cream)]',
    dim: 'text-[color:var(--cream)]/45',
    body: 'text-[color:var(--cream)]/75',
  },
];

const steps = [
  {
    n: '1',
    title: 'Upload a PDF',
    desc: 'Any book you have been avoiding for a while.',
  },
  {
    n: '2',
    title: 'Start a session',
    desc: 'Talk it through, out loud, with your AI co-reader.',
  },
  {
    n: '3',
    title: 'Return & retain',
    desc: 'Revisit what you marked in Revision.',
  },
];

export interface WelcomeProps {
  userFirstName?: string | null;
  activeStudy?: ActiveStudySourceResult | null;
}

const Welcome = ({ userFirstName, activeStudy }: WelcomeProps) => {
  const { user: clientUser, isSignedIn } = useUser();
  const [clientActiveStudy, setClientActiveStudy] = useState<
    ActiveStudySourceResult | null | undefined
  >(undefined);
  const fetchedOnSignInRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) {
      fetchedOnSignInRef.current = false;
      return;
    }

    if (fetchedOnSignInRef.current) {
      return;
    }

    let cancelled = false;
    fetchedOnSignInRef.current = true;

    getActiveStudySource()
      .then((res) => {
        if (!cancelled && res.success) {
          setClientActiveStudy(res.data ?? null);
        }
      })
      .catch((err) =>
        console.error('Error fetching active study source:', err)
      );

    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  const currentActiveStudy =
    isSignedIn === false
      ? null
      : clientActiveStudy !== undefined
        ? clientActiveStudy
        : (activeStudy ?? null);

  const rawName =
    userFirstName ||
    clientUser?.firstName ||
    clientUser?.fullName ||
    clientUser?.username ||
    clientUser?.primaryEmailAddress?.emailAddress?.split('@')[0] ||
    'Reader';

  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const studyHref = currentActiveStudy
    ? `/books/${currentActiveStudy.slug}`
    : '/space/active';
  const activeTitleSizeClass =
    currentActiveStudy && currentActiveStudy.title.length > 20
      ? 'text-[28px] sm:text-[32px]'
      : 'text-[36px] sm:text-[42px]';

  return (
    <div className="flex flex-col gap-3">
      {/* HERO ROW */}
      <section className="grid gap-3 lg:grid-cols-12">
        {/* Hero module */}
        <div className="relative flex min-h-[410px] sm:min-h-[455px] lg:min-h-[505px] xl:min-h-[535px] flex-col justify-between overflow-hidden rounded-[24px] bg-[color:var(--cream)] p-6 sm:p-10 lg:p-12 lg:col-span-8 shadow-chip">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <AscleonLogo
                size={40}
                className="shadow-xs transition-transform duration-200 hover:scale-105"
              />
              <p className="meta-label text-[color:var(--ink)]/80">
                Ascleon® · reading, out loud
              </p>
            </div>
            <div className="barcode h-8 w-24 shrink-0 text-[color:var(--ink)]" />
          </div>

          <div className="mt-5 sm:mt-8 max-w-2xl">
            <SignedIn>
              <p className="mb-2.5 text-[15px] sm:text-base font-bold tracking-tight text-[color:var(--ink)]/85">
                Welcome back,{' '}
                <span className="font-extrabold text-[color:var(--magenta)]">
                  {displayName}
                </span>
                . Ready to pick up where you left off?
              </p>
            </SignedIn>

            <h1 className="display text-[color:var(--ink)] text-[clamp(3.6rem,8.5vw,7.6rem)] leading-[0.93]">
              Talk to
              <br />
              your books.
            </h1>
            <p className="mt-5 max-w-xl text-[16px] sm:text-lg leading-relaxed text-[color:var(--ink-soft)]">
              Upload any stubborn book, light or med-school dense. Ascleon
              turns its chapters into live conversations with an AI co-reader,
              so the hard parts finally open up.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <SignedOut>
                <SignInButton mode="modal">
                  <button className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-7 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 active:translate-y-0">
                    Start reading
                    <ArrowUpRight className="size-4.5" />
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link
                  href={studyHref}
                  className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-7 py-3.5 text-sm font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5 active:translate-y-0"
                >
                  Start reading
                  <ArrowUpRight className="size-4.5" />
                </Link>
              </SignedIn>
              <Link
                href="/library"
                className="group flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] hover:underline underline-offset-4"
              >
                Browse the library
                <ArrowUpRight className="size-4.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Chrome cluster — decorative, sits on the card surface */}
          <div className="pointer-events-none absolute bottom-0 right-2 sm:-bottom-4 sm:right-0 flex items-end gap-2 sm:gap-3 z-10">
            <div className="chrome-sphere mb-4 sm:mb-6 w-10 h-10 sm:w-12 sm:h-12 shrink-0" />
            <div className="chrome-sphere-violet mb-2 sm:mb-3 w-14 h-14 sm:w-[72px] sm:h-[72px] shrink-0" />
            <div className="chrome-sphere w-24 h-24 sm:w-32 sm:h-32 shrink-0" />
          </div>
        </div>

        {/* Right stack */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <SignedOut>
            <SignInButton mode="modal">
              <div className="group relative flex min-h-[250px] sm:min-h-[280px] lg:min-h-[310px] flex-1 cursor-pointer flex-col justify-between overflow-hidden rounded-[24px] bg-[color:var(--orange)] p-6 sm:p-7 shadow-chip transition-transform duration-200 hover:-translate-y-1">
                <p className="meta-label text-[color:var(--ink)]/80">
                  First time here
                </p>
                <h2 className="display mt-4 text-[42px] sm:text-[48px] leading-[1.02] text-[color:var(--ink)]">
                  One PDF,
                  <br />
                  one conversation.
                </h2>
                <p className="mt-3 text-sm sm:text-[15px] font-bold text-[color:var(--ink)]/85">
                  Live voice sessions with your book, up to 60 minutes.
                </p>
                <ArrowUpRight className="absolute right-6 bottom-5 size-12 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </div>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <Link href={studyHref} className="flex flex-1">
              <div className="group relative flex min-h-[250px] sm:min-h-[280px] lg:min-h-[310px] w-full cursor-pointer flex-col justify-between overflow-hidden rounded-[24px] bg-[color:var(--orange)] p-6 sm:p-7 shadow-chip transition-transform duration-200 hover:-translate-y-1">
                {currentActiveStudy ? (
                  <>
                    <p className="meta-label text-[color:var(--ink)]/80">
                      Active study source
                    </p>
                    <div className="mt-4 flex items-center gap-3.5 sm:gap-4">
                      <div className="relative aspect-[2/3] w-12 sm:w-14 shrink-0 overflow-hidden rounded-lg border-2 border-[color:var(--ink)]/25 bg-[color:var(--cream)]/40 shadow-sm">
                        {currentActiveStudy.coverURL ? (
                          <Image
                            src={currentActiveStudy.coverURL}
                            alt={currentActiveStudy.title}
                            fill
                            sizes="64px"
                            className="object-cover"
                            unoptimized={
                              currentActiveStudy.coverURL.startsWith('data:') ||
                              currentActiveStudy.coverURL.startsWith('blob:') ||
                              currentActiveStudy.coverURL.startsWith('/api/') ||
                              currentActiveStudy.coverURL.endsWith('.svg')
                            }
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[color:var(--ink)]">
                            <BookOpen className="size-5 opacity-75" />
                          </div>
                        )}
                      </div>
                      <h2
                        className={`display min-w-0 flex-1 leading-[1.02] text-[color:var(--ink)] line-clamp-3 break-words ${activeTitleSizeClass}`}
                      >
                        {currentActiveStudy.title}
                      </h2>
                    </div>
                    <p className="mt-3 pr-14 text-sm sm:text-[15px] font-bold text-[color:var(--ink)]/85 line-clamp-2">
                      {currentActiveStudy.totalPages > 0
                        ? `${currentActiveStudy.author ? `${currentActiveStudy.author} · ` : ''}Page ${currentActiveStudy.lastStudiedPage} of ${currentActiveStudy.totalPages} — enter study space.`
                        : `${currentActiveStudy.author ? `${currentActiveStudy.author} · ` : ''}Click to enter your study space.`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="meta-label text-[color:var(--ink)]/80">
                      First time here
                    </p>
                    <h2 className="display mt-4 text-[42px] sm:text-[48px] leading-[1.02] text-[color:var(--ink)]">
                      One PDF,
                      <br />
                      one conversation.
                    </h2>
                    <p className="mt-3 text-sm sm:text-[15px] font-bold text-[color:var(--ink)]/85">
                      Live voice sessions with your book, up to 60 minutes.
                    </p>
                  </>
                )}
                <ArrowUpRight className="absolute right-6 bottom-5 size-12 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
              </div>
            </Link>
          </SignedIn>

          <div className="flex min-h-[160px] sm:min-h-[185px] flex-col justify-between rounded-[24px] bg-[color:var(--panel)] p-5 sm:p-6 shadow-chip">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="meta-label text-[color:var(--ink)]/60">
                  Format
                </p>
                <p className="display mt-1.5 text-[26px] text-[color:var(--ink)]">
                  PDF → Voice
                </p>
              </div>
              <div className="barcode h-9 w-22 shrink-0 text-[color:var(--ink)]" />
            </div>
            <div className="swatch-ramp mt-4 h-9 rounded-full border-2 border-[color:var(--ink)]" />
            <div className="meta-label mt-2 flex justify-between text-[color:var(--ink)]/60 text-xs">
              <span>Magenta sample</span>
              <span>Read · Re-read</span>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURES — four distinct tiles, numbers instead of icons */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <article
            key={f.n}
            className={`card-lift flex min-h-[210px] sm:min-h-[235px] lg:min-h-[255px] flex-col justify-between rounded-[22px] p-5 sm:p-6 shadow-chip ${f.card}`}
          >
            <span className={`meta-label text-xs ${f.dim}`}>{f.n}</span>
            <div>
              <h3 className="display text-[26px] sm:text-[28px] leading-tight">
                {f.title}
              </h3>
              <p
                className={`mt-2.5 text-xs sm:text-[13px] font-semibold leading-snug ${f.body}`}
              >
                {f.desc}
              </p>
            </div>
          </article>
        ))}
      </section>

      {/* BOTTOM STRIP — how it works + the point */}
      <section className="grid gap-3 lg:grid-cols-12">
        <div className="flex min-h-[195px] sm:min-h-[225px] flex-col justify-center rounded-[24px] bg-[color:var(--cream)] p-6 sm:p-8 lg:col-span-8 shadow-chip">
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-5">
            {steps.map((s) => (
              <div key={s.n} className="flex flex-col justify-between">
                <span className="display text-[40px] text-[color:var(--ink)]/25 leading-none">
                  {s.n}
                </span>
                <h3 className="mt-1.5 text-sm sm:text-base font-bold text-[color:var(--ink)]">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-xs sm:text-[12.5px] font-medium leading-relaxed text-[color:var(--ink)]/75">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-h-[195px] sm:min-h-[225px] items-center justify-between gap-5 rounded-[24px] bg-[color:var(--ink)] p-6 sm:p-8 lg:col-span-4 shadow-chip">
          <div>
            <p className="meta-label font-bold text-[#7fd8c9]">
              The point
            </p>
            <p className="display mt-2.5 text-[28px] sm:text-[32px] leading-[1.08] text-[color:var(--cream)]">
              Not a summary.
              <br />
              A conversation.
            </p>
          </div>
          <div className="chrome-sphere-violet size-14 shrink-0" />
        </div>
      </section>

      <div className="mt-4 flex items-center justify-center gap-2">
        <AscleonLogo size={18} />
        <p className="meta-label text-center text-[color:var(--ink)]/60">
          Ascleon® · built for stubborn readers
        </p>
      </div>
    </div>
  );
};

export default Welcome;
