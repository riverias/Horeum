import { useQuery } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"

export function LibraryView() {
  const toast = useUiStore((s) => s.toast)
  const scUser = useProfileStore((s) => s.scUser)
  const refreshLikes = useProfileStore((s) => s.refreshLikes)

  const { data: tracks = [], isFetching, refetch } = useQuery({
    queryKey: ["liked"],
    queryFn: () => api.likedTracks(500),
  })

  const sync = async () => {
    try {
      const n = await api.syncScLikes()
      await Promise.all([refetch(), refreshLikes()])
      toast(`Импортировано лайков: ${n}`, "success")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold">Любимое</h1>
          <p className="mt-2 text-sm text-white/40">{tracks.length} треков в коллекции</p>
        </div>
        {scUser && (
          <button className="btn glass" onClick={sync}>
            <RefreshCw size={15} /> Синхронизировать с SoundCloud
          </button>
        )}
      </header>

      <TrackList
        tracks={tracks}
        loading={isFetching && tracks.length === 0}
        source="library"
        emptyText="Пока ничего не лайкнуто. Жми сердечко рядом с треком!"
      />
    </div>
  )
}
