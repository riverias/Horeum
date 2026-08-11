import { useMemo, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import * as DropdownMenu from "@radix-ui/react-dropdown-menu"
import {
  ArrowLeft,
  Copy,
  Download,
  FileDown,
  Image as ImageIcon,
  ListEnd,
  ListMusic,
  MoreHorizontal,
  Palette,
  Pencil,
  Pin,
  Play,
  Radio,
  Search,
  Shuffle,
  Trash2,
} from "lucide-react"
import { api } from "@/lib/api"
import { apix } from "@/lib/apiExt"
import { TrackList } from "@/components/TrackList"
import { LayoutSwitcher } from "@/components/LayoutSwitcher"
import { ConfirmDialog, PromptDialog } from "@/components/Dialog"
import { cn, formatDuration, shuffleArray } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import { PLAYLIST_GRADIENTS, gradientFor } from "@/views/PlaylistsView"
import type { Track } from "@/lib/types"

type Sort = "manual" | "title" | "artist" | "duration" | "plays"
type DialogKind = null | "name" | "description" | "coverUrl"

const SORTS: Array<[Sort, string]> = [
  ["manual", "Мой порядок"],
  ["title", "По названию"],
  ["artist", "По артисту"],
  ["duration", "По длительности"],
  ["plays", "По прослушиваниям"],
]

export function PlaylistView({ id }: { id: number }) {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)
  const navigate = useUiStore((s) => s.navigate)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const appendToQueue = usePlayerStore((s) => s.appendToQueue)
  const startWave = usePlayerStore((s) => s.startWave)
  const downloadTrack = usePlayerStore((s) => s.downloadTrack)

  const [query, setQuery] = useState("")
  const [sort, setSort] = useState<Sort>("manual")
  const [dialog, setDialog] = useState<DialogKind>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data: pl, isLoading, refetch } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api.playlist(id),
    enabled: Number.isFinite(id),
  })

  const tracks: Track[] = pl?.tracks ?? []

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q
      ? tracks.filter(
          (t) => t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q),
        )
      : [...tracks]
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title, "ru"))
    if (sort === "artist") list.sort((a, b) => a.artist.localeCompare(b.artist, "ru"))
    if (sort === "duration") list.sort((a, b) => b.duration - a.duration)
    if (sort === "plays") list.sort((a, b) => b.playback_count - a.playback_count)
    return list
  }, [tracks, query, sort])

  if (isLoading || !pl) {
    return <TrackList tracks={[]} loading title="Плейлист" actions={false} />
  }

  const patch = async (data: Parameters<typeof api.updatePlaylist>[1]) => {
    try {
      await api.updatePlaylist(pl.id, data)
      await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["playlists"] })])
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const move = async (index: number, dir: -1 | 1) => {
    const arr = [...tracks]
    const target = index + dir
    if (target < 0 || target >= arr.length) return
    const tmp = arr[index]
    arr[index] = arr[target]
    arr[target] = tmp
    try {
      await api.reorderPlaylist(pl.id, arr.map((t) => t.id))
      await refetch()
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const pickCover = async () => {
    try {
      const media = await apix.pickMedia("image")
      if (media) await patch({ cover: media.url })
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const downloadAll = async () => {
    toast(`Скачиваю ${tracks.length} треков…`, "info")
    for (const t of tracks) await downloadTrack(t)
    toast("Готово", "success")
  }

  const menuItem =
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-white/80 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"

  return (
    <div className="space-y-6">
      {/* ===== Spotify-подобная шапка ===== */}
      <header
        className="relative -mx-8 -mt-6 overflow-hidden px-8 pb-8 pt-10"
        style={{ background: gradientFor(pl.color) }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/45 to-ink-950" />

        <div className="relative flex flex-wrap items-end gap-7">
          <button
            onClick={() => navigate("playlists")}
            className="absolute -top-4 left-0 flex items-center gap-1.5 text-xs text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft size={14} /> К плейлистам
          </button>

          <button
            onClick={pickCover}
            title="Сменить обложку"
            className="group relative h-52 w-52 shrink-0 overflow-hidden rounded-2xl shadow-panel"
            style={{ background: gradientFor(pl.color) }}
          >
            {pl.cover ? (
              <img src={pl.cover} alt="" decoding="async" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center">
                <ListMusic size={64} className="text-white/85" />
              </span>
            )}
            <span className="absolute inset-0 grid place-items-center bg-black/55 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100">
              <ImageIcon size={22} />
              Сменить обложку
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/70">
              {pl.pinned ? "Закреплённый плейлист" : "Плейлист"}
            </p>
            <button
              onClick={() => setDialog("name")}
              className="mt-2 block max-w-full truncate text-left font-display text-6xl font-extrabold leading-none tracking-tight transition-opacity hover:opacity-80"
            >
              {pl.name}
            </button>
            <button
              onClick={() => setDialog("description")}
              className="mt-3 block max-w-2xl text-left text-sm text-white/65 transition-colors hover:text-white"
            >
              {pl.description || "Добавить описание…"}
            </button>
            <p className="mt-3 text-xs text-white/60">
              {pl.track_count} треков • {formatDuration(pl.duration)} • обновлён{" "}
              {new Date(pl.updated_at).toLocaleDateString("ru-RU")}
            </p>
          </div>
        </div>

        {/* панель действий */}
        <div className="relative mt-7 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void playQueue(tracks, 0, "playlist")}
            disabled={tracks.length === 0}
            className="grid h-14 w-14 place-items-center rounded-full bg-[rgb(var(--accent-rgb))] text-black shadow-glow transition-transform hover:scale-105 disabled:opacity-40"
            title="Слушать"
          >
            <Play size={24} />
          </button>
          <button
            className="btn glass"
            disabled={tracks.length === 0}
            onClick={() => void playQueue(shuffleArray(tracks), 0, "playlist")}
          >
            <Shuffle size={15} /> Вперемешку
          </button>
          <button
            className="btn glass"
            disabled={tracks.length === 0}
            onClick={() => void startWave(tracks[0]?.id)}
          >
            <Radio size={15} /> Волна
          </button>
          <button
            className="btn glass"
            disabled={tracks.length === 0}
            onClick={() => {
              appendToQueue(tracks)
              toast("Добавлено в очередь", "success")
            }}
          >
            <ListEnd size={15} /> В очередь
          </button>
          <button className="btn glass" onClick={() => void patch({ pinned: !pl.pinned })}>
            <Pin size={15} /> {pl.pinned ? "Открепить" : "Закрепить"}
          </button>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="btn glass" title="Ещё">
                <MoreHorizontal size={16} />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                sideOffset={8}
                className="glass-strong z-[80] min-w-[230px] rounded-xl p-1.5 shadow-panel"
              >
                <DropdownMenu.Item className={menuItem} onSelect={() => setDialog("name")}>
                  <Pencil size={14} /> Переименовать
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => setDialog("description")}>
                  <Pencil size={14} /> Изменить описание
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => void pickCover()}>
                  <ImageIcon size={14} /> Обложка с ПК
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => setDialog("coverUrl")}>
                  <ImageIcon size={14} /> Обложка по ссылке
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="my-1.5 h-px bg-white/10" />

                <DropdownMenu.Label className="px-2.5 py-1 text-[11px] uppercase tracking-widest text-white/30">
                  Цвет плейлиста
                </DropdownMenu.Label>
                <div className="flex flex-wrap gap-1.5 px-2.5 py-2">
                  {Object.keys(PLAYLIST_GRADIENTS).map((c) => (
                    <button
                      key={c}
                      onClick={() => void patch({ color: c })}
                      style={{ background: PLAYLIST_GRADIENTS[c] }}
                      className={cn(
                        "h-6 w-6 rounded-full border border-white/15",
                        pl.color === c && "ring-2 ring-white",
                      )}
                    />
                  ))}
                </div>

                <DropdownMenu.Separator className="my-1.5 h-px bg-white/10" />

                <DropdownMenu.Item className={menuItem} onSelect={() => void downloadAll()}>
                  <Download size={14} /> Скачать все треки
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={async () => {
                    const text = tracks.map((t) => `${t.artist} — ${t.title}`).join("\n")
                    const path = await apix.saveTextFile(`${pl.name}.txt`, text)
                    if (path) toast("Список сохранён", "success")
                  }}
                >
                  <FileDown size={14} /> Экспорт списком
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  className={menuItem}
                  onSelect={async () => {
                    const copy = await api.createPlaylist(
                      `${pl.name} (копия)`,
                      pl.description,
                      pl.color,
                    )
                    if (tracks.length) await api.addToPlaylist(copy.id, tracks)
                    await qc.invalidateQueries({ queryKey: ["playlists"] })
                    toast("Копия создана", "success")
                  }}
                >
                  <Copy size={14} /> Дублировать
                </DropdownMenu.Item>

                <DropdownMenu.Separator className="my-1.5 h-px bg-white/10" />

                <DropdownMenu.Item
                  className={cn(menuItem, "text-red-300")}
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 size={14} /> Удалить плейлист
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </header>

      {/* ===== фильтры и вид ===== */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Искать в плейлисте…"
            className="input h-11 w-full pl-10"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {SORTS.map(([value, label]) => (
            <button
              key={value}
              className={cn("chip", sort === value && "chip-active")}
              onClick={() => setSort(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <LayoutSwitcher />
      </div>

      <TrackList
        tracks={visible}
        source="playlist"
        actions={false}
        emptyText="Плейлист пуст — добавь треки через правый клик по треку"
        onMove={sort === "manual" && !query.trim() ? (i, dir) => void move(i, dir) : undefined}
        onRemove={async (track) => {
          await api.removeFromPlaylist(pl.id, track.id)
          await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["playlists"] })])
        }}
      />

      <PromptDialog
        open={dialog === "name"}
        title="Название плейлиста"
        label="Название"
        defaultValue={pl.name}
        maxLength={60}
        confirmText="Сохранить"
        onCancel={() => setDialog(null)}
        onSubmit={async (v) => {
          setDialog(null)
          if (v.trim()) await patch({ name: v.trim() })
        }}
      />

      <PromptDialog
        open={dialog === "description"}
        title="Описание"
        description="Пара слов о том, что это за подборка"
        label="Описание"
        defaultValue={pl.description}
        multiline
        maxLength={300}
        confirmText="Сохранить"
        onCancel={() => setDialog(null)}
        onSubmit={async (v) => {
          setDialog(null)
          await patch({ description: v })
        }}
      />

      <PromptDialog
        open={dialog === "coverUrl"}
        title="Обложка по ссылке"
        label="Ссылка на картинку"
        placeholder="https://…"
        confirmText="Применить"
        onCancel={() => setDialog(null)}
        onSubmit={async (v) => {
          setDialog(null)
          const url = v.trim()
          if (!url) return
          try {
            const media = await apix.addMediaUrl(url)
            await patch({ cover: media.url })
          } catch (e) {
            toast((e as Error).message, "error")
          }
        }}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Удалить «${pl.name}»?`}
        description="Плейлист удалится безвозвратно."
        confirmText="Удалить"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          await api.deletePlaylist(pl.id)
          await qc.invalidateQueries({ queryKey: ["playlists"] })
          toast("Плейлист удалён", "success")
          navigate("playlists")
        }}
      />
    </div>
  )
}
