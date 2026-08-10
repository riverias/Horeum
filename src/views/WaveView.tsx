import * as Slider from "@radix-ui/react-slider"
import { Radio, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

export function WaveView() {
  const queue = usePlayerStore((s) => s.queue)
  const waveMode = usePlayerStore((s) => s.waveMode)
  const current = usePlayerStore((s) => s.current)
  const startWave = usePlayerStore((s) => s.startWave)
  const discovery = useUiStore((s) => s.discovery)
  const setDiscovery = useUiStore((s) => s.setDiscovery)
  const loading = useUiStore((s) => s.waveLoading)

  return (
    <div className="space-y-7">
      <section className="card relative overflow-hidden p-8">
        <div className="absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[rgb(var(--accent-rgb)/0.25)] blur-3xl" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h1 className="flex items-center gap-3 font-display text-4xl font-extrabold">
              <Radio className="text-[rgb(var(--accent-rgb))]" size={34} /> Волна
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              Бесконечный персональный поток. Алгоритм смешивает похожие треки, твоих любимых
              артистов и чарты по жанрам, исключая уже услышанное и скрытые треки.
            </p>

            <div className="mt-6 max-w-sm">
              <div className="mb-2 flex items-center justify-between text-xs text-white/45">
                <span>Знакомое</span>
                <span className="font-bold text-white">
                  <Sparkles size={12} className="mr-1 inline" />
                  {Math.round(discovery * 100)}% открытий
                </span>
                <span>Новое</span>
              </div>
              <Slider.Root
                className="relative flex h-4 w-full touch-none items-center"
                value={[discovery * 100]}
                max={100}
                step={5}
                onValueChange={([v]) => setDiscovery(v / 100)}
                onValueCommit={([v]) => void api.setSetting("discovery", v / 100).catch(() => {})}
              >
                <Slider.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/10">
                  <Slider.Range className="absolute h-full rounded-full bg-[rgb(var(--accent-rgb))]" />
                </Slider.Track>
                <Slider.Thumb className="block h-4 w-4 rounded-full bg-white shadow-glow outline-none" />
              </Slider.Root>
            </div>
          </div>

          <button
            className="btn-accent h-14 rounded-2xl px-8 text-base"
            disabled={loading}
            onClick={() => void startWave(current?.id)}
          >
            {loading ? "Собираю волну…" : waveMode ? "Перезапустить" : "Запустить волну"}
          </button>
        </div>
      </section>

      {waveMode && (
        <TrackList
          tracks={queue}
          title="В потоке"
          subtitle="Очередь догружается автоматически"
          source="wave"
          actions={false}
        />
      )}
    </div>
  )
}
