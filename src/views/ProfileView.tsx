import { useQuery } from "@tanstack/react-query"
import * as Tabs from "@radix-ui/react-tabs"
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Check, Flame, Lock, Music4, Sparkles, Trophy } from "lucide-react"
import { api } from "@/lib/api"
import { cn, formatListenTime } from "@/lib/utils"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import type { Unlockable } from "@/lib/types"

function CosmeticGrid({
  items,
  active,
  level,
  onPick,
  preview,
}: {
  items: Unlockable[]
  active: string
  level: number
  onPick: (id: string) => void
  preview: (item: Unlockable) => JSX.Element
}) {
  return (
    <div className="grid grid-cols-3 gap-4 md:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => {
        const locked = level < item.level
        return (
          <button
            key={item.id}
            disabled={locked}
            onClick={() => onPick(item.id)}
            className={cn(
              "card relative overflow-hidden p-3 text-center transition-transform",
              active === item.id && "ring-2 ring-[rgb(var(--accent-rgb))]",
              locked ? "cursor-not-allowed opacity-45" : "hover:-translate-y-1",
            )}
          >
            {preview(item)}
            <p className="mt-2 truncate text-[12px] font-semibold">{item.name}</p>
            <p className="text-[10px] text-white/35">
              {locked ? `с ${item.level} уровня` : item.animated ? "анимированный" : "открыто"}
            </p>
            {locked && (
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg bg-black/60">
                <Lock size={12} />
              </span>
            )}
            {active === item.id && !locked && (
              <span className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-lg bg-[rgb(var(--accent-rgb))]">
                <Check size={13} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

export function ProfileView() {
  const profile = useProfileStore((s) => s.profile)
  const cosmetics = useProfileStore((s) => s.cosmetics)
  const patch = useProfileStore((s) => s.patch)
  const toast = useUiStore((s) => s.toast)

  const { data: achievements = [] } = useQuery({
    queryKey: ["achievements"],
    queryFn: api.achievements,
  })
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: api.stats })

  if (!profile) return null

  const backgrounds = cosmetics.filter((c) => c.kind === "background")
  const frames = cosmetics.filter((c) => c.kind === "frame")
  const accents = cosmetics.filter((c) => c.kind === "accent")
  const unlocked = achievements.filter((a) => a.unlocked).length

  const apply = async (key: string, value: string) => {
    try {
      await patch({ [key]: value })
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const tabCls = (v: string) =>
    "rounded-xl px-4 py-2 text-sm font-medium text-white/45 transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"

  return (
    <div className="space-y-8">
      {/* шапка профиля */}
      <header className="card relative overflow-hidden p-8">
        <div className={`bg-scene bg-${profile.background} opacity-60`} />
        <div className="relative z-10 flex flex-wrap items-center gap-6">
          <div className={`frame frame-${profile.frame} h-28 w-28 shrink-0`}>
            {profile.avatar ? (
              <img src={profile.avatar} alt="" />
            ) : (
              <div className="grid h-full w-full place-items-center rounded-full bg-ink-800 font-display text-3xl font-black">
                {profile.display_name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <button
              onClick={async () => {
                const name = window.prompt("Имя", profile.display_name)
                if (name) await apply("display_name", name)
              }}
              className="font-display text-4xl font-extrabold tracking-tight hover:opacity-80"
            >
              {profile.display_name}
            </button>
            <p className="mt-1 text-sm text-[rgb(var(--accent-rgb))]">{profile.title}</p>
            <button
              onClick={async () => {
                const bio = window.prompt("О себе", profile.bio)
                if (bio !== null) await apply("bio", bio)
              }}
              className="mt-2 block max-w-xl text-left text-sm text-white/45 hover:text-white/70"
            >
              {profile.bio || "Добавить описание…"}
            </button>

            <div className="mt-4 max-w-md">
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="font-bold text-white">Уровень {profile.level}</span>
                <span className="tabular-nums text-white/40">
                  {profile.xp - profile.level_xp} / {profile.next_level_xp - profile.level_xp} XP
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full shadow-glow transition-all duration-1000"
                  style={{
                    width: `${Math.round(profile.progress * 100)}%`,
                    background:
                      "linear-gradient(90deg, rgb(var(--accent-rgb)), rgba(255,255,255,0.9))",
                  }}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { icon: Music4, label: "Треков", value: profile.tracks_played },
              {
                icon: Sparkles,
                label: "Прослушано",
                value: formatListenTime(Math.floor(profile.seconds_listened / 60)),
              },
              { icon: Flame, label: "Серия", value: `${profile.streak} дн.` },
              { icon: Trophy, label: "Ачивки", value: `${unlocked}/${achievements.length}` },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="glass rounded-2xl px-4 py-3 text-center">
                <Icon size={16} className="mx-auto text-[rgb(var(--accent-rgb))]" />
                <p className="mt-1.5 font-display text-lg font-extrabold">{value}</p>
                <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <Tabs.Root defaultValue="custom">
        <Tabs.List className="mb-5 flex gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
          <Tabs.Trigger value="custom" className={tabCls("custom")}>
            Кастомизация
          </Tabs.Trigger>
          <Tabs.Trigger value="achievements" className={tabCls("achievements")}>
            Достижения
          </Tabs.Trigger>
          <Tabs.Trigger value="stats" className={tabCls("stats")}>
            Статистика
          </Tabs.Trigger>
        </Tabs.List>

        {/* --------------------------------------------- кастомизация */}
        <Tabs.Content value="custom" className="space-y-8">
          <section className="space-y-3">
            <h3 className="section-title text-lg">Фоны</h3>
            <CosmeticGrid
              items={backgrounds}
              active={profile.background}
              level={profile.level}
              onPick={(id) => void apply("background", id)}
              preview={(item) => (
                <div className="relative h-20 overflow-hidden rounded-xl">
                  <div className={`bg-scene bg-${item.value}`} />
                </div>
              )}
            />
          </section>

          <section className="space-y-3">
            <h3 className="section-title text-lg">Рамки аватара</h3>
            <CosmeticGrid
              items={frames}
              active={profile.frame}
              level={profile.level}
              onPick={(id) => void apply("frame", id)}
              preview={(item) => (
                <div className={`frame frame-${item.value} mx-auto h-16 w-16`}>
                  {profile.avatar ? (
                    <img src={profile.avatar} alt="" />
                  ) : (
                    <div className="h-full w-full rounded-full bg-ink-800" />
                  )}
                </div>
              )}
            />
          </section>

          <section className="space-y-3">
            <h3 className="section-title text-lg">Акцентный цвет</h3>
            <CosmeticGrid
              items={accents}
              active={profile.accent}
              level={profile.level}
              onPick={(id) => void apply("accent", id)}
              preview={(item) => (
                <div
                  className="mx-auto h-16 w-16 rounded-2xl shadow-panel"
                  style={{ background: `linear-gradient(135deg, ${item.value}, #ffffff22)` }}
                />
              )}
            />
          </section>

          <section className="card space-y-3 p-5">
            <h3 className="text-sm font-bold">Аватар и баннер</h3>
            <div className="flex flex-wrap gap-2">
              <button
                className="btn glass"
                onClick={async () => {
                  const url = window.prompt("Ссылка на аватар (URL картинки)", profile.avatar ?? "")
                  if (url !== null) await apply("avatar", url)
                }}
              >
                Изменить аватар
              </button>
              <button
                className="btn glass"
                onClick={async () => {
                  const url = window.prompt("Ссылка на баннер", profile.banner ?? "")
                  if (url !== null) await apply("banner", url)
                }}
              >
                Изменить баннер
              </button>
            </div>
          </section>
        </Tabs.Content>

        {/* --------------------------------------------- достижения */}
        <Tabs.Content value="achievements">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {achievements.map((a) => (
              <div
                key={a.code}
                className={cn(
                  "card flex items-center gap-4 p-4",
                  !a.unlocked && "opacity-55 grayscale",
                )}
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/5 text-2xl">
                  {a.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold">{a.name}</p>
                  <p className="truncate text-[11px] text-white/40">{a.description}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[rgb(var(--accent-rgb))]"
                      style={{ width: `${Math.round(Math.min(1, a.progress) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="shrink-0 text-[11px] font-bold text-[rgb(var(--accent-rgb))]">
                  +{a.xp}
                </span>
              </div>
            ))}
          </div>
        </Tabs.Content>

        {/* --------------------------------------------- статистика */}
        <Tabs.Content value="stats" className="space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ["Прослушиваний", stats?.tracks_played ?? 0],
              ["Уникальных треков", stats?.unique_tracks ?? 0],
              ["Артистов", stats?.unique_artists ?? 0],
              ["Минут", stats?.minutes_listened ?? 0],
            ].map(([label, value]) => (
              <div key={label as string} className="card p-5">
                <p className="font-display text-3xl font-extrabold">{value as number}</p>
                <p className="mt-1 text-[11px] uppercase tracking-wider text-white/35">
                  {label as string}
                </p>
              </div>
            ))}
          </div>

          <div className="card p-5">
            <h3 className="mb-4 text-sm font-bold">Последние 14 дней (минуты)</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats?.last_14_days ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="day" tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                  <YAxis tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 11 }} />
                  <ReTooltip
                    cursor={{ fill: "rgba(255,255,255,0.05)" }}
                    contentStyle={{
                      background: "#12121e",
                      border: "1px solid rgba(255,255,255,0.1)",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="minutes" fill="var(--accent)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="card p-5">
              <h3 className="mb-4 text-sm font-bold">Топ артистов</h3>
              <div className="space-y-2.5">
                {(stats?.top_artists ?? []).map((a, i) => (
                  <div key={a.artist_id} className="flex items-center gap-3">
                    <span className="w-4 text-xs text-white/30">{i + 1}</span>
                    <div className="h-9 w-9 overflow-hidden rounded-full bg-ink-800">
                      {a.avatar && <img src={a.avatar} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <span className="flex-1 truncate text-[13px]">{a.artist}</span>
                    <span className="text-[11px] text-white/35">{a.plays} просл.</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-4 text-sm font-bold">Жанры</h3>
              <div className="flex flex-wrap gap-2">
                {(stats?.top_genres ?? []).map((g) => (
                  <span key={g.genre} className="chip">
                    {g.genre} · {g.plays}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
