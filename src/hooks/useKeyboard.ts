import { useEffect } from "react"
import { usePlayerStore } from "@/store/player"
import { useUiStore } from "@/store/ui"

/** Глобальные горячие клавиши плеера. */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable

      const player = usePlayerStore.getState()
      const ui = useUiStore.getState()

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        ui.setCommandOpen(!ui.commandOpen)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault()
        ui.navigate("search")
        return
      }
      if (typing) return

      switch (e.code) {
        case "Space":
          e.preventDefault()
          player.toggle()
          break
        case "ArrowRight":
          if (e.shiftKey) void player.next()
          else player.seek(player.positionMs + 5000)
          break
        case "ArrowLeft":
          if (e.shiftKey) void player.prev()
          else player.seek(Math.max(0, player.positionMs - 5000))
          break
        case "ArrowUp":
          e.preventDefault()
          player.setVolume(Math.min(1, player.volume + 0.05))
          break
        case "ArrowDown":
          e.preventDefault()
          player.setVolume(Math.max(0, player.volume - 0.05))
          break
        case "KeyM":
          player.toggleMute()
          break
        case "KeyS":
          player.toggleShuffle()
          break
        case "KeyR":
          player.cycleRepeat()
          break
        case "KeyL":
          ui.setLyricsOpen(!ui.lyricsOpen)
          break
        case "KeyQ":
          ui.setQueueOpen(!ui.queueOpen)
          break
        case "KeyE":
          ui.setEqOpen(!ui.eqOpen)
          break
        case "KeyW":
          void player.startWave(player.current?.id)
          break
        case "KeyF":
          ui.setFullscreen(!ui.fullscreen)
          break
        case "Escape":
          if (ui.fullscreen) ui.setFullscreen(false)
          break
      }
    }

    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
}
