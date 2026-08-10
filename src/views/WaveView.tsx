import * as Slider from "@radix-ui/react-slider"
import { Radio, RefreshCw } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

export function WaveView() {
  const discovery = useUiStore((s) => s.discovery)
  const setDiscovery = useUiStore((s) => s.setDiscovery)
  const waveLoading = useUiStore((s) => s.waveLoading)
  const startWave = usePlayerStore((s) => s.startWave)
  const queue = usePlayerStore((s) => s.queue)
  const source = usePlayerStore((s) => s.source)

  const waveQueue = source === "wave" ? queue : []

  return (
    <div className="space-y-7">
      <section className="card relative overflow-hidden p-8">
        <div
          className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(var(--accent-rgb), 0.3)" }}
        />
        <div className="relative z-10 max-w-2xl">
          <div className="flex items-center gap-3">
            <Radio size={26} className="text-[rgb(var(--accent-rgb))]" />
            <h1 className="font-display text-4xl font-extrabold tracking-tight">Волна</h1>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            Алгоритм берёт твои лайки и историю, добирает похожие треки и чарты SoundCloud,
            убирает заблокированное и перемешивает всё с учётом коэффициента открытий.
          </p>

          <div className="mt-7 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/50">Знакомое</span>
              <span className="font-bold text-white">{Math.round(discovery * 100)}% нового</span>
              <span className="text-white/50">Открытия</span>
            </div>
            <Slider.Root
              value={[discovery]}
              max={1}
              step={0.05}
              onValueChange={([v]) => setDiscovery(v)}
              onValueCommit={([v]) => void api.setSetting("discovery", String(v)).catch(() => {})}
              className="relative flex h-5 w-full touch-none items-center"
            >
              <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
                <Slider.Range className="absolute h-full rounded-full bg-[rgb(var(--accent-rgb))]" />
              </Slider.Track>
              <Slider.Thumb className="block h-4 w-4 rounded-full bg-white shadow-glow outline-none" />
            </Slider.Root>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-accent" disabled={waveLoading} onClick={() => void startWave()}>
              <Radio size={17} /> {waveLoading ? "Собираю…" : "Запустить волну"}
            </button>
            <button className="btn glass" disabled={waveLoading} onClick={() => void startWave()}>
              <RefreshCw size={15} /> Пересобрать
            </button>
          </div>
        </div>
      </section>

      <TrackList
        tracks={waveQueue}
        loading={waveLoading}
        title="Текущая волна"
        source="wave"
        emptyText="Волна ещё не запущена"
      />
    </div>
  )
}
