import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as Tabs from "@radix-ui/react-tabs"
import { Heart, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"

export function LibraryView() {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)
  const scUser = useProfileStore((s) => s.scUser)

  const { data: liked = [], isFetching } = useQuery({
    queryKey: ["liked-tracks"],
    queryFn: () => api.likedTracks(),
  })
  const { data: scLikes = [], isFetching: scLoading } = useQuery({
    queryKey: ["my-likes"],
    queryFn: () => api.myLikes(50),
    enabled: !!scUser,
  })
  const { data: feed = [], isFetching: feedLoading } = useQuery({
    queryKey: ["my-stream"],
    queryFn: () => api.myStream(50),
    enabled: !!scUser,
  })

  const tabCls =
    "rounded-xl px-4 py-2 text-sm font-medium text-white/45 transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Heart size={24} className="text-[rgb(var(--accent-rgb))]" />
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Медиатека</h1>
        </div>
        {scUser && (
          <button
            className="btn glass"
            onClick={async () => {
              try {
                const n = await api.syncScLikes()
                await qc.invalidateQueries({ queryKey: ["liked-tracks"] })
                toast(`Синхронизировано ${n} треков из SoundCloud`, "success")
              } catch (e) {
                toast((e as Error).message, "error")
              }
            }}
          >
            <RefreshCw size={15} /> Синхронизировать лайки
          </button>
        )}
      </header>

      <Tabs.Root defaultValue="local">
        <Tabs.List className="mb-5 flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
          <Tabs.Trigger value="local" className={tabCls}>
            Любимое {liked.length > 0 && <span className="text-white/30">{liked.length}</span>}
          </Tabs.Trigger>
          <Tabs.Trigger value="sc" className={tabCls} disabled={!scUser}>
            Лайки SoundCloud
          </Tabs.Trigger>
          <Tabs.Trigger value="feed" className={tabCls} disabled={!scUser}>
            Лента
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="local">
          <TrackList
            tracks={liked}
            loading={isFetching}
            source="library"
            emptyText="Пока пусто — жми сердечко на треках"
          />
        </Tabs.Content>
        <Tabs.Content value="sc">
          <TrackList tracks={scLikes} loading={scLoading} source="library" />
        </Tabs.Content>
        <Tabs.Content value="feed">
          <TrackList tracks={feed} loading={feedLoading} source="library" />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
