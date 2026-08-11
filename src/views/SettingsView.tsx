import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import * as Switch from "@radix-ui/react-switch"
import * as Tabs from "@radix-ui/react-tabs"
import {
  Chrome,
  Download,
  ExternalLink,
  FileDown,
  FileUp,
  FolderOpen,
  Image as ImageIcon,
  Link2,
  LogOut,
  Palette,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  Youtube,
} from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api } from "@/lib/api"
import { apix } from "@/lib/apiExt"
import { cn } from "@/lib/utils"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import { useAppearanceStore } from "@/store/appearance"
import type { ImageHit, ImageSource, LoginBrowser, MediaItem } from "@/lib/typesExt"

const HOTKEYS: Array<[string, string]> = [
  ["Space", "Играть / пауза"],
  ["Shift + ← / →", "Предыдущий / следующий трек"],
  ["← / →", "Перемотка на 5 секунд"],
  ["↑ / ↓", "Громкость"],
  ["M / S / R", "Звук / перемешать / повтор"],
  ["L / Q / E", "Текст / очередь / эквалайзер"],
  ["W / F", "Моя волна / полный экран"],
  ["Ctrl + K", "Командная панель"],
]

const BROWSERS: Array<[LoginBrowser, string]> = [
  ["brave", "Brave"],
  ["chrome", "Chrome"],
  ["edge", "Edge"],
  ["firefox", "Firefox"],
  ["yandex", "Яндекс"],
  ["opera", "Opera"],
  ["default", "По умолчанию"],
]

const SWATCHES = [
  "#ff5500",
  "#8b5cf6",
  "#22d3ee",
  "#22c55e",
  "#f43f5e",
  "#eab308",
  "#3b82f6",
  "#ec4899",
  "#ffffff",
]

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Switch.Root
      checked={checked}
      onCheckedChange={onChange}
      className="relative h-6 w-11 shrink-0 rounded-full bg-white/10 transition-colors data-[state=checked]:bg-[rgb(var(--accent-rgb))]"
    >
      <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
    </Switch.Root>
  )
}

function Row({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className="min-w-0">
        <span className="block text-sm text-white/75">{title}</span>
        {hint && <span className="block text-xs text-white/35">{hint}</span>}
      </span>
      {children}
    </div>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = "",
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (v: number) => void
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between text-xs text-white/50">
        <span>{label}</span>
        <span className="tabular-nums text-white/70">
          {value}
          {suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[rgb(var(--accent-rgb))]"
      />
    </label>
  )
}

export function SettingsView() {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)
  const visualizer = useUiStore((s) => s.visualizer)
  const setVisualizer = useUiStore((s) => s.setVisualizer)
  const dynamicTheme = useUiStore((s) => s.dynamicTheme)
  const setDynamicTheme = useUiStore((s) => s.setDynamicTheme)
  const discovery = useUiStore((s) => s.discovery)
  const setDiscovery = useUiStore((s) => s.setDiscovery)
  const karaoke = useUiStore((s) => s.karaoke)
  const setKaraoke = useUiStore((s) => s.setKaraoke)
  const youtubeEnabled = useUiStore((s) => s.youtubeEnabled)
  const setYoutubeEnabled = useUiStore((s) => s.setYoutubeEnabled)
  const downloadDir = useUiStore((s) => s.downloadDir)
  const setDownloadDir = useUiStore((s) => s.setDownloadDir)

  const scUser = useProfileStore((s) => s.scUser)
  const setScUser = useProfileStore((s) => s.setScUser)
  const syncFromSc = useProfileStore((s) => s.syncFromSc)

  const ap = useAppearanceStore()

  const [token, setToken] = useState("")
  const [showToken, setShowToken] = useState(false)
  const [importUrl, setImportUrl] = useState("")
  const [importText, setImportText] = useState("")
  const [busy, setBusy] = useState(false)

  const [media, setMedia] = useState<MediaItem[]>([])
  const [query, setQuery] = useState("")
  const [source, setSource] = useState<ImageSource>("pinterest")
  const [hits, setHits] = useState<ImageHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    apix.mediaList().then(setMedia).catch(() => {})
    if (!downloadDir) apix.downloadsDir().then(setDownloadDir).catch(() => {})
  }, [downloadDir, setDownloadDir])

  const refreshMedia = () => apix.mediaList().then(setMedia).catch(() => {})

  const login = async () => {
    if (!token.trim()) return
    setBusy(true)
    try {
      const user = await api.login(token.trim())
      setScUser(user)
      setToken("")
      await syncFromSc(false).catch(() => {})
      toast(`Добро пожаловать, ${user.username}!`, "success")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  const loginInApp = async () => {
    try {
      await apix.scLoginWindow()
      toast("Окно входа открыто — войди в аккаунт, дальше всё автоматически", "info")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const loginInBrowser = async (browser: LoginBrowser) => {
    try {
      await apix.scLoginBrowser(browser)
      toast("Браузер открыт. После входа плеер синхронизируется сам", "info")
    } catch (e) {
      toast((e as Error).message, "error")
    }
  }

  const runImageSearch = async () => {
    if (!query.trim()) return
    setSearching(true)
    try {
      setHits(await apix.imageSearch(query.trim(), source, 30))
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setSearching(false)
    }
  }

  const useAsBackground = async (url: string, kind: MediaItem["kind"] = "image") => {
    ap.patch({
      bgMode: "media",
      bgMediaUrl: url,
      bgMediaKind: (kind === "video" ? "video" : kind === "gif" ? "gif" : "image") as never,
    })
    toast("Фон обновлён", "success")
  }

  const tabCls =
    "rounded-xl px-4 py-2 text-sm font-medium text-white/45 transition-colors data-[state=active]:bg-white/10 data-[state=active]:text-white"

  return (
    <div className="max-w-4xl space-y-7">
      <header>
        <h1 className="font-display text-4xl font-extrabold">Настройки</h1>
      </header>

      <Tabs.Root defaultValue="account">
        <Tabs.List className="mb-5 flex flex-wrap gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
          <Tabs.Trigger value="account" className={tabCls}>
            Аккаунт
          </Tabs.Trigger>
          <Tabs.Trigger value="look" className={tabCls}>
            Кастомизация
          </Tabs.Trigger>
          <Tabs.Trigger value="playback" className={tabCls}>
            Воспроизведение
          </Tabs.Trigger>
          <Tabs.Trigger value="data" className={tabCls}>
            Загрузки и импорт
          </Tabs.Trigger>
          <Tabs.Trigger value="about" className={tabCls}>
            О программе
          </Tabs.Trigger>
        </Tabs.List>

        {/* ======================================================= АККАУНТ */}
        <Tabs.Content value="account" className="space-y-6">
          <section className="card space-y-4 p-6">
            <div className="flex items-center gap-3">
              <ShieldCheck size={20} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">Аккаунт SoundCloud</h2>
            </div>

            {scUser ? (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-full bg-ink-800">
                    {scUser.avatar && (
                      <img src={scUser.avatar} alt="" className="h-full w-full object-cover" decoding="async" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{scUser.username}</p>
                    <p className="text-xs text-white/40">
                      {scUser.followers} подписчиков • сессия активна и сохраняется после выхода
                    </p>
                  </div>
                  <button
                    className="btn glass"
                    onClick={async () => {
                      try {
                        await syncFromSc(true)
                        await api.syncScLikes()
                        await qc.invalidateQueries()
                        toast("Ник, аватар и лайки синхронизированы", "success")
                      } catch (e) {
                        toast((e as Error).message, "error")
                      }
                    }}
                  >
                    <RefreshCw size={15} /> Синхронизировать
                  </button>
                  <button
                    className="btn glass text-red-300"
                    onClick={async () => {
                      await api.logout()
                      setScUser(null)
                      toast("Вышел из аккаунта", "info")
                    }}
                  >
                    <LogOut size={15} /> Выйти
                  </button>
                </div>
                <p className="text-xs text-white/30">
                  Ник и аватарка подтянуты из SoundCloud, но их можно поменять вручную в профиле.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm leading-relaxed text-white/50">
                  Нажми кнопку — откроется страница входа SoundCloud. После входа плеер сам
                  получит токен, подтянет ник, аватарку, лайки и плейлисты — ничего копировать вручную не надо.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-accent" onClick={loginInApp}>
                    <ShieldCheck size={15} /> Войти в приложении
                  </button>
                  {BROWSERS.map(([id, label]) => (
                    <button key={id} className="btn glass" onClick={() => void loginInBrowser(id)}>
                      <Chrome size={15} /> {label}
                    </button>
                  ))}
                </div>

                <details className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                  <summary className="cursor-pointer text-xs text-white/45">
                    Ручной ввод OAuth-токена (запасной вариант)
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <input
                      type={showToken ? "text" : "password"}
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      placeholder="2-000000-000000000-XXXXXXXXXXXX"
                      className="input flex-1 font-mono text-xs"
                    />
                    <button className="btn glass" onClick={() => setShowToken((v) => !v)}>
                      {showToken ? "Скрыть" : "Показать"}
                    </button>
                    <button className="btn-accent" disabled={busy} onClick={login}>
                      {busy ? "Проверяю…" : "Войти"}
                    </button>
                    <button
                      className="btn glass"
                      onClick={() => void openUrl("https://soundcloud.com/signin")}
                    >
                      <ExternalLink size={15} /> Сайт
                    </button>
                  </div>
                </details>

                <p className="text-xs text-white/30">
                  Токен хранится только локально, в твоей SQLite-базе.
                </p>
              </div>
            )}
          </section>
        </Tabs.Content>

        {/* =================================================== КАСТОМИЗАЦИЯ */}
        <Tabs.Content value="look" className="space-y-6">
          {/* свой фон */}
          <section className="card space-y-4 p-6">
            <div className="flex items-center gap-3">
              <ImageIcon size={18} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">Свой фон</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={cn("chip", ap.bgMode === "preset" && "chip-active")}
                onClick={() => ap.patch({ bgMode: "preset" })}
              >
                Стандартные фоны
              </button>
              <button
                className={cn("chip", ap.bgMode === "media" && "chip-active")}
                onClick={() => ap.patch({ bgMode: "media" })}
              >
                Своё фото / гифка / видео
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="btn glass"
                onClick={async () => {
                  try {
                    const item = await apix.pickMedia("any")
                    if (!item) return
                    await refreshMedia()
                    await useAsBackground(item.url, item.kind as MediaItem["kind"])
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                <FolderOpen size={15} /> Выбрать файл с ПК
              </button>
              <button
                className="btn glass"
                onClick={async () => {
                  const url = window.prompt ? "" : ""
                  void url
                  const value = importUrl.trim()
                  if (!value) {
                    toast("Вставь ссылку в поле ниже и нажми ещё раз", "info")
                    return
                  }
                  try {
                    const item = await apix.addMediaUrl(value)
                    setImportUrl("")
                    await refreshMedia()
                    await useAsBackground(item.url, item.kind as MediaItem["kind"])
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                <Link2 size={15} /> Добавить по ссылке
              </button>
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://… (картинка, GIF или видео)"
                className="input flex-1"
              />
            </div>

            {media.length > 0 && (
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                {media.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      "group relative aspect-video overflow-hidden rounded-xl border border-white/10",
                      ap.bgMediaUrl === m.url && "ring-2 ring-[rgb(var(--accent-rgb))]",
                    )}
                  >
                    {m.kind === "video" ? (
                      <video src={m.url} muted className="h-full w-full object-cover" />
                    ) : (
                      <img src={m.url} alt="" className="h-full w-full object-cover" decoding="async" />
                    )}
                    <button
                      className="absolute inset-0 bg-black/50 text-xs font-semibold opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => void useAsBackground(m.url, m.kind as MediaItem["kind"])}
                    >
                      Поставить фоном
                    </button>
                    <button
                      className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-lg bg-black/70 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={async () => {
                        await apix.mediaRemove(m.id).catch(() => {})
                        if (ap.bgMediaUrl === m.url) ap.patch({ bgMediaUrl: "", bgMode: "preset" })
                        await refreshMedia()
                      }}
                    >
                      <Trash2 size={13} className="text-red-300" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* поиск фонов */}
          <section className="card space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Search size={18} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">Найти фон в интернете</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["pinterest", "unsplash", "gif", "web"] as ImageSource[]).map((s) => (
                <button
                  key={s}
                  className={cn("chip", source === s && "chip-active")}
                  onClick={() => setSource(s)}
                >
                  {s === "pinterest"
                    ? "Pinterest"
                    : s === "unsplash"
                      ? "Unsplash"
                      : s === "gif"
                        ? "Гифки"
                        : "Весь веб"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void runImageSearch()}
                placeholder="например: dark aesthetic, anime city, neon rain…"
                className="input flex-1"
              />
              <button className="btn-accent" disabled={searching} onClick={() => void runImageSearch()}>
                {searching ? "Ищу…" : "Найти"}
              </button>
            </div>
            {hits.length > 0 && (
              <div className="grid max-h-[420px] grid-cols-3 gap-3 overflow-y-auto md:grid-cols-4">
                {hits.map((h) => (
                  <button
                    key={h.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-white/10"
                    onClick={async () => {
                      try {
                        const item = await apix.addMediaUrl(h.url)
                        await refreshMedia()
                        await useAsBackground(item.url, item.kind as MediaItem["kind"])
                      } catch (e) {
                        toast((e as Error).message, "error")
                      }
                    }}
                  >
                    <img
                      src={h.thumb || h.url}
                      alt={h.title ?? ""}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                      decoding="async"
                    />
                    <span className="absolute inset-x-0 bottom-0 bg-black/60 p-1 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                      Поставить фоном
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* эффекты фона */}
          <section className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">Эффекты фона</h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Slider label="Блюр" value={ap.blur} min={0} max={40} suffix="px" onChange={(v) => ap.patch({ blur: v })} />
              <Slider label="Затемнение" value={ap.dim} min={0} max={90} suffix="%" onChange={(v) => ap.patch({ dim: v })} />
              <Slider
                label="Насыщенность"
                value={ap.saturation}
                min={0}
                max={200}
                suffix="%"
                onChange={(v) => ap.patch({ saturation: v })}
              />
              <Slider
                label="Масштаб"
                value={ap.scale}
                min={100}
                max={140}
                suffix="%"
                onChange={(v) => ap.patch({ scale: v })}
              />
            </div>
            <Row title="Зерно (grain)" hient="Плёночный шум поверх фона">
              <Toggle checked={ap.grain} onChange={(v) => ap.patch({ grain: v })} />
            </Row>
            <Row title="Виньетка" hint="Затемнение по краям">
              <Toggle checked={ap.vignette} onChange={(v) => ap.patch({ vignette: v })} />
            </Row>
            <Row title="Звук видео-фона выключен" hint="Чтобы видео не мешало музыке">
              <Toggle checked={ap.videoMuted} onChange={(v) => ap.patch({ videoMuted: v })} />
            </Row>
          </section>

          {/* цвет и интерфейс */}
          <section className="card space-y-4 p-6">
            <div className="flex items-center gap-3">
              <Palette size={18} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">Цвет и интерфейс</h2>
            </div>

            <Row title="Свой акцентный цвет" hint="Перекрашивает всё приложение">
              <Toggle
                checked={ap.useCustomAccent}
                onChange={(v) => ap.patch({ useCustomAccent: v })}
              />
            </Row>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="color"
                value={ap.accent}
                onChange={(e) => ap.patch({ accent: e.target.value, useCustomAccent: true })}
                className="h-10 w-16 cursor-pointer rounded-xl border border-white/10 bg-transparent"
              />
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => ap.patch({ accent: c, useCustomAccent: true })}
                  className={cn(
                    "h-8 w-8 rounded-full border border-white/15 transition-transform hover:scale-110",
                    ap.accent.toLowerCase() === c && "ring-2 ring-white",
                  )}
                  style={{ background: c }}
                />
              ))}
            </div>

            <Row title="Красить иконки" hint="Иконки интерфейса в акцентном цвете">
              <Toggle checked={ap.iconAccent} onChange={(v) => ap.patch({ iconAccent: v })} />
            </Row>
            <Row title="Анимации" hint="Отключи, если нужна максимальная производительность">
              <Toggle checked={ap.animations} onChange={(v) => ap.patch({ animations: v })} />
            </Row>

            <div className="grid gap-4 md:grid-cols-2">
              <Slider
                label="Прозрачность панелей"
                value={ap.glass}
                min={20}
                max={100}
                suffix="%"
                onChange={(v) => ap.patch({ glass: v })}
              />
              <Slider
                label="Скругление углов"
                value={ap.radius}
                min={0}
                max={28}
                suffix="px"
                onChange={(v) => ap.patch({ radius: v })}
              />
            </div>

            <button className="btn glass" onClick={() => ap.reset()}>
              <RotateCcw size={15} /> Сбросить оформление
            </button>
          </section>
        </Tabs.Content>

        {/* ================================================ ВОСПРОИЗВЕДЕНИЕ */}
        <Tabs.Content value="playback" className="space-y-6">
          <section className="card space-y-4 p-6">
            <h2 className="text-lg font-bold">Интерфейс плеера</h2>

            <div className="space-y-2">
              <p className="text-sm text-white/60">Визуализатор</p>
              <div className="flex flex-wrap gap-2">
                {(["bars", "wave", "radial", "off"] as const).map((v) => (
                  <button
                    key={v}
                    className={cn("chip", visualizer === v && "chip-active")}
                    onClick={() => setVisualizer(v)}
                  >
                    {v === "bars"
                      ? "Столбики"
                      : v === "wave"
                        ? "Волна"
                        : v === "radial"
                          ? "Радиальный"
                          : "Выкл"}
                  </button>
                ))}
              </div>
            </div>

            <Row title="Динамическая тема" hint="Подстраивать акцент под обложку трека">
              <Toggle checked={dynamicTheme} onChange={setDynamicTheme} />
            </Row>
            <Row title="Караоке-текст" hint="Строка заливается цветом по ходу песни">
              <Toggle checked={karaoke} onChange={setKaraoke} />
            </Row>
            <Row title="Искать треки на YouTube" hint="Если трека нет в SoundCloud">
              <Toggle checked={youtubeEnabled} onChange={setYoutubeEnabled} />
            </Row>

            <div className="pt-2">
              <Slider
                label="Моя волна: предсказуемость ↔ открытия"
                value={Math.round(discovery * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => setDiscovery(v / 100)}
              />
              <p className="mt-1 text-xs text-white/35">
                Чем выше — тем больше нового в волне; чем ниже — тем ближе к привычному вайбу.
              </p>
            </div>
          </section>

          <section className="card space-y-3 p-6">
            <h2 className="text-lg font-bold">Горячие клавиши</h2>
            <div className="grid gap-2 md:grid-cols-2">
              {HOTKEYS.map(([key, desc]) => (
                <div
                  key={key}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2"
                >
                  <span className="text-[13px] text-white/55">{desc}</span>
                  <kbd className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                    {key}
                  </kbd>
                </div>
              ))}
            </div>
          </section>
        </Tabs.Content>

        {/* ============================================ ЗАГРУЗКИ И ИМПОРТ */}
        <Tabs.Content value="data" className="space-y-6">
          <section className="card space-y-3 p-6">
            <div className="flex items-center gap-3">
              <Download size={18} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">Папка загрузок</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 truncate rounded-xl bg-white/5 px-3 py-2 font-mono text-xs text-white/60">
                {downloadDir || "по умолчанию"}
              </code>
              <button
                className="btn glass"
                onClick={async () => {
                  const dir = await apix.pickFolder()
                  if (dir) {
                    setDownloadDir(dir)
                    toast("Папка загрузок обновлена", "success")
                  }
                }}
              >
                <FolderOpen size={15} /> Изменить
              </button>
              <button
                className="btn glass"
                onClick={() => downloadDir && void apix.revealPath(downloadDir).catch(() => {})}
              >
                Открыть
              </button>
            </div>
          </section>

          <section className="card space-y-3 p-6">
            <h2 className="text-lg font-bold">Импорт плейлиста по ссылке</h2>
            <p className="text-sm text-white/45">
              SoundCloud — импортируется целиком. Spotify, Яндекс.Музыка, Deezer, YouTube —
              берём список треков и находим их в доступных источниках.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="https://soundcloud.com/user/sets/… или https://open.spotify.com/playlist/…"
                className="input flex-1"
              />
              <button
                className="btn-accent"
                onClick={async () => {
                  const url = importUrl.trim()
                  if (!url) return
                  try {
                    if (url.includes("soundcloud.com")) {
                      const pl = await api.importScPlaylist(url)
                      await qc.invalidateQueries({ queryKey: ["playlists"] })
                      toast(`Импортирован плейлист «${pl.name}»`, "success")
                    } else {
                      const list = await apix.importLink(url)
                      toast(
                        `Найдено ${list.tracks.length} треков в «${list.name}» (${list.source})`,
                        "success",
                      )
                      await qc.invalidateQueries({ queryKey: ["playlists"] })
                    }
                    setImportUrl("")
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                Импортировать
              </button>
            </div>
          </section>

          <section className="card space-y-3 p-6">
            <h2 className="text-lg font-bold">Импорт списком и файлом</h2>
            <p className="text-sm text-white/45">
              Вставь список в формате «Артист — Название», по одному треку в строке. Подходит для
              ВК Музыки и любого другого сервиса.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={"Miyagi — Атмосфера\nThe Weeknd — Blinding Lights"}
              className="input min-h-[120px] resize-y font-mono text-xs"
            />
            <div className="flex flex-wrap gap-2">
              <button
                className="btn-accent"
                onClick={async () => {
                  if (!importText.trim()) return
                  try {
                    const list = await apix.parseTrackList(importText)
                    toast(`Распознано ${list.tracks.length} треков`, "success")
                    await qc.invalidateQueries({ queryKey: ["playlists"] })
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                <FileUp size={15} /> Распознать список
              </button>
              <button
                className="btn glass"
                onClick={async () => {
                  try {
                    const file = await apix.openTextFile()
                    if (file) setImportText(file.contents)
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                <FolderOpen size={15} /> Открыть файл
              </button>
              <button
                className="btn glass"
                onClick={async () => {
                  try {
                    const liked = await api.likedTracks()
                    const text = liked
                      .map((t) => `${t.artist} — ${t.title}`)
                      .join("\n")
                    const path = await apix.saveTextFile("horeum-liked.txt", text)
                    if (path) toast("Экспорт готов", "success")
                  } catch (e) {
                    toast((e as Error).message, "error")
                  }
                }}
              >
                <FileDown size={15} /> Экспорт лайков
              </button>
            </div>
          </section>
        </Tabs.Content>

        {/* ================================================== О ПРОГРАММЕ */}
        <Tabs.Content value="about">
          <section className="card space-y-2 p-6">
            <div className="flex items-center gap-3">
              <Youtube size={18} className="text-[rgb(var(--accent-rgb))]" />
              <h2 className="text-lg font-bold">О Horeum</h2>
            </div>
            <p className="text-sm leading-relaxed text-white/45">
              Horeum 1.1.0 — Tauri 2 + Rust (reqwest, rusqlite, tokio) и React 18 + TypeScript
              (Radix UI, Framer Motion, TanStack Query, Zustand, Tailwind). Тексты песен — LRCLIB,
              музыка — публичные API SoundCloud и YouTube. Проект создан в образовательных целях.
            </p>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}
