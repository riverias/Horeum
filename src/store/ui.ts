import { create } from "zustand"
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
}

let toastId = 0

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
  setDiscovery: (discovery) => set({ discovery }),
  setVisualizer: (visualizer) => set({ visualizer }),
  setDynamicTheme: (dynamicTheme) => set({ dynamicTheme }),
}))
