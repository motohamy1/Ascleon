export default function StudySpaceLoading() {
  return (
    <div className="fixed inset-0 z-30 flex h-[100dvh] w-full max-w-full flex-col overflow-hidden bg-[color:var(--ink)] pt-0 text-[color:var(--cream)] select-none overscroll-none">
      <header className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#141318] px-2 sm:px-3">
        <div className="flex items-center gap-2">
          <div className="size-7 animate-pulse rounded-full bg-white/10" />
          <div className="size-6 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-40 animate-pulse rounded bg-white/10 sm:w-56" />
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <div className="h-1.5 w-36 animate-pulse rounded-full bg-white/10" />
          <div className="h-4 w-12 animate-pulse rounded bg-white/10" />
        </div>
      </header>

      <div className="flex flex-1 gap-1 overflow-hidden p-1 sm:gap-2 sm:p-2">
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[#17161b] shadow-frame lg:w-[54%]">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-6">
            <div className="mb-1 size-10 animate-spin rounded-full border-2 border-[color:var(--orange)] border-t-transparent" />
            <div className="h-3 w-40 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-56 animate-pulse rounded bg-white/5" />
          </div>
        </div>

        <div className="relative hidden h-full min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-[color:var(--ink-soft)] lg:flex">
          <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#141318]/90 px-2.5 sm:px-3.5">
            <div className="h-5 w-28 animate-pulse rounded-full bg-white/10" />
            <div className="h-6 w-16 animate-pulse rounded-full bg-white/10" />
          </div>

          <div className="grid shrink-0 grid-cols-5 gap-1.5 border-b border-white/10 bg-[#141318]/75 p-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded-full bg-white/10" />
            ))}
          </div>

          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-32 w-full animate-pulse rounded-[18px] border border-white/10 bg-white/5" />
            <div className="space-y-2 pt-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
            </div>
          </div>

          <div className="border-t border-white/10 p-4">
            <div className="h-12 w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
