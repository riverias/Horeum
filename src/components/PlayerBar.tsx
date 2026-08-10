import { useState } from "react"
import * as Slider from "@radix-ui/react-slider"
import * as Popover from "@radix-ui/react-popover"
import {
  Heart,
  ListMusic,
  Maximize2,
  Mic2,
  Music2,
  Pause,
  Play,
  Radio,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Timer,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react"
import { api } from "@/lib/api"
import { cn, formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import { Visualizer } from "./Visualizer"

export function PlayerBar() {
  const p = usePlayerStore()
  const ui = useUiStore()
  const likedIds = useProfileStore((s) => s.likedIds)
  const toggleLikeLocal = useProfileStore((s) => s.toggleLikeLocal)
  const [seeking, setSeeking] = useState<number | null>(null)

  const track = p.current
  const liked = track ? likedIds.has(track.id) : false
  const duration = p.durationMs || track?.duration || 0
  const position = seeking ?? p.positionMs

  const like = async () => {
    if (!track) return
    try {
      const now = await api.toggleLike(track, true)
      toggleLikeLocal(track.id, now)
    } catch (e) {
      ui.toast((e as Error).message, "error")
    }
  }

  const VolumeIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2

  return (
    <footer className="relative z-30 shrink-0 border-t border-white/5 bg-ink-950/85 backdrop-blur-2xl">
      <div className="pointer-events-none absolute inset-x-0 -top-16 h-16 opacity-30">
        <Visualizer height={64} />
      </div>

      {/* прогресс */}
      <div className="px-4 pt-3">
        <Slider.Root
          className="group relative flex h-4 w-full touch-none items-center"
          value={[position]}
          max={Math.max(duration, 1)}
          step={250}
          onValueChange={([v]) => setSeeking(v)}
          onValueCommit={([v]) => {
            p.seek(v)
            setSeeking(null)
          }}
        >
          <Slider.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
            <Slider.Range
              className="absolute h-full rounded-full"
              style={{
                background:
                  "linear-gradient(90deg, rgb(var(--accent-rgb)), rgba(255,255,255,0.9))",
              }}
            />
          </Slider.Track>
          <Slider.Thumb className="block h-3.5 w-3.5 scale-0 rounded-full bg-white shadow-glow outline-none transition-transform duration-150 group-hover:scale-100" />
        </Slider.Root>
      </div>

      <div className="grid grid-cols-[minmax(220px,1fr)_auto_minmax(220px,1fr)] items-center gap-4 px-4 pb-4 pt-2">
        {/* трек */}
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => ui.setFullscreen(true)}
            className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800 shadow-panel"
          >
            {track?.artwork ? (
              <img src={track.artwork} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/20">
                <Music2 size={20} />
              </div>
            )}
            {p.playing && (
              <span className="absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity hover:opacity-100">
                <Maximize2 size={16} />
              </span>
            )}
          </button>

          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-white">
              {track?.title ?? "Ничего не играет"}
            </div>
            <button
              onClick={() => track && ui.navigate("artist", track.artist_id)}
              className="truncate text-[12px] text-white/45 transition-colors hover:text-white/80"
            >
              {track?.artist ?? "—"}
            </button>
          </div>

          {track && (
            <button className="btn-icon shrink-0" onClick={like}>
              <Heart
                size={17}
                className={
                  liked ? "fill-[rgb(var(--accent-rgb))] text-[rgb(var(--accent-rgb))]" : ""
                }
              />
            </button>
          )}
        </div>

        {/* транспорт */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-2">
            <button
              className={cn("btn-icon", p.shuffle && "text-[rgb(var(--accent-rgb))]")}
              onClick={p.toggleShuffle}
              title="Перемешать (S)"
            >
              <Shuffle size={16} />
            </button>
            <button className="btn-icon" onClick={() => void p.prev()} title="Назад (Shift+←)">
              <SkipBack size={19} />
            </button>

            <button
              onClick={p.toggle}
              disabled={!track}
              className="grid h-12 w-12 place-items-center rounded-full text-black shadow-glow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{
                background: "linear-gradient(135deg, #fff, rgba(255,255,255,0.78))",
              }}
            >
              {p.loading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/25 border-t-black" />
              ) : p.playing ? (
                <Pause size={22} fill="currentColor" />
              ) : (
                <Play size={22} fill="currentColor" className="ml-0.5" />
              )}
            </button>

            <button className="btn-icon" onClick={() => void p.next()} title="Вперёд (Shift+→)">
              <SkipForward size={19} />
            </button>
            <button
              className={cn("btn-icon", p.repeat !== "off" && "text-[rgb(var(--accent-rgb))]")}
              onClick={p.cycleRepeat}
              title="Повтор (R)"
            >
              {p.repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] tabular-nums text-white/40">
            <span>{formatDuration(position)}</span>
            <span className="text-white/20">/</span>
            <span>{formatDuration(duration)}</span>
            {p.waveMode && (
              <span className="ml-2 flex items-center gap-1 rounded-full bg-[rgb(var(--accent-rgb)/0.18)] px-2 py-0.5 text-[10px] font-bold text-[rgb(var(--accent-rgb))]">
                <Radio size={10} /> ВОЛНА
              </span>
            )}
          </div>
        </div>

        {/* правый блок */}
        <div className="flex items-center justify-end gap-1">
          <button
            className={cn("btn-icon", ui.lyricsOpen && "text-[rgb(var(--accent-rgb))]")}
            onClick={() => ui.setLyricsOpen(!ui.lyricsOpen)}
            title="Текст песни (L)"
          >
            <Mic2 size={17} />
          </button>
          <button
            className={cn("btn-icon", ui.queueOpen && "text-[rgb(var(--accent-rgb))]")}
            onClick={() => ui.setQueueOpen(!ui.queueOpen)}
            title="Очередь (Q)"
          >
            <ListMusic size={17} />
          </button>
          <button
            className={cn("btn-icon", ui.eqOpen && "text-[rgb(var(--accent-rgb))]")}
            onClick={() => ui.setEqOpen(true)}
            title="Эквалайзер (E)"
          >
            <SlidersHorizontal size={17} />
          </button>

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                className={cn("btn-icon", p.sleepTimerAt && "text-[rgb(var(--accent-rgb))]")}
                title="Таймер сна"
              >
                <Timer size={17} />
              </button>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                sideOffset={12}
                className="glass-strong z-[90] w-52 rounded-xl p-2 shadow-panel"
              >
                <p className="px-2 py-1 text-[11px] uppercase tracking-widest text-white/35">
                  Таймер сна
                </p>
                {[15, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-[13px] text-white/75 hover:bg-white/10 hover:text-white"
                    onClick={() => {
                      p.setSleepTimer(m)
                      ui.toast(`Таймер: стоп через ${m} мин`, "success")
                    }}
                  >
                    {m} минут
                  </button>
                ))}
                <button
                  className="flex w-full items-center rounded-lg px-2.5 py-1.5 text-[13px] text-red-300 hover:bg-white/10"
                  onClick={() => p.setSleepTimer(null)}
                >
                  Отключить
                </button>
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          <div className="group ml-1 flex items-center gap-2">
            <button className="btn-icon" onClick={p.toggleMute}>
              <VolumeIcon size={17} />
            </button>
            <Slider.Root
              className="relative flex h-4 w-24 touch-none items-center"
              value={[p.muted ? 0 : p.volume * 100]}
              max={100}
              onValueChange={([v]) => p.setVolume(v / 100)}
            >
              <Slider.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
                <Slider.Range className="absolute h-full rounded-full bg-white/80" />
              </Slider.Track>
              <Slider.Thumb className="block h-3 w-3 rounded-full bg-white opacity-0 transition-opacity group-hover:opacity-100" />
            </Slider.Root>
          </div>
        </div>
      </div>
    </footer>
  )
}
