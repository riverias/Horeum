import { useQuery } from "@tanstack/react-query"
import { ExternalLink, MapPin, Play, Radio, Shuffle, Users } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { SimilarArtists } from "@/components/SimilarArtists"
import { ActivityPanel } from "@/components/ActivityPanel"
import { formatCount, shuffleArray } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"

export function ArtistView({ id }: { id: number }) {
  const startWave = usePlayerStore((s) => s.startWave)

  const { data: user } = useQuery({
    queryKey: ["sc-user", id],
    queryFn: () => api.scUser(id),
    enabled: Number.isFinite(id),
  })
  const { data: tracks = [], isFetching } = useQuery({
    queryKey: ["sc-user-tracks", id],
    queryFn: () => api.scUserTracks(id, 60),
    enabled: Number.isFinite(id),
  })

  return (
    <div className="space-y-8">
      <header className="card flex flex-wrap items-center gap-6 p-7">
        <div className="h-32 w-32 shrink-0 overflow-hidden rounded-full bg-ink-800 shadow-panel">
          {user?.avatar ? (
            <img src={user.avatar} alt="" decoding="async" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center text-white/25">
              <Users size={32} />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">Артист</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">
            {user?.username ?? "…"}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-white/40">
            <span>{formatCount(user?.followers ?? 0)} подписчиков</span>
            <span>{user?.track_count ?? 0} треков</span>
            {(user?.city || user?.country) && (
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {[user?.city, user?.country].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
          {user?.description && (
            <p className="mt-3 line-clamp-3 max-w-2xl text-sm leading-relaxed text-white/45">
              {user.description}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-accent"
              disabled={!tracks.length}
              onClick={() => usePlayerStore.getState().playQueue(tracks, 0, "library")}
            >
              <Play size={16} /> Слушать
            </button>
            <button
              className="btn glass"
              disabled={!tracks.length}
              onClick={() =>
                usePlayerStore.getState().playQueue(shuffleArray(tracks), 0, "library")
              }
            >
              <Shuffle size={15} /> Вперемешку
            </button>
            <button className="btn glass" onClick={() => void startWave(tracks[0]?.id)}>
              <Radio size={15} /> Волна от артиста
            </button>
            {user && (
              <button className="btn glass" onClick={() => void openUrl(user.permalink_url)}>
                <ExternalLink size={15} /> SoundCloud
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-7 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <TrackList
            tracks={tracks}
            loading={isFetching}
            title="Треки"
            source="library"
            layoutSwitcher
          />
          <SimilarArtists artistId={id} seeds={tracks} />
        </div>

        <aside className="space-y-5">
          <ActivityPanel artistId={id} title="Новое у артиста" limit={8} />
          <ActivityPanel title="Активность друзей" limit={10} />
        </aside>
      </div>
    </div>
  )
}
