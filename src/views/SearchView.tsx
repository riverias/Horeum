import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import * as Tabs from "@radix-ui/react-tabs"
import { ListMusic, Search as SearchIcon, User } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { SkeletonList } from "@/components/SkeletonList"
import { formatCount, formatDuration } from "@/lib/utils"
import { useUiStore } from "@/store/ui"
import { usePlayerStore } from "@/store/player"

export function SearchView() {
  const navigate = useUiStore((s) => s.navigate)
  const [raw, setRaw] = useState("")
  const [query, setQuery] = useState("")

  useEffect(() => {
    const t = setTimeout(() => setQuery(raw.trim()), 380)
    return () => clearTimeout(t)
  }, [raw])

  const enabled = query.length > 1

  const { data: suggestions = [] } = useQuery({
    queryKey: ["autocomplete", query],
    queryFn: () => api.autocomplete(query),
    enabled: enabled && raw.trim() === query,
    staleTime: 5 * 60 * 1000,
  })

  const { data, isFetching } = useQuery({
    queryKey: ["search-all", query],
    queryFn: () => api.searchAll(query),
    enabled,
    staleTime: 5 * 60 * 1000,
  })

  const tracks = data?.tracks ?? []
  const playlists = data?.playlists ?? []
  const users = data?.users ?? []

  const tabCls =
    "rounded-xl px-4 py-2 text-sm font-medium text-white/45 transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"

  const placeholder = useMemo(
    () => ["Поиск треков, артистов, плейлистов…"][0],
    [],
  )

  return (
    <div className="space-y-7">
      <div className="relative">
        <SearchIcon size={20} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          autoFocus
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={placeholder}
          className="input h-14 w-full pl-12 text-base"
        />
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} className="chip" onClick={() => setRaw(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {!enabled ? (
        <div className="card grid place-items-center py-24 text-center">
          <SearchIcon size={40} className="text-white/15" />
          <p className="mt-4 text-sm text-white/35">Начни вводить — поиск идёт по всему SoundCloud</p>
        </div>
      ) : isFetching && tracks.length === 0 ? (
        <SkeletonList count={8} />
      ) : (
        <Tabs.Root defaultValue="tracks">
          <Tabs.List className="mb-5 flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
            <Tabs.Trigger value="tracks" className={tabCls}>
              Треки {tracks.length > 0 && <span className="text-white/30">{tracks.length}</span>}
            </Tabs.Trigger>
            <Tabs.Trigger value="playlists" className={tabCls}>
              Плейлисты
            </Tabs.Trigger>
            <Tabs.Trigger value="users" className={tabCls}>
              Профили
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="tracks">
            <TrackList
              tracks={tracks}
              source="search"
              layoutSwitcher
              emptyText="Ничего не нашлось"
            />
          </Tabs.Content>

          <Tabs.Content value="playlists">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-5">
              {playlists.map((p) => (
                <button
                  key={p.id}
                  onClick={async () => {
                    const full = await api.scPlaylist(p.id)
                    if (full.tracks.length) usePlayerStore.getState().playQueue(full.tracks, 0, "playlist")
                  }}
                  className="card group overflow-hidden p-3 text-left transition-transform hover:-translate-y-1"
                >
                  <div className="grid aspect-square place-items-center overflow-hidden rounded-xl bg-ink-800">
                    {p.artwork ? (
                      <img
                        src={p.artwork}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <ListMusic size={28} className="text-white/20" />
                    )}
                  </div>
                  <p className="mt-2.5 truncate text-[13px] font-semibold">{p.title}</p>
                  <p className="truncate text-[11px] text-white/35">{p.user}</p>
                  <p className="mt-1 text-[10px] text-white/25">
                    {p.track_count} треков • {formatDuration(p.duration)}
                  </p>
                </button>
              ))}
              {playlists.length === 0 && <p className="text-sm text-white/35">Плейлистов нет</p>}
            </div>
          </Tabs.Content>

          <Tabs.Content value="users">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => navigate("artist", u.id)}
                  className="card p-4 text-center transition-transform hover:-translate-y-1"
                >
                  <div className="mx-auto grid h-20 w-20 place-items-center overflow-hidden rounded-full bg-ink-800">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <User size={24} className="text-white/20" />
                    )}
                  </div>
                  <p className="mt-3 truncate text-[13px] font-semibold">{u.username}</p>
                  <p className="text-[11px] text-white/35">{formatCount(u.followers)} подп.</p>
                </button>
              ))}
              {users.length === 0 && <p className="text-sm text-white/35">Профилей нет</p>}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  )
}
