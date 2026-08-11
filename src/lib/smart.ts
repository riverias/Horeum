import { api } from "@/lib/api"
import { shuffleArray, uniqueById } from "@/lib/utils"
import type { Track } from "@/lib/types"

export type SmartId = "forgotten" | "fresh" | "heavy"

export interface SmartPlaylist {
  id: SmartId
  name: string
  description: string
  emoji: string
  gradient: string
  tracks: Track[]
}

const WEEK = 7 * 24 * 60 * 60 * 1000

function timestamp(value?: string | null): number {
  if (!value) return 0
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

/**
 * Собирает три автоподборки из локальных данных и ленты SoundCloud.
 *
 * - «Забытое» — лайки, которых нет в последней истории прослушиваний;
 * - «Новинки недели» — свежие релизы из ленты подписок (запасной вариант — чарты);
 * - «Часто слушаю» — треки с наибольшим числом повторов в истории.
 */
export async function buildSmartPlaylists(): Promise<SmartPlaylist[]> {
  const [likedRes, historyRes, streamRes, chartsRes] = await Promise.allSettled([
    api.likedTracks(500),
    api.history(200),
    api.myStream(80),
    api.charts("trending", "all-music", 60),
  ])

  const liked = likedRes.status === "fulfilled" ? likedRes.value : []
  const history = historyRes.status === "fulfilled" ? historyRes.value : []
  const stream = streamRes.status === "fulfilled" ? streamRes.value : []
  const charts = chartsRes.status === "fulfilled" ? chartsRes.value : []

  // Забытое
  const recentIds = new Set(history.slice(0, 120).map((t) => t.id))
  const forgotten = shuffleArray(liked.filter((t) => !recentIds.has(t.id))).slice(0, 50)

  // Новинки недели
  const now = Date.now()
  const freshFromStream = stream
    .filter((t) => now - timestamp(t.created_at) <= 2 * WEEK)
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
  const freshFallback = charts
    .filter((t) => now - timestamp(t.created_at) <= 4 * WEEK)
    .sort((a, b) => timestamp(b.created_at) - timestamp(a.created_at))
  const fresh = uniqueById([...freshFromStream, ...freshFallback]).slice(0, 50)

  // Часто слушаю
  const counts = new Map<number, { track: Track; count: number }>()
  history.forEach((t) => {
    const entry = counts.get(t.id)
    if (entry) entry.count += 1
    else counts.set(t.id, { track: t, count: 1 })
  })
  const heavy = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map((e) => e.track)
    .slice(0, 50)

  return [
    {
      id: "forgotten",
      name: "Забытое",
      description: "Лайки, которые давно не играли",
      emoji: "\ud83d\udd70\ufe0f",
      gradient: "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
      tracks: forgotten,
    },
    {
      id: "fresh",
      name: "Новинки недели",
      description: "Свежие релизы твоих подписок",
      emoji: "\u2728",
      gradient: "linear-gradient(135deg, #f97316 0%, #db2777 100%)",
      tracks: fresh,
    },
    {
      id: "heavy",
      name: "Часто слушаю",
      description: "Твои самые повторяемые треки",
      emoji: "\ud83d\udd25",
      gradient: "linear-gradient(135deg, #0ea5e9 0%, #22c55e 100%)",
      tracks: heavy,
    },
  ]
}
