import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as ContextMenu from "@radix-ui/react-context-menu"
import {
  Clock3,
  Copy,
  Download,
  FileDown,
  Heart,
  Link2,
  ListMusic,
  Pin,
  Play,
  Plus,
  Search,
  Shuffle,
  Trash2,
} from "lucide-react"
import { api } from "@/lib/api"
import { apix } from "@/lib/apiExt"
import { cn, formatDuration, shuffleArray } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import { ConfirmDialog, PromptDialog } from "@/components/Dialog"
import type { Playlist } from "@/lib/types"

/** Градиенты обложек для плейлистов без картинки. */
export const PLAYLIST_GRADIENTS: Record<string, string> = {
  violet: "linear-gradient(140deg, #7c3aed, #2563eb)",
  orange: "linear-gradient(140deg, #ff5500, #f59e0b)",
  blue: "linear-gradient(140deg, #0ea5e9, #6366f1)",
  green: "linear-gradient(140deg, #22c55e, #0d9488)",
  pink: "linear-gradient(140deg, #ec4899, #8b5cf6)",
  red: "linear-gradient(140deg, #ef4444, #f97316)",
  gray: "linear-gradient(140deg, #475569, #1e293b)",
}

export function gradientFor(color: string | undefined) {
  return PLAYLIST_GRADIENTS[color ?? "violet"] ?? PLAYLIST_GRADIENTS.violet
}

type Sort = "recent" | "name" | "size" | "created"

export function PlaylistsView() {
  const qc = useQueryClient()
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)
  const playQueue = usePlayerStore((s) => s.playQueue)

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("recent")
  const [createOpen, setCreateOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [toDelete, setToDelete] = useState<Playlist | null>(null)

  const { data: playlists = [], isFetching, refetch } = useQuery({
    queryKey: ["playlists"],
    queryFn: api.playlists,
  })

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = playlists.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q),
    )
    const sorted = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name, "ru")
      if (sort === "size") return b.track_count - a.track_count
      if (sort === "created") return b.created_at.localeCompare(a.created_at)
      return b.updated_at.localeCompare(a.updated_at)
    })
    return sorted.sort((a, b) => Number(b.pinned) - Number(a.pinned))
  }, [playlists, query, sort])

  const totals = useMemo(
    () => ({
      count: playlists.length,
      tracks: playlists.reduce((sum, p) => sum + p.track_count, 0),
      duration: playlists.reduce((sum, p) => sum + p.duration, 0),
    }),
    [playlists],
  )

  const openAndPlay = async (pl: Playlist, shuffle = false) => {
    try {
      const full = await api.playlist(pl.id)
      if (!full.tracks.length) {
        toast("В плейлисте пока нет треков", "info")
        return
      }
      const tracks = shuffle ? shuffleArray(full.tracks) : full.tracks
      await playQueue(tracks, 0, "playlist")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const duplicate = async (pl: Playlist) => {
    try {
      const full = await api.playlist(pl.id)
      const copy = await api.createPlaylist(`${pl.name} (копия)`, pl.description, pl.color)
      if (full.tracks.length) await api.addToPlaylist(copy.id, full.tracks)
      await refetch()
      toast("Плейлист скопирован", "success")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const exportPlaylist = async (pl: Playlist) => {
    try {
      const full = await api.playlist(pl.id)
      const text = full.tracks.map((t) => `${t.artist} — ${t.title}`).join("\n")
      const path = await apix.saveTextFile(`${pl.name}.txt`, text)
      if (path) toast("Список треков сохранён", "success")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const downloadAll = async (pl: Playlist) => {
    try {
      const full = await api.playlist(pl.id)
      toast(`Скачиваю ${full.tracks.length} треков…`, "info")
      for (const t of full.tracks) {
        await usePlayerStore.getState().downloadTrack(t)
      }
      toast("Загрузка плейлиста завершена", "success")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const item =
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-white/80 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"

  const SORTS: Array<[Sort, string]> = [
    ["recent", "По обновлению"],
    ["created", "По дате создания"],
    ["name", "По названию"],
    ["size", "По числу треков"],
  ]

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">Плейлисты</h1>
          <p className="mt-1 text-sm text-white/40">
            {totals.count} плейлистов • {totals.tracks} треков • {formatDuration(totals.duration)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-accent" onClick={() => setCreateOpen(true)}>
            <Plus size={15} /> Создать
          </button>
          <button className="btn glass" onClick={() => setImportOpen(true)}>
            <Link2 size={15} /> Импорт по ссылке
          </button>
        </div>
      </header>

      {/* быстрые подборки */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { id: "library" as const, label: "Любимое", icon: Heart, grad: PLAYLIST_GRADIENTS.pink },
          { id: "history" as const, label: "История", icon: Clock3, grad: PLAYLIST_GRADIENTS.blue },
          { id: "downloads" as const, label: "Скачанное", icon: Download, grad: PLAYLIST_GRADIENTS.green },
        ].map(({ id, label, icon: Icon, grad }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className="group flex items-center gap-3 overflow-hidden rounded-2xl border border-white/5 bg-white/[0.04] pr-4 text-left transition-transform hover:-translate-y-0.5"
          >
            <span className="grid h-16 w-16 shrink-0 place-items-center" style={{ background: grad }}>
              <Icon size={22} className="text-white" />
            </span>
            <span className="text-sm font-semibold">{label}</span>
            <Play
              size={16}
              className="ml-auto text-white/25 transition-colors group-hover:text-[rgb(var(--accent-rgb))]"
            />
          </button>
        ))}
      </div>

      {/* поиск и сортировка */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти плейлист…"
            className="input h-11 w-full pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map(([id, label]) => (
            <button
              key={id}
              className={cn("chip", sort === id && "chip-active")}
              onClick={() => setSort(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* сетка плейлистов */}
      {visible.length === 0 ? (
        <div className="card grid place-items-center px-6 py-20 text-center">
          <ListMusic size={38} className="text-white/15" />
          <p className="mt-4 text-sm text-white/40">
            {isFetching ? "Загружаю…" : "Плейлистов пока нет — создай первый или импортируй по ссылке"}
          </p>
        </div>
      ) : (
        <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {visible.map((pl) => (
            <ContextMenu.Root key={pl.id}>
              <ContextMenu.Trigger asChild>
                <div
                  onClick={() => navigate("playlist", pl.id)}
                  className="card group cursor-pointer p-3 transition-transform hover:-translate-y-1"
                >
                  <div
                    className="relative aspect-square overflow-hidden rounded-2xl"
                    style={{ background: gradientFor(pl.color) }}
                  >
                    {pl.cover ? (
                      <img
                        src={pl.cover}
                        alt=""
                        decoding="async"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <span className="grid h-full w-full place-items-center">
                        <ListMusic size={34} className="text-white/80" />
                      </span>
                    )}

                    {pl.pinned && (
                      <span className="absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55">
                        <Pin size={13} className="text-white" />
                      </span>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void openAndPlay(pl)
                      }}
                      className="absolute bottom-2.5 right-2.5 grid h-11 w-11 translate-y-2 place-items-center rounded-full bg-[rgb(var(--accent-rgb))] text-black opacity-0 shadow-glow transition-all group-hover:translate-y-0 group-hover:opacity-100"
                    >
                      <Play size={17} />
                    </button>
                  </div>

                  <p className="mt-3 truncate text-[14px] font-semibold">{pl.name}</p>
                  <p className="truncate text-[11px] text-white/35">
                    {pl.description || `${pl.track_count} треков`}
                  </p>
                  <p className="mt-1 text-[10px] tabular-nums text-white/25">
                    {formatDuration(pl.duration)}
                  </p>
                </div>
              </ContextMenu.Trigger>

              <ContextMenu.Portal>
                <ContextMenu.Content className="glass-strong z-[80] min-w-[220px] rounded-xl p-1.5 shadow-panel">
                  <ContextMenu.Item className={item} onSelect={() => void openAndPlay(pl)}>
                    <Play size={14} /> Слушать
                  </ContextMenu.Item>
                  <ContextMenu.Item className={item} onSelect={() => void openAndPlay(pl, true)}>
                    <Shuffle size={14} /> Вперемешку
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-1.5 h-px bg-white/10" />
                  <ContextMenu.Item
                    className={item}
                    onSelect={async () => {
                      await api.updatePlaylist(pl.id, { pinned: !pl.pinned })
                      await refetch()
                    }}
                  >
                    <Pin size={14} /> {pl.pinned ? "Открепить" : "Закрепить"}
                  </ContextMenu.Item>
                  <ContextMenu.Item className={item} onSelect={() => void duplicate(pl)}>
                    <Copy size={14} /> Дублировать
                  </ContextMenu.Item>
                  <ContextMenu.Item className={item} onSelect={() => void exportPlaylist(pl)}>
                    <FileDown size={14} /> Экспорт списком
                  </ContextMenu.Item>
                  <ContextMenu.Item className={item} onSelect={() => void downloadAll(pl)}>
                    <Download size={14} /> Скачать все треки
                  </ContextMenu.Item>
                  <ContextMenu.Separator className="my-1.5 h-px bg-white/10" />
                  <ContextMenu.Item
                    className={cn(item, "text-red-300")}
                    onSelect={() => setToDelete(pl)}
                  >
                    <Trash2 size={14} /> Удалить
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
            </ContextMenu.Root>
          ))}
        </div>
      )}

      <PromptDialog
        open={createOpen}
        title="Новый плейлист"
        description="Как его назовём?"
        label="Название"
        defaultValue="Новый плейлист"
        maxLength={60}
        confirmText="Создать"
        onCancel={() => setCreateOpen(false)}
        onSubmit={async (name) => {
          setCreateOpen(false)
          if (!name.trim()) return
          try {
            const pl = await api.createPlaylist(name.trim())
            await qc.invalidateQueries({ queryKey: ["playlists"] })
            navigate("playlist", pl.id)
          } catch (e) {
            toast((e as Error).message, "error")
          }
        }}
      />

      <PromptDialog
        open={importOpen}
        title="Импорт плейлиста"
        description="Ссылка на SoundCloud, Spotify, YouTube или Яндекс.Музыку"
        label="Ссылка"
        placeholder="https://…"
        confirmText="Импортировать"
        onCancel={() => setImportOpen(false)}
        onSubmit={async (url) => {
          setImportOpen(false)
          const value = url.trim()
          if (!value) return
          try {
            if (value.includes("soundcloud.com")) {
              const pl = await api.importScPlaylist(value)
              await qc.invalidateQueries({ queryKey: ["playlists"] })
              navigate("playlist", pl.id)
              toast(`Импортирован «${pl.name}»`, "success")
            } else {
              const list = await apix.importLink(value)
              await qc.invalidateQueries({ queryKey: ["playlists"] })
              toast(`Найдено ${list.tracks.length} треков (${list.source})`, "success")
            }
          } catch (e) {
            toast((e as Error).message, "error")
          }
        }}
      />

      <ConfirmDialog
        open={!!toDelete}
        title={`Удалить «${toDelete?.name ?? ""}»?`}
        description="Плейлист удалится безвозвратно, сами треки останутся на месте."
        confirmText="Удалить"
        danger
        onCancel={() => setToDelete(null)}
        onConfirm={async () => {
          if (!toDelete) return
          try {
            await api.deletePlaylist(toDelete.id)
            await qc.invalidateQueries({ queryKey: ["playlists"] })
            toast("Плейлист удалён", "success")
          } catch (e) {
            toast((e as Error).message, "error")
          } finally {
            setToDelete(null)
          }
        }}
      />
    </div>
  )
}
