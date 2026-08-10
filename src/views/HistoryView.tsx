import { useQuery } from "@tanstack/react-query"
import { Trash2 } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { useUiStore } from "@/store/ui"

export function HistoryView() {
  const toast = useUiStore((s) => s.toast)
  const { data: tracks = [], isFetching, refetch } = useQuery({
    queryKey: ["history", "full"],
    queryFn: () => api.history(300),
  })

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-extrabold">История</h1>
          <p className="mt-2 text-sm text-white/40">Всё, что ты слушал в Horeum</p>
        </div>
        <button
          className="btn glass text-red-300"
          onClick={async () => {
            await api.clearHistory()
            await refetch()
            toast("История очищена", "success")
          }}
        >
          <Trash2 size={15} /> Очистить
        </button>
      </header>

      <TrackList
        tracks={tracks}
        loading={isFetching && tracks.length === 0}
        source="library"
        emptyText="История пуста"
      />
    </div>
  )
}
