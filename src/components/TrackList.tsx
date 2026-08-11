import { Music2, Play, Radio, Shuffle } from "lucide-react"
import { TrackRow } from "./TrackRow"
import { TrackCard } from "./TrackCard"
import { LayoutSwitcher } from "./LayoutSwitcher"
import { SkeletonList } from "./SkeletonList"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import { cn, formatCount, formatDuration, shuffleArray } from "@/lib/utils"
import type { PlaySource, Track, TrackLayout } from "@/lib/types"

type Props = {
  tracks: Track[]
  loading?: boolean
  title?: string
  subtitle?: string
  source?: PlaySource
  actions?: boolean
  emptyText?: string
  onRemove?: (track: Track) => void
  /** Показать переключатель видов карточек. */
  switcher?: boolean
  /** Жёстко заданный вид (игнорирует глобальный выбор). */
  layout?: TrackLayout
  /** Ручной порядок: переместить трек выше/ниже. */
  onMove?: (index: number, dir: -1 | 1) => void
}

export function TrackList({
  tracks,
  loading,
  title,
  subtitle,
  source = "library",
  actions = true,
  emptyText = "Ничего не найдено",
  onRemove,
  switcher = false,
  layout,
  onMove,
}: Props) {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const startWave = usePlayerStore((s) => s.startWave)
  const current = usePlayerStore((s) => s.current)
  const globalLayout = useUiStore((s) => s.trackLayout)
  const mode: TrackLayout = layout ?? globalLayout

  const play = (i: number) => void playQueue(tracks, i, source)

  const body = () => {
    if (mode === "grid" || mode === "big" || mode === "mini") {
      const gridCls =
        mode === "mini"
          ? "grid grid-cols-4 gap-2.5 sm:grid-cols-6 xl:grid-cols-10"
          : mode === "big"
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            : "grid grid-cols-2 gap-3.5 md:grid-cols-4 xl:grid-cols-6"
      return (
        <div className={cn(gridCls, "stagger")}>
          {tracks.map((track, i) => (
            <TrackCard
              key={`${track.id}-${i}`}
              track={track}
              index={i}
              variant={mode}
              onPlay={() => play(i)}
              onRemove={onRemove ? () => onRemove(track) : undefined}
            />
          ))}
        </div>
      )
    }

    if (mode === "table") {
      return (
        <div className="card overflow-hidden p-0">
          <div className="grid grid-cols-[40px_1.6fr_1fr_90px_70px] items-center gap-3 border-b border-white/5 px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-white/30">
            <span>#</span>
            <span>Название</span>
            <span>Артист</span>
            <span className="text-right">Просл.</span>
            <span className="text-right">Длит.</span>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {tracks.map((track, i) => (
              <div
                key={`${track.id}-${i}`}
                onClick={() => play(i)}
                className={cn(
                  "grid cursor-pointer grid-cols-[40px_1.6fr_1fr_90px_70px] items-center gap-3 px-4 py-2 text-[13px] transition-colors hover:bg-white/[0.05]",
                  current?.id === track.id && "bg-white/[0.08] text-[rgb(var(--accent-rgb))]",
                )}
              >
                <span className="tabular-nums text-white/30">{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-md bg-ink-800">
                    {track.artwork ? (
                      <img src={track.artwork} alt="" decoding="async" className="h-full w-full object-cover" />
                    ) : (
                      <Music2 size={13} className="text-white/25" />
                    )}
                  </span>
                  <span className="truncate font-semibold">{track.title}</span>
                </span>
                <span className="truncate text-white/45">{track.artist}</span>
                <span className="text-right tabular-nums text-white/30">
                  {formatCount(track.playback_count)}
                </span>
                <span className="text-right tabular-nums text-white/40">
                  {formatDuration(track.duration)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )
    }

    return (
      <div className={cn("stagger", mode === "compact" ? "space-y-0" : "space-y-0.5")}>
        {tracks.map((track, i) => (
          <TrackRow
            key={`${track.id}-${i}`}
            track={track}
            index={i}
            source={source}
            compact={mode === "compact"}
            onPlay={() => play(i)}
            onRemove={onRemove ? () => onRemove(track) : undefined}
            onMoveUp={onMove && i > 0 ? () => onMove(i, -1) : undefined}
            onMoveDown={onMove && i < tracks.length - 1 ? () => onMove(i, 1) : undefined}
          />
        ))}
      </div>
    )
  }

  return (
    <section className="space-y-3">
      {(title || actions || switcher) && (
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-white/40">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions && tracks.length > 0 && (
              <>
                <button className="btn-accent" onClick={() => void playQueue(tracks, 0, source)}>
                  <Play size={15} /> Слушать
                </button>
                <button
                  className="btn glass"
                  onClick={() => void playQueue(shuffleArray(tracks), 0, source)}
                >
                  <Shuffle size={15} /> Вперемешку
                </button>
                <button className="btn glass" onClick={() => void startWave(tracks[0]?.id)}>
                  <Radio size={15} /> Волна
                </button>
              </>
            )}
            {switcher && <LayoutSwitcher />}
          </div>
        </header>
      )}

      {loading ? (
        <SkeletonList count={9} />
      ) : tracks.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-sm text-white/40">{emptyText}</p>
        </div>
      ) : (
        body()
      )}
    </section>
  )
}
