export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] min-h-[calc(100vh-120px)] px-3.5 pt-[94px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[102px] acid-bg transition-all">
      <div className="flex flex-col gap-3">
        <section className="grid gap-3 lg:grid-cols-12">
          <div className="flex min-h-[410px] flex-col justify-between rounded-[24px] bg-[color:var(--cream)] p-6 shadow-chip sm:min-h-[455px] sm:p-10 lg:col-span-8 lg:min-h-[505px] lg:p-12 xl:min-h-[535px]">
            <div className="flex items-center justify-between gap-6">
              <div className="h-8 w-40 animate-pulse rounded-lg bg-[color:var(--ink)]/15 sm:w-52" />
              <div className="h-7 w-24 shrink-0 animate-pulse rounded bg-[color:var(--ink)]/10" />
            </div>
            <div className="mt-8 max-w-2xl space-y-3">
              <div className="h-12 w-4/5 animate-pulse rounded-lg bg-[color:var(--ink)]/15 sm:h-18" />
              <div className="h-12 w-3/5 animate-pulse rounded-lg bg-[color:var(--ink)]/15 sm:h-18" />
              <div className="h-4 w-full max-w-md animate-pulse rounded bg-[color:var(--ink)]/10" />
              <div className="h-4 w-2/3 animate-pulse rounded bg-[color:var(--ink)]/10" />
              <div className="h-11 w-44 animate-pulse rounded-full bg-[color:var(--ink)]/15" />
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:col-span-4">
            <div className="min-h-[250px] flex-1 animate-pulse rounded-[24px] bg-[color:var(--orange)]/30 shadow-chip sm:min-h-[280px] lg:min-h-[310px]" />
            <div className="flex min-h-[160px] flex-col justify-between rounded-[24px] bg-[color:var(--panel)] p-5 shadow-chip sm:min-h-[185px] sm:p-6">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <div className="h-3 w-20 animate-pulse rounded bg-[color:var(--ink)]/10" />
                  <div className="h-7 w-36 animate-pulse rounded bg-[color:var(--ink)]/15" />
                </div>
                <div className="h-9 w-22 shrink-0 animate-pulse rounded bg-[color:var(--ink)]/10" />
              </div>
              <div className="mt-4 h-9 animate-pulse rounded-full bg-[color:var(--ink)]/10" />
              <div className="mt-2 flex justify-between gap-4">
                <div className="h-3 w-24 animate-pulse rounded bg-[color:var(--ink)]/10" />
                <div className="h-3 w-20 animate-pulse rounded bg-[color:var(--ink)]/10" />
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[210px] flex-col justify-between rounded-[22px] bg-[color:var(--panel)] p-5 shadow-chip sm:min-h-[235px] sm:p-6 lg:min-h-[255px]"
            >
              <div className="h-3 w-8 animate-pulse rounded bg-[color:var(--ink)]/10" />
              <div className="space-y-2">
                <div className="h-7 w-4/5 animate-pulse rounded bg-[color:var(--ink)]/15" />
                <div className="h-3 w-full animate-pulse rounded bg-[color:var(--ink)]/10" />
                <div className="h-3 w-2/3 animate-pulse rounded bg-[color:var(--ink)]/10" />
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
