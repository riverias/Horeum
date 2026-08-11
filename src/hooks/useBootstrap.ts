import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { api } from "@/lib/api"
import { apix } from "@/lib/apiExt"
import { engine, EQ_PRESETS } from "@/audio/engine"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"
import { useAppearanceStore } from "@/store/appearance"

const TOKEN_KEY = "horeum:sc_token"

/** Токен храним и в настройках приложения, и локально — чтобы вход переживал перезапуск. */
function rememberToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
  void api.setSetting("sc_token", token).catch(() => {})
}

function readLocalToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? ""
  } catch {
    return ""
  }
}

/**
 * Единая точка входа: приложение само подхватывает OAuth-токен,
 * полученный из окна входа или из внешнего браузера.
 */
export async function applyScToken(token: string, silent = false) {
  const ui = useUiStore.getState()
  const clean = token.trim()
  if (!clean) return
  try {
    const user = await api.login(clean)
    rememberToken(clean)
    useProfileStore.getState().setScUser(user)
    await apix.closeLoginWindow().catch(() => {})
    if (!silent) ui.toast(`Вошли как ${user.username} ✅`, "success")
    await useProfileStore.getState().syncFromSc?.()
    void api.syncScLikes().catch(() => {})
  } catch (e) {
    if (!silent) ui.toast(`Вход: ${(e as Error).message}`, "error")
  }
}

/** Первичная инициализация: client_id, сессия, профиль, настройки, внешний вид. */
export function useBootstrap() {
  useEffect(() => {
    usePlayerStore.getState()._bootstrap()
    const ui = useUiStore.getState()
    let unlistenToken: (() => void) | null = null

    ;(async () => {
      try {
        await useProfileStore.getState().load()
      } catch (e) {
        ui.toast(`Профиль: ${(e as Error).message}`, "error")
      }

      let savedToken = readLocalToken()

      try {
        const settings = await api.getSettings()
        const volume = Number(settings.volume ?? 0.8)
        usePlayerStore.getState().setVolume(Number.isFinite(volume) ? volume : 0.8)
        if (typeof settings.discovery === "number") ui.setDiscovery(settings.discovery)
        if (typeof settings.visualizer === "string")
          ui.setVisualizer(settings.visualizer as "bars")
        if (Array.isArray(settings.eq)) engine.setEqPreset(settings.eq as number[])
        else engine.setEqPreset(EQ_PRESETS["Ровно"])
        if (!savedToken && typeof settings.sc_token === "string") savedToken = settings.sc_token

        // оформление: свой фон, блюр, эффекты, акцентный цвет
        useAppearanceStore.getState().hydrate(settings.appearance)
        if (typeof settings.downloads_dir === "string" && settings.downloads_dir) {
          ui.setDownloadDir(settings.downloads_dir)
        } else {
          apix
            .downloadsDir()
            .then((dir) => ui.setDownloadDir(dir))
            .catch(() => {})
        }
      } catch {
        useAppearanceStore.getState().hydrate(null)
      }

      try {
        await api.init()
        const session = await api.session()
        useProfileStore.getState().setScUser(session.user)
        // не вошли, но токен с прошлого раза есть — восстанавливаем вход молча
        if (!session.logged_in && savedToken) await applyScToken(savedToken, true)
      } catch (e) {
        ui.toast(`SoundCloud: ${(e as Error).message}`, "error")
      }

      // возвращаем очередь и позицию с прошлого запуска
      void usePlayerStore.getState().restoreSession()
    })()

    // Вход в SoundCloud: окно/браузер отдаёт токен обратно в приложение
    listen<string>("sc-token", (event) => {
      void applyScToken(String(event.payload || ""))
    })
      .then((un) => {
        unlistenToken = un
      })
      .catch(() => {})

    return () => {
      unlistenToken?.()
    }
  }, [])
}
