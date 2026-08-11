import { getCurrentWindow } from "@tauri-apps/api/window"
import { Minus, Square, X, Search, Command, Radio } from "lucide-react"
import { useUiStore } from "@/store/ui"
import { usePlayerStore } from "@/store/player"

export function TitleBar() {
  const navigate = useUiStore((s) => s.navigate)
  const setCommandOpen = useUiStore((s) => s.setCommandOpen)
  const toast = useUiStore((s) => s.toast)
  const startWave = usePlayerStore((s) => s.startWave)
  const current = usePlayerStore((s) => s.current)

  /**
   * Оконные команды могут быть недоступны в старой сборке
   * (core:window:allow-toggle-maximize и т.п.) — не роняем промисы в консоль.
   */
  const safe = async (action: () => Promise<unknown>, label: string) => {
    try {
      await action()
    } catch (e) {
      console.warn(`[window] ${label}:`, e)
      toast(`Окно: ${label} недоступно. Пересоберите приложение (npm run tauri dev).`, "error")
    }
  }

  const win = () => getCurrentWindow()

  return (
    <header className="drag-region relative z-20 flex h-11 shrink-0 items-center gap-3 border-b border-white/5 bg-ink-950/60 px-3 backdrop-blur-xl">
      <div className="flex items-center gap-2 pl-1">
        <div className="grid h-6 w-6 place-items-center rounded-lg bg-gradient-to-br from-[rgb(var(--accent-rgb))] to-fuchsia-500 text-[11px] font-black shadow-glow">
          H
        </div>
        <span className="font-display text-sm font-extrabold tracking-wide text-white/90">
          Horeum
        </span>
      </div>

      <div className="no-drag ml-2 flex items-center gap-1">
        <button className="btn h-7 px-2.5 text-xs" onClick={() => navigate("search")}>
          <Search size={13} /> Поиск
        </button>
        <button
          className="btn h-7 px-2.5 text-xs"
          onClick={() => void startWave(current?.id)}
        >
          <Radio size={13} /> Моя волна
        </button>
        <button className="btn h-7 px-2.5 text-xs" onClick={() => setCommandOpen(true)}>
          <Command size={13} /> ⌘K
        </button>
      </div>

      <div className="drag-region flex-1" />

      <div className="no-drag flex items-center">
        <button
          className="btn-icon h-8 w-10 rounded-md"
          onClick={() => void safe(() => win().minimize(), "свернуть")}
        >
          <Minus size={15} />
        </button>
        <button
          className="btn-icon h-8 w-10 rounded-md"
          onClick={() => void safe(() => win().toggleMaximize(), "развернуть")}
        >
          <Square size={12} />
        </button>
        <button
          className="btn-icon h-8 w-10 rounded-md hover:bg-red-500/80 hover:text-white"
          onClick={() => void safe(() => win().close(), "закрыть")}
        >
          <X size={15} />
        </button>
      </div>
    </header>
  )
}
