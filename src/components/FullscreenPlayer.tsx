import { motion } from "framer-motion"
import { Heart, Minimize2, Pause, Play, SkipBack, SkipForward } from "lucide-react"
import { useLyrics } from "@/hooks/useLyrics"
import { api } from "@/lib/api"
import { cn, formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import { Visualizer } from "./Visualizer"

/** Полноэкранный режим: обложка, синхронный текст, радиальный визуализатор. */
export function FullscreenPlayer() {
  const p = usePlayerStore()
  const setFullscreen = useUiStore((s) => s.setFullscreen)
  const likedIds = useProfileStore((s) => s.likedIds)
  const toggleLikeLocal = useProfileStore((s) => s.toggleLikeLocal)
  const track = p.current
  const { lyrics, activeIndex } = useLyrics(track, p.positionMs)
  const duration = p.durationMs || track?.duration || 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[99] overflow-hidden bg-black"
    >
      {track?.artwork && (
        <>
          <img
            src={track.artwork}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover blur-[70px] saturate-150"
          />
          <div className="absolute inset-0 bg-black/65" />
        </>
      )}

      <button
        onClick={() => setFullscreen(false)}
        className="btn-icon absolute right-6 top-6 z-10 h-11 w-11 bg-white/10"
      >
        <Minimize2 size={18} />
      </button>

      <div className="relative z-[1] grid h-full grid-cols-1 items-center gap-10 px-16 lg:grid-cols-[minmax(320px,460px)_1fr]">
        <div className="flex flex-col items-center gap-7">
          <motion.div
            animate={{ scale: p.playing ? 1 : 0.94 }}
            transition={{ type: "spring", stiffness: 180, damping: 20 }}
            className="aspect-square w-full max-w-[420px] overflow-hidden rounded-3xl shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)]"
          >
            {track?.artwork ? (
              <img src={track.artwork} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-ink-800" />
            )}
          </motion.div>

          <div className="w-full max-w-[420px] text-center">
            <h1 className="truncate font-display text-3xl font-extrabold text-white">
              {track?.title ?? "—"}
            </h1>
            <p className="mt-1 truncate text-lg text-white/50">{track?.artist}</p>
          </div>

          <Visualizer mode="radial" height={130} className="max-w-[420px]" />

          <div className="flex w-full max-w-[420px] items-center gap-3 text-xs tabular-nums text-white/45">
            <span>{formatDuration(p.positionMs)}</span>
            <div
              className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/15"
              onClick={(e) => {
                const rect = (e.target as HTMLElement).getBoundingClientRect()
                p.seek(((e.clientX - rect.left) / rect.width) * duration)
              }}
            >
              <div
                className="pointer-events-none h-full rounded-full bg-white"
                style={{ width: `${duration ? (p.positionMs / duration) * 100 : 0}%` }}
              />
            </div>
            <span>{formatDuration(duration)}</span>
          </div>

          <div className="flex items-center gap-6">
            <button
              className="btn-icon h-12 w-12"
              onClick={async () => {
                if (!track) return
                const now = await api.toggleLike(track, true)
                toggleLikeLocal(track.id, now)
              }}
            >
              <Heart
                size={22}
                className={
                  track && likedIds.has(track.id)
                    ? "fill-[rgb(var(--accent-rgb))] text-[rgb(var(--accent-rgb))]"
                    : ""
                }
              />
            </button>
            <button className="btn-icon h-12 w-12" onClick={() => void p.prev()}>
              <SkipBack size={26} />
            </button>
            <button
              onClick={p.toggle}
              className="grid h-16 w-16 place-items-center rounded-full bg-white text-black transition-transform hover:scale-105 active:scale-95"
            >
              {p.playing ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
            </button>
            <button className="btn-icon h-12 w-12" onClick={() => void p.next()}>
              <SkipForward size={26} />
            </button>
            <div className="h-12 w-12" />
          </div>
        </div>

        <div className="hidden h-[70vh] overflow-hidden lg:block">
          <div className="scroll-area px-6 [mask-image:linear-gradient(180deg,transparent,black_15%,black_85%,transparent)]">
            {lyrics?.synced.length ? (
              <div className="space-y-2 py-[30vh]">
                {lyrics.synced.map((line, i) => (
                  <p
                    key={i}
                    ref={(el) =>
                      i === activeIndex &&
                      el?.scrollIntoView({ behavior: "smooth", block: "center" })
                    }
                    className={cn(
                      "text-3xl font-bold leading-tight transition-all duration-500",
                      i === activeIndex ? "text-white" : "text-white/20 blur-[1px]",
                    )}
                  >
                    {line.text || "♪"}
                  </p>
                ))}
              </div>
            ) : (
              <p className="whitespace-pre-wrap py-[30vh] text-2xl leading-relaxed text-white/45">
                {lyrics?.plain ?? "Текст песни не найден"}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
