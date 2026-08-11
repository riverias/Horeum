import { useQuery } from "@tanstack/react-query"
import { motion } from "framer-motion"
import { Clock3, Radio, Sparkles, TrendingUp } from "lucide-react"
import { api } from "@/lib/api"
import { TrackList } from "@/components/TrackList"
import { SkeletonGrid } from "@/components/SkeletonList"
import { SmartPlaylists } from "@/components/SmartPlaylists"
import { ActivityPanel } from "@/components/ActivityPanel"
import { PlaybackTuning } from "@/components/PlaybackTuning"
import { NetworkPanel } from "@/components/NetworkPanel"
import { formatCount } from "@/lib/utils"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Доброй ночи"
  if (h < 12) return "Доброе утро"
  if (h < 18) return "Добрый день"
  return "Добрый вечер"
}

export function HomeView() {
  const navigate = useUiStore((s) => s.navigate)
  const waveLoading = useUiStore((s) => s.waveLoading)
  const startWave = usePlayerStore((s) => s.startWave)
  const profile = useProfileStore((s) => s.profile)

  const { data: charts = [], isFetching: chartsLoading } = useQuery({
    queryKey: ["charts", "trending", "all-music", 12],
    queryFn: () => api.charts("trending", "all-music", 12),
    staleTime: 10 * 60 * 1000,
  })
  const { data: history = [] } = useQuery({ queryKey: ["history", 10], queryFn: () => api.history(10) })
  const { data: moods = [] } = useQuery({ queryKey: ["moods"], queryFn: api.moods, staleTime: Infinity })
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats })

  return (
    <div className="space-y-10">
      {/* герой */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card relative overflow-hidden p-8"
      >
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl"
          style={{ background: "rgba(var(--accent-rgb), 0.28)" }}
        />
        <div className="relative z-10">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/35">Horeum</p>
          <h1 className="mt-2 font-display text-5xl font-extrabold tracking-tight">
            {greeting()},{" "}
            <span className="text-gradient">{profile?.display_name ?? "меломан"}</span>
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/45">
            Запусти «Волну» — бесконечный поток, который собирается из твоих лайков, истории и
            похожих треков SoundCloud, или выбери настроение.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <button className="btn-accent" disabled={waveLoading} onClick={() => void startWave()}>
              <Radio size={17} /> {waveLoading ? "Собираю волну…" : "Запустить волну"}
            </button>
            <button className="btn glass" onClick={() => navigate("moods")}>
              <Sparkles size={16} /> По настроению
            </button>
            <button className="btn glass" onClick={() => navigate("charts")}>
              <TrendingUp size={16} /> Чарты
            </button>
          </div>

          {stats && (
            <div className="mt-7 flex flex-wrap gap-6 text-xs text-white/40">
              <span>
                <b className="text-white">{stats.tracks_played}</b> прослушиваний
              </span>
              <span>
                <b className="text-white">{stats.minutes_listened}</b> минут
              </span>
              <span>
                <b className="text-white">{stats.unique_artists}</b> артистов
              </span>
            </div>
          )}
        </div>
      </motion.section>

      {/* умные подборки */}
      <SmartPlaylists />

      {/* настроения */}
      <section className="space-y-4">
        <h2 className="section-title text-xl">Настроение сейчас</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {moods.slice(0, 6).map((m, i) => (
            <motion.button
              key={m.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={{ y: -4 }}
              onClick={() => navigate("moods")}
              className="relative h-28 overflow-hidden rounded-2xl p-4 text-left shadow-panel"
              style={{ background: m.gradient }}
            >
              <span className="text-2xl">{m.emoji}</span>
              <p className="mt-1 text-sm font-bold drop-shadow">{m.name}</p>
            </motion.button>
          ))}
        </div>
      </section>

      {/* чарты + боковые панели */}
      <div className="grid gap-7 xl:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-8">
          <section className="space-y-4">
            <div className="flex items-end justify-between">
              <h2 className="section-title text-xl">Набирают популярность</h2>
              <button
                className="text-xs text-white/40 hover:text-white"
                onClick={() => navigate("charts")}
              >
                Все чарты →
              </button>
            </div>
            {chartsLoading ? (
              <SkeletonGrid count={6} />
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                {charts.slice(0, 8).map((t, i) => (
                  <motion.button
                    key={t.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    whileHover={{ y: -5 }}
                    onClick={() => usePlayerStore.getState().playQueue(charts, i, "charts")}
                    className="card overflow-hidden p-3 text-left"
                  >
                    <div className="aspect-square overflow-hidden rounded-xl bg-ink-800">
                      {t.artwork && (
                        <img
                          src={t.artwork}
                          alt=""
                          decoding="async"
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <p className="mt-2.5 truncate text-[13px] font-semibold">{t.title}</p>
                    <p className="truncate text-[11px] text-white/35">{t.artist}</p>
                    <p className="mt-1 text-[10px] text-white/25">
                      {formatCount(t.playback_count)} просл.
                    </p>
                  </motion.button>
                ))}
              </div>
            )}
          </section>

          {history.length > 0 && (
            <TrackList
              tracks={history}
              title="Вы слушали"
              source="library"
              icon={<Clock3 size={18} />}
              layoutSwitcher
            />
          )}
        </div>

        <aside className="space-y-5">
          <ActivityPanel limit={10} />
          <PlaybackTuning />
          <NetworkPanel />
        </aside>
      </div>
    </div>
  )
}
