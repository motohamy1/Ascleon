export default function LibraryLoading() {
  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <div className="rounded-[24px] bg-[color:var(--ink)] p-2.5 shadow-frame sm:rounded-[32px] sm:p-4">
        <div className="rounded-[22px] bg-[color:var(--cream)] p-6 shadow-chip sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="size-11 shrink-0 animate-pulse rounded-full bg-[color:var(--ink)]/15" />
              <div className="h-10 w-40 animate-pulse rounded bg-[color:var(--ink)]/15 sm:h-12 sm:w-52" />
              <div className="hidden h-7 w-24 animate-pulse rounded-full border-2 border-[color:var(--ink)]/20 sm:block" />
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="h-11 w-64 animate-pulse rounded-full bg-[color:var(--panel)]" />
              <div className="h-11 w-36 animate-pulse rounded-full bg-[color:var(--orange)]/30" />
            </div>
          </div>
        </div>

        <div className="mt-3 min-h-[320px] rounded-[22px] bg-[color:var(--panel)] p-4 shadow-chip sm:p-7">
          <div className="h-5 w-32 animate-pulse rounded bg-[color:var(--ink)]/10" />
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-[18px] border-2 border-[color:var(--ink)]/10 bg-[color:var(--cream)] p-3 shadow-chip"
              >
                <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-[color:var(--ink)]/10" />
                <div className="h-4 w-3/4 animate-pulse rounded bg-[color:var(--ink)]/15" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-[color:var(--ink)]/10" />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 min-h-[260px] rounded-[24px] border-2 border-[color:var(--ink)] bg-[color:var(--cream)] p-7 shadow-chip sm:min-h-[290px] sm:p-9">
          <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 space-y-4">
              <div className="h-6 w-40 animate-pulse rounded-full bg-[color:var(--ink)]/10" />
              <div className="h-9 w-2/3 animate-pulse rounded bg-[color:var(--ink)]/15" />
              <div className="h-4 w-1/3 animate-pulse rounded bg-[color:var(--ink)]/10" />
              <div className="h-4 w-full max-w-lg animate-pulse rounded bg-[color:var(--ink)]/10" />
              <div className="h-11 w-48 animate-pulse rounded-full bg-[color:var(--ink)]/15" />
            </div>
            <div className="mx-auto aspect-[2/3] w-34 shrink-0 animate-pulse rounded-2xl border-2 border-[color:var(--ink)]/20 bg-[color:var(--ink)]/10 md:mx-0 sm:w-44" />
          </div>
        </div>
      </div>
    </main>
  );
}
