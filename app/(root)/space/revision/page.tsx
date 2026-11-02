import Link from 'next/link';
import { Lock, ArrowUpRight, Sparkles, Brain, Clock, ShieldCheck, BookOpen } from 'lucide-react';
import { AscleonLogo } from '@/components/ui/AscleonLogo';

const upcomingFeatures = [
  {
    icon: Brain,
    title: 'Adaptive Spaced Repetition',
    description: 'Scientifically timed recall intervals (FSRS algorithm) designed to prevent memory decay for dense textbook chapters.',
    tag: 'FSRS v5 Engine',
    card: 'bg-[color:var(--orange)] text-[color:var(--ink)]',
  },
  {
    icon: Sparkles,
    title: 'AI Active-Recall Flashcards',
    description: 'Auto-synthesizes high-yield board question vignettes and clozes directly from passages you highlighted while reading.',
    tag: 'Instant Sync',
    card: 'bg-[color:var(--cream)] text-[color:var(--ink)]',
  },
  {
    icon: Clock,
    title: 'Oral Viva Audio Replay',
    description: 'Listen back to key diagnostic moments from your live voice mentor sessions with synchronized textbook citations.',
    tag: 'Bilingual Audio',
    card: 'bg-[#7fd8c9] text-[color:var(--ink)]',
  },
];

const RevisionPage = () => {
  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <div className="rounded-[24px] sm:rounded-[32px] bg-[color:var(--ink)] p-2.5 sm:p-4 shadow-frame">
        <div className="flex flex-col gap-3">
          {/* HERO LOCKED BANNER */}
          <section className="relative overflow-hidden rounded-[24px] bg-[color:var(--cream)] p-8 sm:p-12 lg:p-14 min-h-[370px] sm:min-h-[420px] flex flex-col justify-between shadow-chip">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <AscleonLogo size={42} className="shadow-xs" />
                <div>
                  <p className="meta-label text-[color:var(--ink)]/70">
                    Ascleon® · Revision Engine
                  </p>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--ink)]/50">
                    Module Under Construction
                  </p>
                </div>
              </div>

              {/* Status Pill */}
              <div className="flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-4 py-2 text-xs font-black uppercase tracking-wider text-[color:var(--ink)] shadow-chip">
                <Lock className="size-4 stroke-[2.5]" />
                <span>Locked • Upcoming Soon</span>
              </div>
            </div>

            {/* Hero Content */}
            <div className="my-auto py-6 max-w-2xl">
              <h1 className="display text-[clamp(2.8rem,6.5vw,5.2rem)] leading-[0.93] text-[color:var(--ink)]">
                Rebuilding from
                <br />
                the ground up.
              </h1>
              <p className="mt-6 text-[15px] sm:text-base leading-relaxed text-[color:var(--ink-soft)] max-w-xl">
                We are actively redesigning the Revision Vault to introduce board-grade spaced
                repetition, automatic highlight extraction, and oral viva audio analytics.
                This section is temporarily locked while the new architecture is being built.
              </p>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/library"
                  className="flex items-center gap-2.5 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--ink)] px-7 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[color:var(--cream)] shadow-chip transition-all hover:bg-[#232029] active:scale-[0.98]"
                >
                  <BookOpen className="size-4 text-[color:var(--orange)]" />
                  <span>Return to Library</span>
                </Link>

                <Link
                  href="/space/active"
                  className="flex items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-7 py-3.5 text-xs font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <span>Open Study Space</span>
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
            </div>

            {/* Decorative Y2K Chrome Accent */}
            <div className="pointer-events-none absolute -bottom-6 -right-4 sm:-bottom-8 sm:-right-6 flex items-end gap-2 sm:gap-3 opacity-80 z-10">
              <div className="chrome-sphere mb-6 sm:mb-8 size-10 sm:size-14 shrink-0" />
              <div className="chrome-sphere-violet mb-3 sm:mb-4 size-14 sm:size-[88px] shrink-0" />
              <div className="chrome-sphere size-24 sm:size-36 shrink-0" />
            </div>
          </section>

          {/* PREVIEW OF UPCOMING MODULES */}
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {upcomingFeatures.map((f, i) => {
              const Icon = f.icon;
              return (
                <article
                  key={i}
                  className={`card-lift flex min-h-[210px] sm:min-h-[235px] flex-col justify-between rounded-[22px] p-6 sm:p-7 shadow-chip ${f.card}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex size-11 items-center justify-center rounded-xl border-2 border-[color:var(--ink)] bg-white/30 text-[color:var(--ink)]">
                      <Icon className="size-5" />
                    </div>
                    <span className="rounded-full border border-[color:var(--ink)]/30 bg-black/5 px-3 py-1 font-mono text-[10px] font-bold uppercase text-[color:var(--ink)]">
                      {f.tag}
                    </span>
                  </div>

                  <div>
                    <h2 className="display text-2xl text-[color:var(--ink)] leading-snug">{f.title}</h2>
                    <p className="mt-3 text-xs sm:text-[13px] font-medium leading-relaxed text-[color:var(--ink)]/80">
                      {f.description}
                    </p>
                  </div>
                </article>
              );
            })}
          </section>

          {/* BOTTOM NOTICE */}
          <section className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-[20px] border border-white/10 bg-white/5 p-5 text-center sm:text-left">
            <div className="flex items-center gap-3">
              <ShieldCheck className="size-5 shrink-0 text-[#7fd8c9]" />
              <p className="text-xs text-[color:var(--cream)]/80">
                All previous reading sessions and study notes remain safe and linked to your books in the Library.
              </p>
            </div>
            <Link
              href="/library"
              className="group inline-flex shrink-0 items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[color:var(--orange)] hover:underline underline-offset-4"
            >
              <span>Explore Books</span>
              <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
};

export default RevisionPage;
