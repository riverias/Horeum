import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { cn } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import type { Track } from "@/lib/types"

export function MoodsView() {
  const toast = useUiStore((s) => s.toast)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const [active, setActive] = useState<string | null>(null)
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  const { data: moods = [] } = useQuery({ queryKey: ["moods"], queryFn: api.moods, staleTime: Infinity })

  const pick = async (id: string, autoplay: boolean) => {
    setActive(id)
    setLoading(true)
    try {
      const list = await api.moodQueue(id, 60)
      setTracks(list)
      if (autoplay && list.length) playQueue(list, 0, "mood")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">По настроению</h1>
        <p className="mt-2 text-sm text-white/45">
          Каждое настроение — это набор жанров и поисковых тегов SoundCloud, смешанных в одну очередь.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {moods.map((m, i) => (
          <motion.button
            key={m.id}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ y: -6 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => void pick(m.id, true)}
            className={cn(
              "relative h-40 overflow-hidden rounded-3xl p-5 text-left shadow-panel",
              active === m.id && "ring-2 ring-white/60",
            )}
            style={{ background: m.gradient }}
          >
            <span className="text-4xl drop-shadow">{m.emoji}</span>
            <p className="mt-2 font-display text-xl font-extrabold drop-shadow">{m.name}</p>
            <p className="mt-1 line-clamp-2 text-[11px] text-white/75">{m.description}</p>
          </motion.button>
        ))}
      </div>

      {(loading || tracks.length > 0) && (
        <TrackList
          tracks={tracks}
          loading={loading}
          title={moods.find((m) => m.id === active)?.name ?? "Подборка"}
          source="mood"
        />
      )}
    </div>
  )
}
