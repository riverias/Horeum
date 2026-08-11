import { AlignJustify, Grid3x3, Image, LayoutGrid, List, Table } from "lucide-react"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/store/ui"
import type { TrackLayout } from "@/lib/types"

const LAYOUTS: Array<{ id: TrackLayout; label: string; icon: typeof List }> = [
  { id: "rows", label: "Список", icon: List },
  { id: "compact", label: "Компактно", icon: AlignJustify },
  { id: "table", label: "Таблица", icon: Table },
  { id: "grid", label: "Карточки", icon: LayoutGrid },
  { id: "big", label: "Крупные", icon: Image },
  { id: "mini", label: "Только обложки", icon: Grid3x3 },
]

/** Переключатель вида карточек трека — выбор сохраняется. */
export function LayoutSwitcher({ className }: { className?: string }) {
  const layout = useUiStore((s) => s.trackLayout)
  const setLayout = useUiStore((s) => s.setTrackLayout)

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-0.5 rounded-xl border border-white/5 bg-white/[0.03] p-1",
        className,
      )}
    >
      {LAYOUTS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          title={label}
          onClick={() => setLayout(id)}
          className={cn(
            "grid h-8 w-8 place-items-center rounded-lg transition-colors",
            layout === id
              ? "bg-white/10 text-[rgb(var(--accent-rgb))]"
              : "text-white/40 hover:bg-white/5 hover:text-white",
          )}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  )
}
