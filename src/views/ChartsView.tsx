import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { cn } from "@/lib/utils"

export function ChartsView() {
  const [kind, setKind] = useState<"top" | "trending">("top")
  const [genre, setGenre] = useState("all-music")

  const { data: genres = [] } = useQuery({ queryKey: ["genres"], queryFn: api.genres })
  const { data: tracks = [], isFetching } = useQuery({
    queryKey: ["charts", kind, genre],
    queryFn: () => api.charts(kind, genre, 50),
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold">Чарты</h1>
          <p className="mt-2 text-sm text-white/40">Самое горячее на SoundCloud прямо сейчас</p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
          {(["top", "trending"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cn(
                "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                kind === k ? "bg-white/10 text-white" : "text-white/45 hover:text-white",
              )}
            >
              {k === "top" ? "Топ 50" : "Набирают популярность"}
            </button>
          ))}
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        {genres.map((g) => (
          <button
            key={g.id}
            onClick={() => setGenre(g.id)}
            className={cn("chip", genre === g.id && "chip-active")}
          >
            {g.name}
          </button>
        ))}
      </div>

      <TrackList tracks={tracks} loading={isFetching} source="charts" />
    </div>
  )
}
