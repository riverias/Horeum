import { useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import * as Switch from "@radix-ui/react-switch"
import { ExternalLink, LogOut, ShieldCheck } from "lucide-react"
import { openUrl } from "@tauri-apps/plugin-opener"
import { api } from "@/lib/api"
import { cn } from "@/lib/utils"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"

const HOTKEYS: Array<[string, string]> = [
  ["Space", "Играть / пауза"],
  ["Shift + ← / →", "Предыдущий / следующий трек"],
  ["← / →", "Перемотка на 5 секунд"],
  ["↑ / ↓", "Громкость"],
  ["M / S / R", "Звук / перемешать / повтор"],
  ["L / Q / E", "Текст / очередь / эквалайзер"],
  ["W / F", "Волна / полный экран"],
  ["Ctrl + K", "Командная панель"],
]

export function SettingsView() {
  const qc = useQueryClient()
  const toast = useUiStore((s) => s.toast)
  const visualizer = useUiStore((s) => s.visualizer)
  const setVisualizer = useUiStore((s) => s.setVisualizer)
  const dynamicTheme = useUiStore((s) => s.dynamicTheme)
  const setDynamicTheme = useUiStore((s) => s.setDynamicTheme)
  const scUser = useProfileStore((s) => s.scUser)
  const setScUser = useProfileStore((s) => s.setScUser)

  const [token, setToken] = useState("")
  const [importUrl, setImportUrl] = useState("")
  const [busy, setBusy] = useState(false)

  const login = async () => {
    if (!token.trim()) return
    setBusy(true)
    try {
      const user = await api.login(token.trim())
      setScUser(user)
      setToken("")
      toast(`Добро пожаловать, ${user.username}!`, "success")
    } catch (e) {
      toast((e as Error).message, "error")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl space-y-7">
      <header>
        <h1 className="font-display text-4xl font-extrabold">Настройки</h1>
      </header>

      {/* SoundCloud */}
      <section className="card space-y-4 p-6">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-[rgb(var(--accent-rgb))]" />
          <h2 className="text-lg font-bold">Аккаунт SoundCloud</h2>
        </div>

        {scUser ? (
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-full bg-ink-800">
              {scUser.avatar && <img src={scUser.avatar} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{scUser.username}</p>
              <p className="text-xs text-white/40">
                {scUser.followers} подписчиков • сессия активна
              </p>
            </div>
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
        ) : (
          <>
            <p className="text-sm leading-relaxed text-white/45">
              Вход по OAuth-токену. Открой soundcloud.com в браузере, войди в аккаунт,
              открой DevTools → Application → Cookies → скопируй значение cookie <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-xs">oauth_token</code>{" "}
              и вставь сюда. Токен хранится только локально, в твоёй SQLite-базе.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="2-000000-000000000-XXXXXXXXXXXX"
                className="input flex-1 font-mono text-xs"
              />
              <button className="btn-accent" disabled={busy} onClick={login}>
                {busy ? "Проверяю…" : "Войти"}
              </button>
              <button className="btn glass" onClick={() => void openUrl("https://soundcloud.com/signin")}>
                <ExternalLink size={15} /> Открыть SoundCloud
              </button>
            </div>
            <p className="text-xs text-white/30">
              Без входа работает всё, кроме личных лайков, плейлистов и ленты аккаунта.
            </p>
          </>
        )}
      </section>

      {/* Внешний вид */}
      <section className="card space-y-5 p-6">
        <h2 className="text-lg font-bold">Интерфейс</h2>

        <div className="space-y-2">
          <p className="text-sm text-white/60">Визуализатор</p>
          <div className="flex flex-wrap gap-2">
            {(["bars", "wave", "radial", "off"] as const).map((v) => (
              <button
                key={v}
                className={cn("chip", visualizer === v && "chip-active")}
                onClick={() => {
                  setVisualizer(v)
                  void api.setSetting("visualizer", v).catch(() => {})
                }}
              >
                {v === "bars" ? "Столбики" : v === "wave" ? "Волна" : v === "radial" ? "Радиальный" : "Выкл"}
              </button>
            ))}
          </div>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm text-white/75">Динамическая тема</span>
            <span className="block text-xs text-white/35">Подстраивать акцент под обложку трека</span>
          </span>
          <Switch.Root
            checked={dynamicTheme}
            onCheckedChange={(v) => {
              setDynamicTheme(v)
              void api.setSetting("dynamic_theme", v).catch(() => {})
            }}
            className="relative h-6 w-11 rounded-full bg-white/10 transition-colors data-[state=checked]:bg-[rgb(var(--accent-rgb))]"
          >
            <Switch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-[22px]" />
          </Switch.Root>
        </label>
      </section>

      {/* Импорт */}
      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-bold">Импорт плейлиста</h2>
        <p className="text-sm text-white/45">
          Вставь ссылку на плейлист SoundCloud — он сохранится локально со всеми треками.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://soundcloud.com/user/sets/playlist"
            className="input flex-1"
          />
          <button
            className="btn-accent"
            onClick={async () => {
              if (!importUrl.trim()) return
              try {
                const pl = await api.importScPlaylist(importUrl.trim())
                await qc.invalidateQueries({ queryKey: ["playlists"] })
                setImportUrl("")
                toast(`Импортирован плейлист «${pl.name}»`, "success")
              } catch (e) {
                toast((e as Error).message, "error")
              }
            }}
          >
            Импортировать
          </button>
        </div>
      </section>

      {/* Горячие клавиши */}
      <section className="card space-y-3 p-6">
        <h2 className="text-lg font-bold">Горячие клавиши</h2>
        <div className="grid gap-2 md:grid-cols-2">
          {HOTKEYS.map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] px-3.5 py-2">
              <span className="text-[13px] text-white/55">{desc}</span>
              <kbd className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 font-mono text-[11px] text-white/70">
                {key}
              </kbd>
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-2 p-6">
        <h2 className="text-lg font-bold">О Horeum</h2>
        <p className="text-sm leading-relaxed text-white/45">
          Horeum 1.0.0 — Tauri 2 + Rust (reqwest, rusqlite, tokio) и React 18 + TypeScript
          (Radix UI, Framer Motion, TanStack Query, Zustand, Tailwind). Тексты песен — LRCLIB,
          музыка — публичный SoundCloud API v2. Проект создан в образовательных целях.
        </p>
      </section>
    </div>
  )
}
