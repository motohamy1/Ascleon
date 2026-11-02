export default function LibraryLoading() {
  return (
    <main className="mx-auto w-full max-w-[1840px] 2xl:max-w-[2160px] px-3.5 pt-[108px] pb-16 sm:px-6 md:px-8 lg:px-10 xl:px-12 sm:pt-[116px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="h-8 w-40 animate-pulse rounded bg-white/10" />
          <div className="h-4 w-64 animate-pulse rounded bg-white/5" />
        </div>
        <div className="h-10 w-36 animate-pulse rounded-full bg-white/10" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 shadow-lg"
          >
            <div className="aspect-[3/4] w-full animate-pulse rounded-xl bg-white/10" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-white/10" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>
    </main>
  );
}
