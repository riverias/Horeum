import { useEffect, useState } from "react"
import { Command } from "cmdk"
import * as Dialog from "@radix-ui/react-dialog"
import {
  BarChart3,
  Clock3,
  Heart,
  Home,
  Music2,
  Radio,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  User,
} from "lucide-react"
import { api } from "@/lib/api"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"
import type { Track, ViewId } from "@/lib/types"

const PAGES: Array<{ id: ViewId; label: string; icon: typeof Home }> = [
  { id: "home", label: "Главная", icon: Home },
  { id: "search", label: "Поиск", icon: Search },
  { id: "wave", label: "Волна", icon: Radio },
  { id: "moods", label: "Настроения", icon: Sparkles },
  { id: "charts", label: "Чарты", icon: BarChart3 },
  { id: "library", label: "Любимое", icon: Heart },
  { id: "history", label: "История", icon: Clock3 },
  { id: "profile", label: "Профиль", icon: User },
  { id: "settings", label: "Настройки", icon: Settings },
]

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen)
  const setOpen = useUiStore((s) => s.setCommandOpen)
  const navigate = useUiStore((s) => s.navigate)
  const setEqOpen = useUiStore((s) => s.setEqOpen)
  const playQueue = usePlayerStore((s) => s.playQueue)
  const startWave = usePlayerStore((s) => s.startWave)

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        setResults(await api.searchTracks(query, 8))
      } catch {
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 320)
    return () => clearTimeout(t)
  }, [query])

  const run = (fn: () => void) => {
    fn()
    setOpen(false)
    setQuery("")
  }

  const itemCls =
    "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-white/75 data-[selected=true]:bg-white/10 data-[selected=true]:text-white"

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[96] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="glass-strong fixed left-1/2 top-[18%] z-[97] w-[620px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-2xl p-2 shadow-panel">
          <Dialog.Title className="sr-only">Командная панель</Dialog.Title>
          <Command shouldFilter={false} loop>
            <div className="flex items-center gap-3 border-b border-white/5 px-3 pb-3 pt-2">
              <Search size={17} className="text-white/35" />
              <Command.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Искать треки, разделы, действия…"
                className="flex-1 bg-transparent text-[15px] text-white outline-none placeholder:text-white/25"
              />
              {loading && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
              )}
            </div>

            <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-sm text-white/30">
                Ничего не найдено
              </Command.Empty>

              {results.length > 0 && (
                <Command.Group
                  heading="Треки"
                  className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-white/30"
                >
                  {results.map((t) => (
                    <Command.Item
                      key={t.id}
                      value={`track-${t.id}`}
                      className={itemCls}
                      onSelect={() => run(() => void playQueue([t], 0, "search"))}
                    >
                      {t.artwork ? (
                        <img src={t.artwork} alt="" className="h-9 w-9 rounded-md object-cover" />
                      ) : (
                        <div className="grid h-9 w-9 place-items-center rounded-md bg-ink-800">
                          <Music2 size={14} />
                        </div>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{t.title}</span>
                        <span className="block truncate text-xs text-white/35">{t.artist}</span>
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              <Command.Group
                heading="Разделы"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-white/30"
              >
                {PAGES.filter((p) =>
                  p.label.toLowerCase().includes(query.toLowerCase()) || !query,
                ).map(({ id, label, icon: Icon }) => (
                  <Command.Item
                    key={id}
                    value={`page-${id}`}
                    className={itemCls}
                    onSelect={() => run(() => navigate(id))}
                  >
                    <Icon size={16} /> {label}
                  </Command.Item>
                ))}
              </Command.Group>

              <Command.Group
                heading="Действия"
                className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-white/30"
              >
                <Command.Item
                  value="action-wave"
                  className={itemCls}
                  onSelect={() => run(() => void startWave())}
                >
                  <Radio size={16} /> Запустить волну
                </Command.Item>
                <Command.Item
                  value="action-eq"
                  className={itemCls}
                  onSelect={() => run(() => setEqOpen(true))}
                >
                  <SlidersHorizontal size={16} /> Открыть эквалайзер
                </Command.Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
