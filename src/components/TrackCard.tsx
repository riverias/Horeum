import { memo } from "react"
import * as ContextMenu from "@radix-ui/react-context-menu"
import {
  Ban,
  Download,
  Heart,
  ListEnd,
  ListPlus,
  Music2,
  Pause,
  Play,
  Radio,
  User,
} from "lucide-react"
import { api } from "@/lib/api"
import { cn, formatCount, formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import type { Track } from "@/lib/types"

export type CardVariant = "grid" | "big" | "mini"

type Props = {
  track: Track
  index: number
  variant: CardVariant
  onPlay: () => void
  onRemove?: () => void
}

function TrackCardBase({ track, index, variant, onPlay, onRemove }: Props) {
  const current = usePlayerStore((s) => s.current)
  const playing = usePlayerStore((s) => s.playing)
  const toggle = usePlayerStore((s) => s.toggle)
  const playNext = usePlayerStore((s) => s.playNextInQueue)
  const appendToQueue = usePlayerStore((s) => s.appendToQueue)
  const startWave = usePlayerStore((s) => s.startWave)
  const downloadTrack = usePlayerStore((s) => s.downloadTrack)
  const likedIds = useProfileStore((s) => s.likedIds)
  const toggleLikeLocal = useProfileStore((s) => s.toggleLikeLocal)
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)

  const isCurrent = current?.id === track.id
  const liked = likedIds.has(track.id)

  const like = async () => {
    try {
      const now = await api.toggleLike(track, true)
      toggleLikeLocal(track.id, now)
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const item =
    "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-white/80 outline-none data-[highlighted]:bg-white/10 data-[highlighted]:text-white"

  const cover = (
    <div
      className={cn(
        "relative w-full overflow-hidden bg-ink-800",
        variant === "mini" ? "aspect-square rounded-xl" : "aspect-square rounded-2xl",
      )}
    >
      {track.artwork ? (
        <img
          src={track.artwork}
          alt=""
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      ) : (
        <div className="grid h-full w-full place-items-center text-white/20">
          <Music2 size={variant === "big" ? 34 : 20} />
        </div>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation()
          isCurrent ? toggle() : onPlay()
        }}
        className={cn(
          "absolute grid place-items-center rounded-full bg-[rgb(var(--accent-rgb))] text-black shadow-glow transition-all",
          variant === "mini"
            ? "inset-0 m-auto h-9 w-9 opacity-0 group-hover:opacity-100"
            : "bottom-2.5 right-2.5 h-11 w-11 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100",
          isCurrent && "translate-y-0 opacity-100",
        )}
      >
        {isCurrent && playing ? <Pause size={16} /> : <Play size={16} />}
      </button>

      {variant !== "mini" && liked && (
        <span className="absolute left-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/55">
          <Heart size={13} className="fill-[rgb(var(--accent-rgb))] text-[rgb(var(--accent-rgb))]" />
        </span>
      )}
    </div>
  )

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          onDoubleClick={onPlay}
          title={variant === "mini" ? `${track.artist} — ${track.title}` : undefined}
          className={cn(
            "group cursor-pointer transition-transform",
            variant === "mini"
              ? ""
              : "card p-3 hover:-translate-y-1",
            variant === "big" && "p-4",
            isCurrent && variant !== "mini" && "ring-1 ring-[rgb(var(--accent-rgb))]",
          )}
        >
          {cover}

          {variant !== "mini" && (
            <div className="mt-3 min-w-0">
              <p
                className={cn(
                  "truncate font-semibold",
                  variant === "big" ? "text-[15px]" : "text-[13px]",
                  isCurrent && "text-[rgb(var(--accent-rgb))]",
                )}
              >
                {track.title}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  navigate("artist", track.artist_id)
                }}
                className="max-w-full truncate text-[12px] text-white/40 transition-colors hover:text-white/80"
              >
                {track.artist}
              </button>

              <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-white/30">
                <span>{formatDuration(track.duration)}</span>
                {variant === "big" && <span>{formatCount(track.playback_count)} просл.</span>}
                <span className="text-white/20">#{index + 1}</span>
              </div>

              {variant === "big" && (
                <div className="mt-3 flex items-center gap-1.5">
                  <button
                    className="btn glass h-8 flex-1 justify-center text-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      void startWave(track.id)
                    }}
                  >
                    <Radio size={13} /> Волна
                  </button>
                  <button
                    className="btn-icon h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      void downloadTrack(track)
                    }}
                    title="Скачать"
                  >
                    <Download size={14} />
                  </button>
                  <button
                    className="btn-icon h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation()
                      void like()
                    }}
                    title="В любимое"
                  >
                    <Heart
                      size={14}
                      className={
                        liked ? "fill-[rgb(var(--accent-rgb))] text-[rgb(var(--accent-rgb))]" : ""
                      }
                    />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="glass-strong z-[80] min-w-[220px] rounded-xl p-1.5 shadow-panel">
          <div className="truncate px-2.5 py-1.5 text-[11px] text-white/35">
            {track.artist} — {track.title}
          </div>
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
          <ContextMenu.Item className={item} onSelect={() => void downloadTrack(track)}>
            <Download size={14} /> Скачать трек
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => void like()}>
            <Heart size={14} /> {liked ? "Убрать из любимого" : "В любимое"}
          </ContextMenu.Item>
          <ContextMenu.Item className={item} onSelect={() => navigate("artist", track.artist_id)}>
            <User size={14} /> Перейти к артисту
          </ContextMenu.Item>
          {onRemove && (
            <>
              <ContextMenu.Separator className="my-1.5 h-px bg-white/10" />
              <ContextMenu.Item className={cn(item, "text-red-300")} onSelect={onRemove}>
                <Ban size={14} /> Удалить отсюда
              </ContextMenu.Item>
            </>
          )}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  )
}

export const TrackCard = memo(TrackCardBase)
