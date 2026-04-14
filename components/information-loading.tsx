export function InformationLoading() {
  return (
    <section className="relative mx-auto flex w-full max-w-[1540px] flex-col gap-4 px-3 py-3 text-white sm:px-5 lg:px-6 lg:py-4">
      <div className="information-shell overflow-hidden rounded-[1.7rem] border border-amber-300/20 shadow-[0_28px_90px_rgba(0,0,0,0.5)]">
        <div className="border-b border-white/8 px-4 py-3" />
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-[minmax(0,1.18fr)_360px] sm:px-5">
          <div className="space-y-4">
            <div className="h-5 w-44 animate-pulse rounded-full bg-amber-300/12" />
            <div className="h-24 max-w-3xl animate-pulse rounded-[1.2rem] bg-white/8" />
            <div className="h-[4.5rem] max-w-2xl animate-pulse rounded-[1rem] bg-white/6" />
            <div className="h-10 w-56 animate-pulse rounded-full bg-white/8" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-[7.5rem] animate-pulse rounded-[1rem] border border-white/10 bg-white/6"
              />
            ))}
          </div>
        </div>
        <div className="border-t border-white/8 px-4 py-3 sm:px-5">
          <div className="h-12 animate-pulse rounded-full border border-white/10 bg-white/[0.04]" />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.16fr)_336px]">
        <div className="h-[1000px] animate-pulse rounded-[1.5rem] border border-white/10 bg-white/[0.04]" />
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-[8.5rem] animate-pulse rounded-[1.2rem] border border-white/10 bg-white/[0.04]"
            />
          ))}
        </div>
      </div>
    </section>
  );
}
