import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Play, Users } from "lucide-react"
import { api } from "@/lib/api"
import { formatCount } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import type { Track } from "@/lib/types"

function ago(value?: string | null): string {
  if (!value) return ""
  const t = Date.parse(value)
  if (!Number.isFinite(t)) return ""
  const diff = Date.now() - t
  const minutes = Math.round(diff / 60_000)
  if (minutes < 60) return `${Math.max(1, minutes)} мин назад`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} ч назад`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days} дн. назад`
  return new Date(t).toLocaleDateString("ru-RU")
}

/**
 * Лента активности подписок SoundCloud.
 * `artistId` — если задан, показываем только посты этого артиста.
 */
export function ActivityPanel({
  artistId,
  limit = 12,
  title = "Активность друзей",
}: {
  artistId?: number
  limit?: number
  title?: string
}) {
  const navigate = useUiStore((s) => s.navigate)
  const { data = [], isFetching } = useQuery({
    queryKey: ["my-stream", 80],
    queryFn: () => api.myStream(80),
    staleTime: 5 * 60 * 1000,
    retry: false,
  })

  const items: Track[] = (artistId ? data.filter((t) => t.artist_id === artistId) : data).slice(
    0,
    limit,
  )

  if (!items.length) {
    if (isFetching) return null
    return (
      <div className="card p-5 text-sm text-white/40">
        <p className="flex items-center gap-2 font-semibold text-white/60">
          <Users size={16} /> {title}
        </p>
        <p className="mt-2 text-xs">
          Лента пуста. Войди в SoundCloud и подпишись на артистов — здесь появятся их новые треки.
        </p>
      </div>
    )
  }

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-white/70">
          <Users size={16} /> {title}
        </h3>
        <span className="text-[11px] text-white/25">{items.length}</span>
      </div>

      <div className="space-y-1">
        {items.map((t, i) => (
          <motion.div
            key={`${t.id}-${i}`}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            className="group flex items-center gap-3 rounded-xl p-2 hover:bg-white/5"
          >
            <button
              className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-800"
              onClick={() => usePlayerStore.getState().playQueue(items, i, "library")}
            >
              {t.artwork && (
                <img
                  src={t.artwork}
                  alt=""
                  decoding="async"
                  className="h-full w-full object-cover transition group-hover:scale-105"
                />
              )}
              <span className="absolute inset-0 hidden place-items-center bg-black/45 group-hover:grid">
                <Play size={16} />
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold">{t.title}</p>
              <button
                className="truncate text-[11px] text-white/35 hover:text-white/70"
                onClick={() => t.artist_id && navigate("artist", t.artist_id)}
              >
                {t.artist}
              </button>
            </div>

            <div className="shrink-0 text-right text-[10px] text-white/25">
              <p>{ago(t.created_at)}</p>
              <p>{formatCount(t.playback_count)} просл.</p>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
