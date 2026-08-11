import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Users } from "lucide-react"
import { api } from "@/lib/api"
import { useUiStore } from "@/store/ui"
import type { Track } from "@/lib/types"

interface SimilarArtist {
  id: number
  name: string
  avatar?: string
  weight: number
}

/**
 * Похожие артисты: берём related-треки по нескольким верхним трекам артиста
 * и считаем, чьи треки встречаются чаще всего.
 */
export function SimilarArtists({ artistId, seeds }: { artistId: number; seeds: Track[] }) {
  const navigate = useUiStore((s) => s.navigate)
  const seedIds = seeds.slice(0, 3).map((t) => t.id)

  const { data = [] } = useQuery({
    queryKey: ["similar-artists", artistId, seedIds.join(",")],
    enabled: seedIds.length > 0,
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<SimilarArtist[]> => {
      const chunks = await Promise.allSettled(seedIds.map((id) => api.related(id)))
      const map = new Map<number, SimilarArtist>()
      chunks.forEach((c) => {
        if (c.status !== "fulfilled") return
        c.value.forEach((t) => {
          if (!t.artist_id || t.artist_id === artistId) return
          const found = map.get(t.artist_id)
          if (found) {
            found.weight += 1
            if (!found.avatar && t.artist_avatar) found.avatar = t.artist_avatar
          } else {
            map.set(t.artist_id, {
              id: t.artist_id,
              name: t.artist,
              avatar: t.artist_avatar,
              weight: 1,
            })
          }
        })
      })
      return [...map.values()].sort((a, b) => b.weight - a.weight).slice(0, 12)
    },
  })

  if (!data.length) return null

  return (
    <section className="space-y-4">
      <h2 className="section-title flex items-center gap-2 text-xl">
        <Users size={18} /> Похожие артисты
      </h2>
      <div className="grid grid-cols-3 gap-4 md:grid-cols-4 xl:grid-cols-6">
        {data.map((a, i) => (
          <motion.button
            key={a.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            whileHover={{ y: -4 }}
            onClick={() => navigate("artist", a.id)}
            className="card flex flex-col items-center gap-2 p-4 text-center"
          >
            <div className="h-20 w-20 overflow-hidden rounded-full bg-ink-800">
              {a.avatar ? (
                <img src={a.avatar} alt="" decoding="async" className="h-full w-full object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-white/25">
                  <Users size={20} />
                </div>
              )}
            </div>
            <p className="line-clamp-2 text-[12px] font-semibold">{a.name}</p>
          </motion.button>
        ))}
      </div>
    </section>
  )
}
