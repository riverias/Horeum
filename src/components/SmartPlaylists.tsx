import { useQuery, useQueryClient } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Play, Plus, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { buildSmartPlaylists } from "@/lib/smart"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

/** Карточки автоподборок: играть сразу или сохранить в обычный плейлист. */
export function SmartPlaylists() {
  const toast = useUiStore((s) => s.toast)
  const qc = useQueryClient()
  const { data = [], isFetching } = useQuery({
    queryKey: ["smart-playlists"],
    queryFn: buildSmartPlaylists,
    staleTime: 10 * 60 * 1000,
  })

  const lists = data.filter((p) => p.tracks.length > 0)
  if (!lists.length && !isFetching) return null

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between">
        <h2 className="section-title text-xl flex items-center gap-2">
          <Sparkles size={18} /> Умные подборки
        </h2>
        <span className="text-xs text-white/30">Обновляются автоматически</span>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {lists.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={{ y: -4 }}
            className="relative overflow-hidden rounded-2xl p-5 shadow-panel"
            style={{ background: p.gradient }}
          >
            <div className="relative z-10">
              <span className="text-3xl">{p.emoji}</span>
              <h3 className="mt-2 font-display text-xl font-extrabold drop-shadow">{p.name}</h3>
              <p className="mt-1 text-xs text-white/75">{p.description}</p>
              <p className="mt-1 text-[11px] text-white/60">{p.tracks.length} треков</p>

              <div className="mt-4 flex gap-2">
                <button
                  className="btn glass"
                  onClick={() => void usePlayerStore.getState().playQueue(p.tracks, 0, "library")}
                >
                  <Play size={15} /> Слушать
                </button>
                <button
                  className="btn glass"
                  title="Сохранить как плейлист"
                  onClick={async () => {
                    try {
                      const created = await api.createPlaylist(p.name, p.description, "violet")
                      await api.addToPlaylist(created.id, p.tracks)
                      await qc.invalidateQueries({ queryKey: ["playlists"] })
                      toast(`Плейлист «${p.name}» сохранён`, "success")
                    } catch (e) {
                      toast((e as Error).message, "error")
                    }
                  }}
                >
                  <Plus size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
