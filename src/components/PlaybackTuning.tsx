import { Waves } from "lucide-react"
import { usePlayerStore } from "@/store/player"

/** Кроссфейд и гэплесс-предзагрузка. */
export function PlaybackTuning() {
  const crossfadeMs = usePlayerStore((s) => s.crossfadeMs)
  const gapless = usePlayerStore((s) => s.gapless)
  const setCrossfade = usePlayerStore((s) => s.setCrossfade)
  const setGapless = usePlayerStore((s) => s.setGapless)

  return (
    <section className="card space-y-4 p-5">
      <h3 className="flex items-center gap-2 text-sm font-bold text-white/70">
        <Waves size={16} /> Стык треков
      </h3>

      <label className="block text-[11px] text-white/40">
        <span>
          Кроссфейд: {crossfadeMs === 0 ? "выключен" : `${(crossfadeMs / 1000).toFixed(1)} с`}
        </span>
        <input
          type="range"
          min={0}
          max={12000}
          step={500}
          value={crossfadeMs}
          onChange={(e) => setCrossfade(Number(e.target.value))}
          className="mt-1 w-full"
        />
      </label>

      <button
        onClick={() => setGapless(!gapless)}
        className={`chip ${gapless ? "chip-active" : ""}`}
        title="Заранее готовит следующий трек, чтобы не было паузы"
      >
        Гэплесс-предзагрузка: {gapless ? "вкл" : "выкл"}
      </button>
    </section>
  )
}
