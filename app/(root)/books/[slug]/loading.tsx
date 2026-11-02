export default function StudySpaceLoading() {
  return (
    <div className="flex h-screen w-full flex-col overflow-hidden bg-[#0d0c0f] text-[color:var(--cream)]">
      {/* Top Navigation Bar Skeleton */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#121114] px-4">
        <div className="flex items-center gap-3">
          <div className="h-7 w-20 animate-pulse rounded-full bg-white/10" />
          <div className="h-5 w-48 animate-pulse rounded bg-white/10" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-7 w-24 animate-pulse rounded-full bg-white/10" />
          <div className="h-7 w-7 animate-pulse rounded-full bg-white/10" />
        </div>
      </header>

      {/* Main Split Layout Skeleton */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Source Document / PDF Canvas Skeleton */}
        <div className="relative flex flex-1 flex-col items-center justify-center bg-[#18161b] p-6">
          <div className="flex h-[88%] w-full max-w-2xl animate-pulse flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] shadow-2xl">
            <div className="size-10 animate-spin rounded-full border-2 border-[color:var(--orange)] border-t-transparent mb-4" />
            <div className="h-4 w-40 rounded bg-white/10 animate-pulse mb-2" />
            <div className="h-3 w-56 rounded bg-white/5 animate-pulse" />
          </div>
        </div>

        {/* Right: Study Studio & AI Assistant Skeleton */}
        <div className="flex w-[480px] shrink-0 flex-col border-l border-white/10 bg-[#121114]">
          {/* Studio Tabs Skeleton */}
          <div className="grid grid-cols-5 gap-1 border-b border-white/10 bg-black/40 p-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded-full bg-white/10" />
            ))}
          </div>

          {/* Studio Body Skeleton */}
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="h-10 w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-32 w-full animate-pulse rounded-2xl border border-white/10 bg-white/[0.04]" />
            <div className="space-y-2 pt-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-white/5" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-white/5" />
            </div>
          </div>

          {/* AI Input Area Skeleton */}
          <div className="border-t border-white/10 p-4">
            <div className="h-12 w-full animate-pulse rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
