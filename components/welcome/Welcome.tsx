import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { SignInButton } from '@clerk/nextjs';

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
    card: 'bg-[color:var(--cream)] text-[color:var(--ink)]',
    dim: 'text-[color:var(--ink)]/50',
    body: 'text-[color:var(--ink)]/70',
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

const Welcome = () => {
  return (
    <div className="flex flex-col gap-3">
      {/* HERO ROW */}
      <section className="grid gap-3 lg:grid-cols-12">
        {/* Hero module */}
        <div className="relative flex min-h-[430px] flex-col justify-between overflow-hidden rounded-[22px] bg-[color:var(--cream)] p-6 sm:p-10 lg:col-span-8 lg:min-h-[520px]">
          <div className="flex items-center justify-between gap-6">
            <p className="meta-label text-[color:var(--ink)]/70">
              Ascleon® · reading, out loud
            </p>
            <div className="barcode h-7 w-20 shrink-0 text-[color:var(--ink)]" />
          </div>

          <div className="mt-10 sm:mt-14">
            <h1 className="display text-[color:var(--ink)] text-[clamp(3.4rem,9vw,7.2rem)]">
              Talk to
              <br />
              your books.
            </h1>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-[color:var(--ink-soft)] sm:text-base">
              Upload any stubborn book, light or med-school dense. Ascleon
              turns its chapters into live conversations with an AI co-reader,
              so the hard parts finally open up.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
              <SignInButton mode="modal">
                <button className="flex cursor-pointer items-center gap-2 rounded-full border-2 border-[color:var(--ink)] bg-[color:var(--orange)] px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)] shadow-chip transition-transform hover:-translate-y-0.5">
                  Start reading
                  <ArrowUpRight className="size-4" />
                </button>
              </SignInButton>
              <Link
                href="/library"
                className="group flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.08em] text-[color:var(--ink)]"
              >
                Browse the library
                <ArrowUpRight className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </Link>
            </div>
          </div>

          {/* Chrome cluster — decorative, sits on the card surface */}
          <div className="pointer-events-none absolute hidden items-end gap-3 sm:flex sm:-bottom-10 sm:-right-8">
            <div className="chrome-sphere mb-10 size-10" />
            <div className="chrome-sphere-violet mb-5 size-16" />
            <div className="chrome-sphere size-28" />
          </div>
        </div>

        {/* Right stack */}
        <div className="flex flex-col gap-3 lg:col-span-4">
          <SignInButton mode="modal">
            <div className="group relative flex min-h-[250px] flex-1 cursor-pointer flex-col justify-between overflow-hidden rounded-[22px] bg-[color:var(--orange)] p-6 shadow-chip transition-transform duration-200 hover:-translate-y-1 sm:min-h-[280px]">
              <p className="meta-label text-[color:var(--ink)]/80">
                First time here
              </p>
              <h2 className="display mt-8 text-[44px] text-[color:var(--ink)] sm:text-[54px]">
                One PDF,
                <br />
                one conversation.
              </h2>
              <p className="mt-3 text-sm font-semibold text-[color:var(--ink)]/80">
                Live voice sessions with your book, up to 60 minutes.
              </p>
              <ArrowUpRight className="absolute right-5 bottom-4 size-14 text-[color:var(--ink)] transition-transform duration-200 group-hover:-translate-y-1 group-hover:translate-x-1" />
            </div>
          </SignInButton>

          <div className="rounded-[22px] bg-[color:var(--panel)] p-5 shadow-chip">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="meta-label text-[color:var(--ink)]/60">
                  Format
                </p>
                <p className="display mt-2.5 text-[26px] text-[color:var(--ink)]">
                  PDF → Voice
                </p>
              </div>
              <div className="barcode h-10 w-22 shrink-0 text-[color:var(--ink)]" />
            </div>
            <div className="swatch-ramp mt-4 h-9 rounded-full border-2 border-[color:var(--ink)]" />
            <div className="meta-label mt-2 flex justify-between text-[color:var(--ink)]/55">
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
            className={`card-lift flex min-h-[212px] flex-col justify-between rounded-[18px] p-5 ${f.card}`}
          >
            <span className={`meta-label ${f.dim}`}>{f.n}</span>
            <div>
              <h3 className="display text-[25px]">{f.title}</h3>
              <p
                className={`mt-2 text-[13px] font-semibold leading-snug ${f.body}`}
              >
                {f.desc}
              </p>
            </div>
          </article>
        ))}
      </section>

      {/* BOTTOM STRIP — how it works + the point */}
      <section className="grid gap-3 lg:grid-cols-12">
        <div className="rounded-[22px] bg-[color:var(--cream)] p-6 sm:p-8 lg:col-span-8">
          <div className="grid gap-8 sm:grid-cols-3 sm:gap-6">
            {steps.map((s) => (
              <div key={s.n}>
                <span className="display text-[42px] text-[color:var(--ink)]/25">
                  {s.n}
                </span>
                <h3 className="mt-1 text-[15px] font-bold text-[color:var(--ink)]">
                  {s.title}
                </h3>
                <p className="mt-1.5 text-[13px] font-medium leading-snug text-[color:var(--ink)]/70">
                  {s.desc}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-5 rounded-[22px] bg-[color:var(--ink)] p-6 lg:col-span-4">
          <div>
            <p className="meta-label text-[color:var(--cream)]/60">
              The point
            </p>
            <p className="display mt-2 text-[30px] text-[color:var(--cream)]">
              Not a summary.
              <br />
              A conversation.
            </p>
          </div>
          <div className="chrome-sphere-violet size-14 shrink-0" />
        </div>
      </section>

      <p className="meta-label mt-3 text-center text-[color:var(--ink)]/55">
        Ascleon® · built for stubborn readers
      </p>
    </div>
  );
};

export default Welcome;
