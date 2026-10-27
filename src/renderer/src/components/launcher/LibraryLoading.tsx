import { Refresh2Filled } from '@mingcute/react/core-filled'
import { Skeleton } from '@/components/ui/skeleton'

function RowSkeleton({ cards }: { cards: number }) {
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 px-gutter">
        <Skeleton className="h-3.5 w-28 bg-white/8" />
        <Skeleton className="h-px flex-1 bg-white/5" />
      </div>
      <div className="flex gap-4 overflow-hidden px-gutter pt-6 pb-12">
        {Array.from({ length: cards }, (_, index) => (
          <Skeleton
            key={index}
            className="aspect-[2/3] w-[clamp(8.5rem,11vw,12rem)] shrink-0 rounded-[1.35rem] bg-white/5"
          />
        ))}
      </div>
    </div>
  )
}

export function LibraryLoading({ scanning }: { scanning: boolean }) {
  return (
    <div className="relative z-10 flex min-h-0 flex-1 flex-col justify-end pb-24">
      {scanning ? (
        <div className="mb-4 flex items-center gap-2 px-gutter text-caption text-white/40">
          <Refresh2Filled className="size-5 animate-spin" />
          Scanning your libraries…
        </div>
      ) : null}
      <RowSkeleton cards={7} />
      <RowSkeleton cards={6} />
      <RowSkeleton cards={5} />
    </div>
  )
}
