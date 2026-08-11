import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import {
  BarChart3,
  Clock3,
  Download,
  Heart,
  Home,
  Library,
  ListMusic,
  Plus,
  Radio,
  Search,
  Settings,
  Sparkles,
} from "lucide-react"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useUiStore } from "@/store/ui"
import { useProfileStore } from "@/store/profile"
import { PromptDialog } from "@/components/Dialog"
import type { ViewId } from "@/lib/types"

const NAV: Array<{ id: ViewId; label: string; icon: typeof Home }> = [
  { id: "home", label: "Главная", icon: Home },
  { id: "search", label: "Поиск", icon: Search },
  { id: "wave", label: "Моя волна", icon: Radio },
  { id: "moods", label: "Настроения", icon: Sparkles },
  { id: "charts", label: "Чарты", icon: BarChart3 },
  { id: "playlists", label: "Плейлисты", icon: Library },
  { id: "library", label: "Любимое", icon: Heart },
  { id: "history", label: "История", icon: Clock3 },
  { id: "downloads", label: "Загрузки", icon: Download },
]

export function Sidebar() {
  const view = useUiStore((s) => s.view)
  const param = useUiStore((s) => s.viewParam)
  const navigate = useUiStore((s) => s.navigate)
  const toast = useUiStore((s) => s.toast)
  const profile = useProfileStore((s) => s.profile)
  const [createOpen, setCreateOpen] = useState(false)

  const { data: playlists = [], refetch } = useQuery({
    queryKey: ["playlists"],
    queryFn: api.playlists,
  })

  const createPlaylist = async (name: string) => {
    if (!name) return
    try {
      const pl = await api.createPlaylist(name)
      setCreateOpen(false)
      await refetch()
      navigate("playlist", pl.id)
      toast("Плейлист создан", "success")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const pinned = [...playlists].sort((a, b) => Number(b.pinned) - Number(a.pinned))

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-white/5 bg-ink-950/45 backdrop-blur-2xl">
      <nav className="space-y-1 p-3">
        {NAV.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => navigate(id)}
            className={cn(
              "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
              view === id || (id === "playlists" && view === "playlist")
                ? "bg-white/10 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
                : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
          >
            <Icon
              size={17}
              className={cn(
                "transition-colors",
                view === id || (id === "playlists" && view === "playlist")
                  ? "text-[rgb(var(--accent-rgb))]"
                  : "group-hover:text-white",
              )}
            />
            {label}
            {view === id && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent-rgb))] shadow-glow" />
            )}
          </button>
        ))}
      </nav>

      <div className="mx-3 my-1 h-px bg-white/5" />

      <div className="flex items-center justify-between px-5 pb-1 pt-2">
        <button
          onClick={() => navigate("playlists")}
          className="text-[11px] font-bold uppercase tracking-widest text-white/35 transition-colors hover:text-white"
        >
          Мои плейлисты
        </button>
        <button
          className="btn-icon h-6 w-6"
          onClick={() => setCreateOpen(true)}
          title="Создать плейлист"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="scroll-area min-h-0 flex-1 px-3 pb-3">
        {pinned.length === 0 && (
          <p className="px-2 py-3 text-xs leading-relaxed text-white/30">
            Пока пусто. Создай первый плейлист — или импортируй ссылку во вкладке «Плейлисты».
          </p>
        )}
        {pinned.map((pl) => (
          <button
            key={pl.id}
            onClick={() => navigate("playlist", pl.id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors",
              view === "playlist" && Number(param) === pl.id
                ? "bg-white/10 text-white"
                : "text-white/55 hover:bg-white/5 hover:text-white",
            )}
          >
            <ListMusic size={15} className="shrink-0 opacity-70" />
            <span className="truncate">{pl.name}</span>
            <span className="ml-auto shrink-0 text-[11px] text-white/25">{pl.track_count}</span>
          </button>
        ))}
      </div>

      <div className="border-t border-white/5 p-3">
        <button
          onClick={() => navigate("profile")}
          className="group flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-white/5"
        >
          <div className={`frame frame-${profile?.frame ?? "none"} h-10 w-10 shrink-0`}>
            {profile?.avatar ? (
              <img src={profile.avatar} alt="" decoding="async" />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-ink-800 text-xs font-bold">
                {(profile?.display_name ?? "H").slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-white">
              {profile?.display_name ?? "Слушатель"}
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[rgb(var(--accent-rgb))]">
                LVL {profile?.level ?? 1}
              </span>
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-[rgb(var(--accent-rgb))] transition-all duration-700"
                  style={{ width: `${Math.round((profile?.progress ?? 0) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate("settings")}
          className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-white/45 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Settings size={16} /> Настройки
        </button>
      </div>

      <PromptDialog
        open={createOpen}
        title="Новый плейлист"
        description="Как его назовём?"
        label="Название"
        defaultValue="Новый плейлист"
        maxLength={60}
        confirmText="Создать"
        onCancel={() => setCreateOpen(false)}
        onSubmit={(v) => void createPlaylist(v)}
      />
    </aside>
  )
}
