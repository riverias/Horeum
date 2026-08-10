import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { useUiStore } from "@/store/ui"
import type { Mood, Track } from "@/lib/types"

export function MoodsView() {
  const { data: moods = [] } = useQuery({ queryKey: ["moods"], queryFn: api.moods })
  const [active, setActive] = useState<Mood | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const toast = useUiStore((s) => s.toast)

  const pick = async (mood: Mood) => {
    setActive(mood)
    setLoading(true)
    try {
      setTracks(await api.moodQueue(mood.id, 60))
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-extrabold">Настроения</h1>
        <p className="mt-2 text-sm text-white/40">
          Выбери вайб — соберём подборку из SoundCloud под него.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {moods.map((m) => (
          <motion.button
            key={m.id}
            whileHover={{ y: -5, scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => void pick(m)}
            className={`relative h-36 overflow-hidden rounded-3xl p-5 text-left shadow-panel transition-shadow ${
              active?.id === m.id ? "ring-2 ring-white/70" : ""
            }`}
            style={{ backgroundImage: m.gradient }}
          >
            <div className="absolute inset-0 bg-black/25" />
            <div className="relative z-10 flex h-full flex-col justify-between">
              <span className="text-4xl drop-shadow-lg">{m.emoji}</span>
              <div>
                <p className="font-display text-xl font-extrabold text-white drop-shadow">{m.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/70">
                  {m.queries.slice(0, 3).join(" • ")}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </div>

      {active && (
        <TrackList
          tracks={tracks}
          loading={loading}
          title={`${active.emoji} ${active.name}`}
          subtitle={`${tracks.length} треков под настроение`}
          source="mood"
        />
      )}
    </div>
  )
}
