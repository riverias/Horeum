import { create } from "zustand"
import { api } from "@/lib/api"
import type { ViewId } from "@/lib/types"

export interface Toast {
  id: number
  message: string
  kind: "info" | "success" | "error"
}

interface UiState {
  view: ViewId
  viewParam: number | string | null
  toasts: Toast[]
  queueOpen: boolean
  lyricsOpen: boolean
  eqOpen: boolean
  fullscreen: boolean
  commandOpen: boolean
  waveLoading: boolean
  discovery: number
  visualizer: "bars" | "wave" | "radial" | "off"
  dynamicTheme: boolean
  downloadDir: string
  karaoke: boolean
  youtubeEnabled: boolean

  navigate: (view: ViewId, param?: number | string | null) => void
  toast: (message: string, kind?: Toast["kind"]) => void
  dismiss: (id: number) => void
  setQueueOpen: (open: boolean) => void
  setLyricsOpen: (open: boolean) => void
  setEqOpen: (open: boolean) => void
  setFullscreen: (open: boolean) => void
  setCommandOpen: (open: boolean) => void
  setWaveLoading: (loading: boolean) => void
  setDiscovery: (v: number) => void
  setVisualizer: (v: UiState["visualizer"]) => void
  setDynamicTheme: (v: boolean) => void
  setDownloadDir: (dir: string) => void
  setKaraoke: (v: boolean) => void
  setYoutubeEnabled: (v: boolean) => void
}

let toastId = 0

function save(key: string, value: unknown) {
  void api.setSetting(key, value).catch(() => {})
}

export const useUiStore = create<UiState>((set, get) => ({
  view: "home",
  viewParam: null,
  toasts: [],
  queueOpen: false,
  lyricsOpen: false,
  eqOpen: false,
  fullscreen: false,
  commandOpen: false,
  waveLoading: false,
  discovery: 0.55,
  visualizer: "bars",
  dynamicTheme: true,
  downloadDir: "",
  karaoke: true,
  youtubeEnabled: true,

  navigate: (view, param = null) => set({ view, viewParam: param }),

  toast: (message, kind = "info") => {
    const id = ++toastId
    set({ toasts: [...get().toasts, { id, message, kind }] })
    setTimeout(() => get().dismiss(id), 4200)
  },

  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
  setQueueOpen: (queueOpen) => set({ queueOpen }),
  setLyricsOpen: (lyricsOpen) => set({ lyricsOpen }),
  setEqOpen: (eqOpen) => set({ eqOpen }),
  setFullscreen: (fullscreen) => set({ fullscreen }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  setWaveLoading: (waveLoading) => set({ waveLoading }),
  setDiscovery: (discovery) => {
    set({ discovery })
    save("discovery", discovery)
  },
  setVisualizer: (visualizer) => {
    set({ visualizer })
    save("visualizer", visualizer)
  },
  setDynamicTheme: (dynamicTheme) => {
    set({ dynamicTheme })
    save("dynamic_theme", dynamicTheme)
  },
  setDownloadDir: (downloadDir) => {
    set({ downloadDir })
    save("downloads_dir", downloadDir)
  },
  setKaraoke: (karaoke) => {
    set({ karaoke })
    save("karaoke", karaoke)
  },
  setYoutubeEnabled: (youtubeEnabled) => {
    set({ youtubeEnabled })
    save("youtube_enabled", youtubeEnabled)
  },
}))
