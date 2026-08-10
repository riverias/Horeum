import { useEffect } from "react"
import { api } from "@/lib/api"
import { engine, EQ_PRESETS } from "@/audio/engine"
import { usePlayerStore } from "@/store/player"
import { useProfileStore } from "@/store/profile"
import { useUiStore } from "@/store/ui"

/** Первичная инициализация: client_id, сессия, профиль, настройки. */
export function useBootstrap() {
  useEffect(() => {
    usePlayerStore.getState()._bootstrap()
    const ui = useUiStore.getState()

    ;(async () => {
      try {
        await useProfileStore.getState().load()
      } catch (e) {
        ui.toast(`Профиль: ${(e as Error).message}`, "error")
      }

      try {
        const settings = await api.getSettings()
        const volume = Number(settings.volume ?? 0.8)
        usePlayerStore.getState().setVolume(Number.isFinite(volume) ? volume : 0.8)
        if (typeof settings.discovery === "number") ui.setDiscovery(settings.discovery)
        if (typeof settings.visualizer === "string")
          ui.setVisualizer(settings.visualizer as "bars")
        if (Array.isArray(settings.eq)) engine.setEqPreset(settings.eq as number[])
        else engine.setEqPreset(EQ_PRESETS["Ровно"])
      } catch {
        /* настроек ещё нет */
      }

      try {
        await api.init()
        const session = await api.session()
        useProfileStore.getState().setScUser(session.user)
      } catch (e) {
        ui.toast(`SoundCloud: ${(e as Error).message}`, "error")
      }
    })()
  }, [])
}
