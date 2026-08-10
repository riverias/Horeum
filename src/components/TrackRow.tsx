import { memo, useState } from "react"
import * as ContextMenu from "@radix-ui/react-context-menu"
import { useQuery } from "@tanstack/react-query"
import {
  Ban,
  Heart,
  ListPlus,
  ListEnd,
  Music2,
  Play,
  Pause,
  Radio,
  ExternalLink,
  User,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api } from "@/lib/api"
import { cn, formatCount, formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import type { PlaySource, Track } from "@/lib/types"

type Props = {
  track: Track
  index: number
  onPlay: () => void
  source?: PlaySource
  onRemove?: () => void
}

function TrackRowBase({ track, index, onPlay, onRemove }: Props) {
  const current = usePlayerStore((s) => s.current)
  const playing = usePlayerStore((s) => s.playing)
  const toggle = usePlayerStore((s) => s.toggle)
  const playNext = usePlayerStore((s) => s.playNextInQueue)
  const appendToQueue = usePlayerStore((s) => s.appendToQueue)
  const startWave = usePlayerStore((s) => s.startWave)
  const likedIds = useProfileStore((s) => s.likedIds)
  const toggleLikeLocal = useProfileStore((s) => s.toggleLikeLocal)
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)
  const [busy, setBusy] = useState(false)

  const isCurrent = current?.id === track.id
  const liked = likedIds.has(track.id)

  const { data: playlists = [] } = useQuery({ queryKey: ["playlists"], queryFn: api.playlists })

  const like = async () => {
    if (busy) return
    setBusy(true)
    try {
      const now = await api.toggleLike(track, true)
      toggleLikeLocal(track.id, now)
      toast(now ? "Добавлено в любимое" : "Убрано из любимого", "success")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  const item =
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-white/80 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          onDoubleClick={onPlay}
          className={cn(
            "group grid grid-cols-[28px_44px_1fr_auto] items-center gap-3 rounded-xl px-3 py-2 transition-colors",
            isCurrent ? "bg-white/[0.09]" : "hover:bg-white/[0.06]",
          )}
        >
          <button
            onClick={() => (isCurrent ? toggle() : onPlay())}
            className="grid h-7 w-7 place-items-center text-xs tabular-nums text-white/35"
          >
            <span className="group-hover:hidden">
              {isCurrent && playing ? (
                <span className="flex h-3 items-end gap-[2px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-[2px] animate-float rounded-full bg-[rgb(var(--accent-rgb))]"
                      style={{ height: `${6 + i * 3}px`, animationDelay: `${i * 0.15}s` }}
                    />
                  ))}
                </span>
              ) : (
                index + 1
              )}
            </span>
            <span className="hidden group-hover:block text-white">
              {isCurrent && playing ? <Pause size={14} /> : <Play size={14} />}
            </span>
          </button>

          <div className="relative h-11 w-11 overflow-hidden rounded-lg bg-ink-800">
            {track.artwork ? (
              <img
                src={track.artwork}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/25">
                <Music2 size={16} />
              </div>
            )}
          </div>

          <div className="min-w-0" onClick={onPlay}>
            <div
              className={cn(
                "truncate text-[14px] font-semibold",
                isCurrent ? "text-[rgb(var(--accent-rgb))]" : "text-white/95",
              )}
            >
              {track.title}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate("artist", track.artist_id)
              }}
              className="truncate text-[12px] text-white/45 transition-colors hover:text-white/80"
            >
              {track.artist}
            </button>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden text-[11px] tabular-nums text-white/30 xl:inline">
              {formatCount(track.playback_count)} просл.
            </span>
            <button
              onClick={like}
              className={cn(
                "btn-icon h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100",
                liked && "opacity-100",
              )}
            >
              <Heart
                size={15}
                className={liked ? "fill-[rgb(var(--accent-rgb))] text-[rgb(var(--accent-rgb))]" : ""}
              />
            </button>
            <span className="w-11 text-right text-[12px] tabular-nums text-white/40">
              {formatDuration(track.duration)}
            </span>
          </div>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="glass-strong z-[80] min-w-[230px] rounded-xl p-1.5 shadow-panel">
          <ContextMenu.Item className={item} onSelect={onPlay}>
            <Play size={14} /> Воспроизвести
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => playNext(track)}>
            <ListPlus size={14} /> Играть следующим
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => appendToQueue([track])}>
            <ListEnd size={14} /> В конец очереди
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => void startWave(track.id)}>
            <Radio size={14} /> Волна от трека
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1.5 h-px bg-white/10" />

          <ContextMenu.Item className={item} onSelect={like}>
            <Heart size={14} /> {liked ? "Убрать из любимого" : "В любимое"}
          </ContextMenu.Item>

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className={item}>
              <ListPlus size={14} /> Добавить в плейлист
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="glass-strong z-[85] max-h-72 min-w-[200px] overflow-y-auto rounded-xl p-1.5 shadow-panel">
                {playlists.length === 0 && (
                  <div className="px-2.5 py-2 text-xs text-white/40">Нет плейлистов</div>
                )}
                {playlists.map((pl) => (
                  <ContextMenu.Item
                    key={pl.id}
                    className={item}
                    onSelect={async () => {
                      try {
                        await api.addToPlaylist(pl.id, [track])
                        toast(`Добавлено в «${pl.name}»`, "success")
                      } catch (e) {
                        toast((e as Error).message, "error")
                      }
                    }}
                  >
                    {pl.name}
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>

          <ContextMenu.Item
            className={item}
            onSelect={() => navigate("artist", track.artist_id)}
          >
            <User size={14} /> Перейти к артисту
          </ContextMenu.Item>
          <ContextMenu.Item
            className={item}
            onSelect={() => void openUrl(track.permalink_url)}
          >
            <ExternalLink size={14} /> Открыть на SoundCloud
          </ContextMenu.Item>

          <ContextMenu.Separator className="my-1.5 h-px bg-white/10" />

          {onRemove && (
            <ContextMenu.Item className={cn(item, "text-red-300")} onSelect={onRemove}>
              <Ban size={14} /> Удалить отсюда
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            className={cn(item, "text-red-300")}
            onSelect={async () => {
              await api.blockTrack(track.id)
              toast("Трек больше не попадёт в рекомендации", "info")
            }}
          >
            <Ban size={14} /> Не нравится
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export const TrackRow = memo(TrackRowBase)
