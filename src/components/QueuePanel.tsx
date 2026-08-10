import { AnimatePresence, motion, Reorder } from "framer-motion"
import { GripVertical, ListX, Music2, X } from "lucide-react"
import { formatDuration } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

export function QueuePanel() {
  const open = useUiStore((s) => s.queueOpen)
  const setOpen = useUiStore((s) => s.setQueueOpen)
  const queue = usePlayerStore((s) => s.queue)
  const index = usePlayerStore((s) => s.index)
  const waveMode = usePlayerStore((s) => s.waveMode)
  const removeFromQueue = usePlayerStore((s) => s.removeFromQueue)
  const playQueue = usePlayerStore((s) => s.playQueue)

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 340, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 30 }}
          className="flex shrink-0 flex-col overflow-hidden border-l border-white/5 bg-ink-950/60 backdrop-blur-2xl"
        >
          <header className="flex items-center justify-between px-4 py-3.5">
            <div>
              <h3 className="font-display text-base font-bold">Очередь</h3>
              <p className="text-[11px] text-white/35">
                {queue.length} треков {waveMode && "• бесконечная волна"}
              </p>
            </div>
            <button className="btn-icon" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </header>

          <div className="scroll-area min-h-0 flex-1 px-2 pb-4">
            {queue.length === 0 ? (
              <div className="grid place-items-center gap-2 px-4 py-20 text-center text-white/30">
                <ListX size={28} />
                <p className="text-xs">Очередь пуста</p>
              </div>
            ) : (
              queue.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  onDoubleClick={() => void playQueue(queue, i, "library")}
                  className={`group mb-0.5 flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors ${
                    i === index ? "bg-white/10" : "hover:bg-white/5"
                  }`}
                >
                  <GripVertical size={13} className="shrink-0 text-white/15" />
                  <div className="h-9 w-9 shrink-0 overflow-hidden rounded-md bg-ink-800">
                    {track.artwork ? (
                      <img src={track.artwork} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-white/20">
                        <Music2 size={13} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[12.5px] font-medium ${
                        i === index ? "text-[rgb(var(--accent-rgb))]" : "text-white/85"
                      }`}
                    >
                      {track.title}
                    </div>
                    <div className="truncate text-[11px] text-white/35">{track.artist}</div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-white/25 group-hover:hidden">
                    {formatDuration(track.duration)}
                  </span>
                  <button
                    className="btn-icon hidden h-7 w-7 group-hover:grid"
                    onClick={() => removeFromQueue(i)}
                  >
                    <X size={13} />
                  </button>
                </div>
              ))
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}
