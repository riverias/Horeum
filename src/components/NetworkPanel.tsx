import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ShieldCheck } from "lucide-react"
import { api } from "@/lib/api"
import { net } from "@/lib/apiNet"
import { useUiStore } from "@/store/ui"

/**
 * Обход блокировок (РФ).
 * Весь трафик идёт напрямую, просто первый пакет режется на части — это не VPN.
 */
export function NetworkPanel() {
  const toast = useUiStore((s) => s.toast)
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["dpi-status"],
    queryFn: net.dpiStatus,
    staleTime: 60_000,
    retry: false,
  })

  if (!data) return null

  const update = async (patch: Partial<{ enabled: boolean; split: number; delay: number }>) => {
    const enabled = patch.enabled ?? data.enabled
    const split = patch.split ?? data.split_pos
    const delay = patch.delay ?? data.delay_ms
    try {
      await net.dpiSet(enabled, split, delay)
      await Promise.all([
        api.setSetting("dpi_bypass", enabled),
        api.setSetting("dpi_split_pos", split),
        api.setSetting("dpi_delay_ms", delay),
      ])
      await qc.invalidateQueries({ queryKey: ["dpi-status"] })
      if (patch.enabled !== undefined) {
        toast(enabled ? "Обход блокировок включён" : "Обход блокировок выключен", "info")
      }
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  return (
    <section className="card space-y-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-bold text-white/70">
            <ShieldCheck size={16} /> Обход блокировок
          </h3>
          <p className="mt-1 text-[11px] leading-relaxed text-white/35">
            Разбивает первый пакет соединения на части, как zapret. Помогает, когда SoundCloud
            не открывается без VPN.
          </p>
        </div>
        <button
          onClick={() => void update({ enabled: !data.enabled })}
          className={`chip ${data.enabled ? "chip-active" : ""}`}
        >
          {data.enabled ? "Вкл" : "Выкл"}
        </button>
      </div>

      <div className="space-y-3 text-[11px] text-white/40">
        <label className="block">
          <span>Точка разреза: {data.split_pos} байт</span>
          <input
            type="range"
            min={1}
            max={16}
            step={1}
            value={data.split_pos}
            disabled={!data.enabled}
            onChange={(e) => void update({ split: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
        <label className="block">
          <span>Задержка между частями: {data.delay_ms} мс</span>
          <input
            type="range"
            min={0}
            max={80}
            step={2}
            value={data.delay_ms}
            disabled={!data.enabled}
            onChange={(e) => void update({ delay: Number(e.target.value) })}
            className="mt-1 w-full"
          />
        </label>
        <p className="text-[10px] text-white/25">
          {data.running ? `Локальный прокси: 127.0.0.1:${data.port}` : "Прокси не запущен"}
        </p>
      </div>
    </section>
  )
}
