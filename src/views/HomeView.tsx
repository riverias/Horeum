import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Clock3, Flame, Heart, Play, Radio, Sparkles } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { SkeletonGrid } from "@/components/SkeletonList"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import { formatDuration } from "@/lib/utils"

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

export function HomeView() {
  const profile = useProfileStore((s) => s.profile)
  const navigate = useUiStore((s) => s.navigate)
  const startWave = usePlayerStore((s) => s.startWave)
  const playQueue = usePlayerStore((s) => s.playQueue)

  const { data: charts = [], isLoading: chartsLoading } = useQuery({
    queryKey: ["charts", "top", "all-music"],
    queryFn: () => api.charts("top", "all-music", 24),
  })
  const { data: history = [] } = useQuery({ queryKey: ["history"], queryFn: () => api.history(12) })
  const { data: moods = [] } = useQuery({ queryKey: ["moods"], queryFn: api.moods })

  return (
    <div className="space-y-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-white/40">{greeting()},</p>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">
            <span className="text-gradient">{profile?.display_name ?? "Слушатель"}</span>
          </h1>
          <p className="mt-2 text-sm text-white/40">
            Уровень {profile?.level ?? 1} • {profile?.title ?? "Новичок"} • серия {profile?.streak ?? 0} дн.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-accent" onClick={() => void startWave()}>
            <Radio size={16} /> Моя волна
          </button>
          <button className="btn glass" onClick={() => navigate("moods")}>
            <Sparkles size={16} /> По настроению
          </button>
        </div>
      </header>

      {/* быстрые карточки */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Волна", desc: "Бесконечный поток", icon: Radio, action: () => void startWave() },
          { label: "Любимое", desc: "Твои лайки", icon: Heart, action: () => navigate("library") },
          { label: "Чарты", desc: "Топ SoundCloud", icon: Flame, action: () => navigate("charts") },
          { label: "История", desc: "Что слушал", icon: Clock3, action: () => navigate("history") },
        ].map(({ label, desc, icon: Icon, action }) => (
          <motion.button
            key={label}
            whileHover={{ y: -3 }}
            onClick={action}
            className="card flex items-center gap-3 p-4 text-left"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[rgb(var(--accent-rgb)/0.18)] text-[rgb(var(--accent-rgb))]">
              <Icon size={19} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{label}</span>
              <span className="block truncate text-[11px] text-white/35">{desc}</span>
            </span>
          </motion.button>
        ))}
      </div>

      {/* настроения */}
      <section className="space-y-3">
        <h2 className="section-title">Под настроение</h2>
        <div className="flex flex-wrap gap-2.5">
          {moods.slice(0, 12).map((m) => (
            <button
              key={m.id}
              onClick={async () => {
                const tracks = await api.moodQueue(m.id, 60)
                void playQueue(tracks, 0, "mood")
              }}
              className="group relative overflow-hidden rounded-2xl px-5 py-3.5 text-sm font-bold text-white shadow-panel transition-transform hover:scale-[1.04]"
              style={{ backgroundImage: m.gradient }}
            >
              <span className="relative z-10 flex items-center gap-2">
                <span className="text-lg">{m.emoji}</span> {m.name}
              </span>
              <span className="absolute inset-0 bg-black/25 transition-opacity group-hover:opacity-0" />
            </button>
          ))}
        </div>
      </section>

      {/* чарты сеткой */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="section-title">Сейчас слушают</h2>
          <button className="btn glass text-xs" onClick={() => navigate("charts")}>
            Все чарты
          </button>
        </div>

        {chartsLoading ? (
          <SkeletonGrid count={10} />
        ) : (
          <div className="stagger grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
            {charts.slice(0, 10).map((track, i) => (
              <motion.button
                key={track.id}
                whileHover={{ y: -5 }}
                onClick={() => void playQueue(charts, i, "charts")}
                className="group text-left"
              >
                <div className="relative aspect-square overflow-hidden rounded-2xl bg-ink-800 shadow-panel">
                  {track.artwork && (
                    <img
                      src={track.artwork}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                  <span className="absolute bottom-3 right-3 grid h-11 w-11 translate-y-3 place-items-center rounded-full bg-white text-black opacity-0 shadow-glow transition-all group-hover:translate-y-0 group-hover:opacity-100">
                    <Play size={18} fill="currentColor" className="ml-0.5" />
                  </span>
                  <span className="absolute left-3 top-3 rounded-lg bg-black/60 px-2 py-0.5 text-[10px] font-bold backdrop-blur-md">
                    #{i + 1}
                  </span>
                </div>
                <p className="mt-2.5 truncate text-[13px] font-semibold text-white">{track.title}</p>
                <p className="truncate text-[11px] text-white/35">
                  {track.artist} • {formatDuration(track.duration)}
                </p>
              </motion.button>
            ))}
          </div>
        )}
      </section>

      {history.length > 0 && (
        <TrackList
          tracks={history}
          title="Продолжить слушать"
          subtitle="Недавно играло"
          source="library"
        />
      )}
    </div>
  )
}
