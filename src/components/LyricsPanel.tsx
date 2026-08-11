import { useEffect, useMemo, useRef } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { RefreshCw, X } from "lucide-react"
import { useLyrics } from "@/hooks/useLyrics"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import { cn } from "@/lib/utils"

export function LyricsPanel() {
  const open = useUiStore((s) => s.lyricsOpen)
  const setOpen = useUiStore((s) => s.setLyricsOpen)
  const karaoke = useUiStore((s) => s.karaoke)
  const track = usePlayerStore((s) => s.current)
  const positionMs = usePlayerStore((s) => s.positionMs)
  const seek = usePlayerStore((s) => s.seek)
  const { lyrics, loading, error, activeIndex, reload } = useLyrics(track, positionMs)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [activeIndex])

  /** Прогресс внутри активной строки — для караоке-заливки. */
  const lineProgress = useMemo(() => {
    const lines = lyrics?.synced
    if (!lines || activeIndex < 0 || activeIndex >= lines.length) return 0
    const start = lines[activeIndex].time * 1000
    const end = lines[activeIndex + 1]?.time
      ? lines[activeIndex + 1].time * 1000
      : start + 4000
    const span = Math.max(300, end - start)
    return Math.max(0, Math.min(1, (positionMs - start) / span))
  }, [lyrics, activeIndex, positionMs])

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 400, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="flex shrink-0 flex-col overflow-hidden border-l border-white/5 bg-ink-950/60 backdrop-blur-2xl"
        >
          <header className="flex items-center justify-between px-5 py-3.5">
            <div className="min-w-0">
              <h3 className="font-display text-base font-bold">Текст песни</h3>
              <p className="truncate text-[11px] text-white/35">
                {lyrics?.source ?? "LRCLIB"}
                {lyrics?.matched_artist && ` • ${lyrics.matched_artist} — ${lyrics.matched_title}`}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button className="btn-icon" onClick={() => void reload()} title="Обновить">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
              <button className="btn-icon" onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
          </header>

          <div className="scroll-area min-h-0 flex-1 px-6 pb-24 pt-4">
            {!track && <p className="text-sm text-white/35">Запусти трек, чтобы увидеть текст.</p>}

            {loading && (
              <div className="space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="skeleton h-5" style={{ width: `${50 + ((i * 17) % 45)}%` }} />
                ))}
              </div>
            )}

            {!loading && error && (
              <p className="text-sm leading-relaxed text-white/35">
                Текст не найден. {error}
              </p>
            )}

            {!loading && lyrics?.instrumental && (
              <p className="text-sm text-white/40">🎹 Инструментальная композиция</p>
            )}

            {!loading && lyrics && lyrics.synced.length > 0 && (
              <div className="space-y-1">
                {lyrics.synced.map((line, i) => {
                  const active = i === activeIndex
                  const passed = i < activeIndex
                  return (
                    <button
                      key={`${line.time}-${i}`}
                      ref={active ? activeRef : undefined}
                      onClick={() => seek(line.time * 1000)}
                      style={
                        active && karaoke
                          ? ({ "--p": `${lineProgress * 100}%` } as React.CSSProperties)
                          : undefined
                      }
                      className={cn(
                        "lyric-line block w-full text-left",
                        active && "lyric-active",
                        active && karaoke && "lyric-karaoke",
                        passed && "lyric-passed",
                      )}
                    >
                      {line.text || "♪"}
                    </button>
                  )
                })}
              </div>
            )}

            {!loading && lyrics && lyrics.synced.length === 0 && lyrics.plain && (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-white/70">
                {lyrics.plain}
              </p>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
