import { useQuery, useQueryClient } from "@tanstack/react-query"
import { History, Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { useUiStore } from "@/store/ui"

export function HistoryView() {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)

  const { data: tracks = [], isFetching } = useQuery({
    queryKey: ["history", 200],
    queryFn: () => api.history(200),
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <History size={24} className="text-[rgb(var(--accent-rgb))]" />
          <h1 className="font-display text-4xl font-extrabold tracking-tight">История</h1>
        </div>
        <button
          className="btn glass text-red-300"
          onClick={async () => {
            if (!window.confirm("Очистить всю историю прослушиваний?")) return
            await api.clearHistory()
            await qc.invalidateQueries({ queryKey: ["history"] })
            toast("История очищена", "info")
          }}
        >
          <Trash2 size={15} /> Очистить
        </button>
      </header>

      <TrackList
        tracks={tracks}
        loading={isFetching}
        source="library"
        emptyText="История пуста"
      />
    </div>
  )
}
