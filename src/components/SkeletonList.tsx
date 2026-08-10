export function SkeletonList({ count = 8 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
          <div className="skeleton h-4 w-5" />
          <div className="skeleton h-11 w-11 rounded-lg" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5" style={{ width: `${45 + ((i * 13) % 35)}%` }} />
            <div className="skeleton h-2.5" style={{ width: `${25 + ((i * 7) % 20)}%` }} />
          </div>
          <div className="skeleton h-3 w-10" />
        </div>
      ))}
    </div>
  )
}

export function SkeletonGrid({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3">
          <div className="skeleton aspect-square rounded-2xl" />
          <div className="skeleton h-3.5 w-3/4" />
          <div className="skeleton h-2.5 w-1/2" />
        </div>
      ))}
    </div>
  )
}
