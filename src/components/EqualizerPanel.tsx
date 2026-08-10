import { useState } from "react"
import * as Dialog from "@radix-ui/react-dialog"
import * as Slider from "@radix-ui/react-slider"
import { X } from "lucide-react"
import { engine, EQ_BANDS, EQ_PRESETS } from "@/audio/engine"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/store/ui"
import { usePlayerStore } from "@/store/player"
import { Visualizer } from "./Visualizer"

export function EqualizerPanel() {
  const open = useUiStore((s) => s.eqOpen)
  const setOpen = useUiStore((s) => s.setEqOpen)
  const rate = usePlayerStore((s) => s.rate)
  const setRate = usePlayerStore((s) => s.setRate)
  const [gains, setGains] = useState<number[]>(EQ_PRESETS["Ровно"])
  const [preset, setPreset] = useState("Ровно")

  const apply = (values: number[], name?: string) => {
    setGains(values)
    if (name) setPreset(name)
    engine.setEqPreset(values)
    void api.setSetting("eq", values).catch(() => {})
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm data-[state=open]:animate-fade-in" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-1/2 z-[95] w-[680px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-panel data-[state=open]:animate-fade-in">
          <div className="mb-5 flex items-start justify-between">
            <div>
              <Dialog.Title className="font-display text-xl font-extrabold">
                Эквалайзер
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-white/40">
                10 полос • Web Audio BiquadFilter • настройки сохраняются автоматически
              </Dialog.Description>
            </div>
            <Dialog.Close className="btn-icon">
              <X size={17} />
            </Dialog.Close>
          </div>

          <div className="mb-5 overflow-hidden rounded-2xl border border-white/5 bg-black/30 px-3 pt-3">
            <Visualizer height={80} mode="bars" />
          </div>

          <div className="mb-5 flex flex-wrap gap-2">
            {Object.entries(EQ_PRESETS).map(([name, values]) => (
              <button
                key={name}
                onClick={() => apply(values, name)}
                className={cn("chip", preset === name && "chip-active")}
              >
                {name}
              </button>
            ))}
          </div>

          <div className="flex items-end justify-between gap-2 rounded-2xl border border-white/5 bg-black/20 px-4 py-5">
            {EQ_BANDS.map((freq, i) => (
              <div key={freq} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[10px] tabular-nums text-white/50">
                  {gains[i] > 0 ? "+" : ""}
                  {gains[i]}
                </span>
                <Slider.Root
                  orientation="vertical"
                  className="relative flex h-32 w-4 touch-none flex-col items-center"
                  value={[gains[i]]}
                  min={-12}
                  max={12}
                  step={1}
                  onValueChange={([v]) => {
                    const next = [...gains]
                    next[i] = v
                    setPreset("Свой")
                    apply(next)
                  }}
                >
                  <Slider.Track className="relative w-1 grow overflow-hidden rounded-full bg-white/10">
                    <Slider.Range className="absolute w-full rounded-full bg-[rgb(var(--accent-rgb))]" />
                  </Slider.Track>
                  <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow-glow outline-none" />
                </Slider.Root>
                <span className="text-[10px] text-white/30">
                  {freq >= 1000 ? `${freq / 1000}k` : freq}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 flex items-center gap-4">
            <span className="w-32 text-sm text-white/60">Скорость ×{rate.toFixed(2)}</span>
            <Slider.Root
              className="relative flex h-4 flex-1 touch-none items-center"
              value={[rate * 100]}
              min={50}
              max={200}
              step={5}
              onValueChange={([v]) => setRate(v / 100)}
            >
              <Slider.Track className="relative h-1 w-full grow overflow-hidden rounded-full bg-white/10">
                <Slider.Range className="absolute h-full rounded-full bg-[rgb(var(--accent-rgb))]" />
              </Slider.Track>
              <Slider.Thumb className="block h-3.5 w-3.5 rounded-full bg-white shadow-glow outline-none" />
            </Slider.Root>
            <button className="btn glass" onClick={() => setRate(1)}>
              Сбросить
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
