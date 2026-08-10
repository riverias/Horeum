import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ListMusic, Pin, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { formatDuration } from "@/lib/utils"
import { useUiStore } from "@/store/ui"

export function PlaylistView({ id }: { id: number }) {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)
  const navigate = useUiStore((s) => s.navigate)
  const [editing, setEditing] = useState(false)

  const { data: pl, isLoading, refetch } = useQuery({
    queryKey: ["playlist", id],
    queryFn: () => api.playlist(id),
    enabled: Number.isFinite(id),
  })

  if (isLoading || !pl) return <TrackList tracks={[]} loading title="Плейлист" actions={false} />

  const rename = async () => {
    const name = window.prompt("Новое название", pl.name)
    if (!name) return
    await api.updatePlaylist(pl.id, { name })
    await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["playlists"] })])
    setEditing(false)
  }

  return (
    <div className="space-y-7">
      <header className="card flex flex-wrap items-end gap-6 p-7">
        <div
          className="grid h-44 w-44 shrink-0 place-items-center overflow-hidden rounded-3xl shadow-panel"
          style={{
            background: pl.cover
              ? undefined
              : "linear-gradient(135deg, rgb(var(--accent-rgb)), rgba(255,255,255,0.12))",
          }}
        >
          {pl.cover ? (
            <img src={pl.cover} alt="" className="h-full w-full object-cover" />
          ) : (
            <ListMusic size={54} className="text-white/80" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/35">Плейлист</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold tracking-tight">{pl.name}</h1>
          {pl.description && <p className="mt-2 text-sm text-white/45">{pl.description}</p>}
          <p className="mt-3 text-xs text-white/35">
            {pl.track_count} треков • {formatDuration(pl.duration)} • обновлён{" "}
            {new Date(pl.updated_at).toLocaleDateString("ru-RU")}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn glass" onClick={rename}>
              Переименовать
            </button>
            <button
              className="btn glass"
              onClick={async () => {
                await api.updatePlaylist(pl.id, { pinned: !pl.pinned })
                await refetch()
              }}
            >
              <Pin size={15} /> {pl.pinned ? "Открепить" : "Закрепить"}
            </button>
            <button
              className="btn glass text-red-300"
              onClick={async () => {
                if (!window.confirm(`Удалить плейлист «${pl.name}»?`)) return
                await api.deletePlaylist(pl.id)
                await qc.invalidateQueries({ queryKey: ["playlists"] })
                toast("Плейлист удалён", "success")
                navigate("home")
              }}
            >
              <Trash2 size={15} /> Удалить
            </button>
          </div>
        </div>
      </header>

      <TrackList
        tracks={pl.tracks}
        source="playlist"
        emptyText="Плейлист пуст — добавь треки через правый клик по треку"
        onRemove={async (track) => {
          await api.removeFromPlaylist(pl.id, track.id)
          await refetch()
        }}
      />
    </div>
  )
}
