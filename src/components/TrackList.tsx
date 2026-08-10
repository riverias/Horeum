import { Play, Radio, Shuffle } from "lucide-react"
import { TrackRow } from "./TrackRow"
import { SkeletonList } from "./SkeletonList"
import { usePlayerStore } from "@/store/player"
import { shuffleArray } from "@/lib/utils"
import type { PlaySource, Track } from "@/lib/types"

type Props = {
  tracks: Track[]
  loading?: boolean
  title?: string
  subtitle?: string
  source?: PlaySource
  actions?: boolean
  emptyText?: string
  onRemove?: (track: Track) => void
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
}: Props) {
  const playQueue = usePlayerStore((s) => s.playQueue)
  const startWave = usePlayerStore((s) => s.startWave)

  return (
    <section className="space-y-3">
      {(title || actions) && (
        <header className="flex items-end justify-between gap-4">
          <div>
            {title && <h2 className="section-title">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-white/40">{subtitle}</p>}
          </div>
          {actions && tracks.length > 0 && (
            <div className="flex shrink-0 items-center gap-2">
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
            </div>
          )}
        </header>
      )}

      {loading ? (
        <SkeletonList count={9} />
      ) : tracks.length === 0 ? (
        <div className="card grid place-items-center px-6 py-16 text-center">
          <p className="text-sm text-white/40">{emptyText}</p>
        </div>
      ) : (
        <div className="stagger space-y-0.5">
          {tracks.map((track, i) => (
            <TrackRow
              key={`${track.id}-${i}`}
              track={track}
              index={i}
              source={source}
              onPlay={() => void playQueue(tracks, i, source)}
              onRemove={onRemove ? () => onRemove(track) : undefined}
            />
          ))}
        </div>
      )}
    </section>
  )
}
