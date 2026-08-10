import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import * as Tabs from "@radix-ui/react-tabs"
import { Loader2, Music2, Search, Users } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { cn, formatCount } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

const QUICK = ["phonk", "lo-fi", "drum and bass", "hyperpop", "russian rap", "techno", "ambient", "jazz"]

export function SearchView() {
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState("tracks")
  const navigate = useUiStore((s) => s.navigate)
  const playQueue = usePlayerStore((s) => s.playQueue)

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 420)
    return () => clearTimeout(t)
  }, [input])

  const { data: suggestions = [] } = useQuery({
    queryKey: ["autocomplete", input],
    queryFn: () => api.autocomplete(input),
    enabled: input.trim().length >= 2,
  })

  const { data, isFetching } = useQuery({
    queryKey: ["search", query],
    queryFn: () => api.searchAll(query),
    enabled: query.length >= 2,
  })

  const tracks = useMemo(() => data?.tracks ?? [], [data])

  const tabCls = (v: string) =>
    cn(
      "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
      tab === v ? "bg-white/10 text-white" : "text-white/45 hover:text-white",
    )

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search size={19} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Найти треки, артистов, плейлисты на SoundCloud…"
          className="input h-14 rounded-2xl pl-12 pr-12 text-base"
        />
        {isFetching && (
          <Loader2 size={18} className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-white/40" />
        )}
      </div>

      {!query && (
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} className="chip" onClick={() => setInput(q)}>
              {q}
            </button>
          ))}
        </div>
      )}

      {suggestions.length > 0 && input && input !== query && (
        <div className="flex flex-wrap gap-2">
          {suggestions.slice(0, 8).map((s) => (
            <button key={s} className="chip" onClick={() => setInput(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {query.length >= 2 && (
        <Tabs.Root value={tab} onValueChange={setTab}>
          <Tabs.List className="mb-4 flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
            <Tabs.Trigger value="tracks" className={tabCls("tracks")}>
              Треки {tracks.length > 0 && `(${tracks.length})`}
            </Tabs.Trigger>
            <Tabs.Trigger value="playlists" className={tabCls("playlists")}>
              Плейлисты
            </Tabs.Trigger>
            <Tabs.Trigger value="users" className={tabCls("users")}>
              Артисты
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="tracks">
            <TrackList
              tracks={tracks}
              loading={isFetching && !data}
              source="search"
              subtitle={`Результаты по «${query}»`}
              emptyText="Ничего не найдено — попробуй другой запрос"
            />
          </Tabs.Content>

          <Tabs.Content value="playlists">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
              {(data?.playlists ?? []).map((pl) => (
                <button
                  key={pl.id}
                  onClick={async () => {
                    const full = await api.scPlaylist(pl.id)
                    void playQueue(full.tracks, 0, "playlist")
                  }}
                  className="group text-left"
                >
                  <div className="aspect-square overflow-hidden rounded-2xl bg-ink-800 shadow-panel">
                    {pl.artwork ? (
                      <img
                        src={pl.artwork}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-white/20">
                        <Music2 size={26} />
                      </div>
                    )}
                  </div>
                  <p className="mt-2.5 truncate text-[13px] font-semibold">{pl.title}</p>
                  <p className="truncate text-[11px] text-white/35">
                    {pl.owner} • {pl.track_count} треков
                  </p>
                </button>
              ))}
            </div>
          </Tabs.Content>

          <Tabs.Content value="users">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-6">
              {(data?.users ?? []).map((u) => (
                <button
                  key={u.id}
                  onClick={() => navigate("artist", u.id)}
                  className="card flex flex-col items-center gap-3 p-5 text-center"
                >
                  <div className="h-20 w-20 overflow-hidden rounded-full bg-ink-800">
                    {u.avatar ? (
                      <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-white/25">
                        <Users size={22} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{u.username}</p>
                    <p className="text-[11px] text-white/35">{formatCount(u.followers)} подписчиков</p>
                  </div>
                </button>
              ))}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      )}
    </div>
  )
}
