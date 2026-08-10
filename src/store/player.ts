import { create } from "zustand"
import { engine } from "@/audio/engine"
import { api } from "@/lib/api"
import { shuffleArray, uniqueById } from "@/lib/utils"
import type { PlaySource, RepeatMode, Track } from "@/lib/types"
import { useUiStore } from "./ui"
import { useProfileStore } from "./profile"

interface PlayerState {
  queue: Track[]
  originalQueue: Track[]
  index: number
  current: Track | null
  playing: boolean
  loading: boolean
  positionMs: number
  durationMs: number
  volume: number
  muted: boolean
  rate: number
  repeat: RepeatMode
  shuffle: boolean
  source: PlaySource
  waveMode: boolean
  listenedSeconds: number
  sleepTimerAt: number | null

  playQueue: (tracks: Track[], startIndex?: number, source?: PlaySource) => Promise<void>
  playTrack: (track: Track, source?: PlaySource) => Promise<void>
  playNextInQueue: (track: Track) => void
  appendToQueue: (tracks: Track[]) => void
  removeFromQueue: (index: number) => void
  toggle: () => void
  next: (auto?: boolean) => Promise<void>
  prev: () => Promise<void>
  seek: (ms: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  setRate: (r: number) => void
  cycleRepeat: () => void
  toggleShuffle: () => void
  startWave: (seedTrackId?: number) => Promise<void>
  setSleepTimer: (minutes: number | null) => void
  _bootstrap: () => void
}

let bootstrapped = false
let extendingWave = false

export const usePlayerStore = create<PlayerState>((set, get) => ({
  queue: [],
  originalQueue: [],
  index: -1,
  current: null,
  playing: false,
  loading: false,
  positionMs: 0,
  durationMs: 0,
  volume: 0.8,
  muted: false,
  rate: 1,
  repeat: "off",
  shuffle: false,
  source: "library",
  waveMode: false,
  listenedSeconds: 0,
  sleepTimerAt: null,

  async playQueue(tracks, startIndex = 0, source = "library") {
    const clean = uniqueById(tracks.filter((t) => t.has_transcodings))
    if (!clean.length) {
      useUiStore.getState().toast("Нет воспроизводимых треков", "error")
      return
    }
    const shuffle = get().shuffle
    const ordered = shuffle
      ? [clean[startIndex], ...shuffleArray(clean.filter((_, i) => i !== startIndex))]
      : clean
    set({
      queue: ordered,
      originalQueue: clean,
      index: shuffle ? 0 : startIndex,
      source,
      waveMode: source === "wave",
    })
    await loadCurrent(set, get)
  },

  async playTrack(track, source = "library") {
    await get().playQueue([track], 0, source)
  },

  playNextInQueue(track) {
    const { queue, index } = get()
    const next = [...queue]
    next.splice(index + 1, 0, track)
    set({ queue: uniqueById(next) })
    useUiStore.getState().toast(`Следующим: ${track.title}`, "success")
  },

  appendToQueue(tracks) {
    set({ queue: uniqueById([...get().queue, ...tracks]) })
  },

  removeFromQueue(i) {
    const { queue, index } = get()
    if (i === index) return
    set({
      queue: queue.filter((_, idx) => idx !== i),
      index: i < index ? index - 1 : index,
    })
  },

  toggle() {
    engine.toggle()
  },

  async next(auto = false) {
    const { queue, index, repeat, waveMode } = get()
    await flushPlay(get, set)

    if (auto && repeat === "one") {
      engine.seek(0)
      void engine.play()
      return
    }

    let nextIndex = index + 1
    if (nextIndex >= queue.length) {
      if (waveMode) {
        await extendWave(set, get)
        nextIndex = get().index + 1
        if (nextIndex >= get().queue.length) return
      } else if (repeat === "all") {
        nextIndex = 0
      } else {
        set({ playing: false })
        engine.pause()
        return
      }
    }
    set({ index: nextIndex })
    await loadCurrent(set, get)
  },

  async prev() {
    if (get().positionMs > 4000) {
      engine.seek(0)
      return
    }
    const index = Math.max(0, get().index - 1)
    set({ index })
    await loadCurrent(set, get)
  },

  seek(ms) {
    engine.seek(ms)
    set({ positionMs: ms })
  },

  setVolume(v) {
    engine.setVolume(v)
    set({ volume: v, muted: v === 0 })
    void api.setSetting("volume", v).catch(() => {})
  },

  toggleMute() {
    const muted = !get().muted
    engine.setMuted(muted)
    set({ muted })
  },

  setRate(r) {
    engine.setRate(r)
    set({ rate: r })
  },

  cycleRepeat() {
    const order: RepeatMode[] = ["off", "all", "one"]
    const repeat = order[(order.indexOf(get().repeat) + 1) % order.length]
    set({ repeat })
  },

  toggleShuffle() {
    const shuffle = !get().shuffle
    const { queue, index, originalQueue } = get()
    const current = queue[index]
    if (shuffle) {
      const rest = shuffleArray(queue.filter((_, i) => i !== index))
      set({ shuffle, queue: current ? [current, ...rest] : rest, index: current ? 0 : 0 })
    } else {
      const restored = originalQueue.length ? originalQueue : queue
      const newIndex = current ? Math.max(0, restored.findIndex((t) => t.id === current.id)) : 0
      set({ shuffle, queue: restored, index: newIndex })
    }
  },

  async startWave(seedTrackId) {
    const ui = useUiStore.getState()
    ui.setWaveLoading(true)
    try {
      const tracks = await api.buildWave(seedTrackId, 60, ui.discovery)
      await get().playQueue(tracks, 0, "wave")
      ui.toast("Волна запущена 🌊", "success")
    } catch (e) {
      ui.toast((e as Error).message, "error")
    } finally {
      ui.setWaveLoading(false)
    }
  },

  setSleepTimer(minutes) {
    set({ sleepTimerAt: minutes ? Date.now() + minutes * 60_000 : null })
  },

  _bootstrap() {
    if (bootstrapped) return
    bootstrapped = true

    engine.on("time", (currentMs, durationMs) => {
      const state = get()
      set({ positionMs: currentMs, durationMs: durationMs || state.current?.duration || 0 })

      // sleep timer
      if (state.sleepTimerAt && Date.now() >= state.sleepTimerAt) {
        engine.pause()
        set({ sleepTimerAt: null })
        useUiStore.getState().toast("Таймер сна: воспроизведение остановлено", "info")
      }
    })
    engine.on("playing", (playing) => set({ playing }))
    engine.on("loading", (loading) => set({ loading }))
    engine.on("ended", () => void get().next(true))
    engine.on("error", (message) => {
      useUiStore.getState().toast(message, "error")
      void get().next(true)
    })

    // счётчик реально прослушанного времени
    setInterval(() => {
      if (get().playing) set({ listenedSeconds: get().listenedSeconds + 1 })
    }, 1000)
  },
}))

async function loadCurrent(
  set: (partial: Partial<PlayerState>) => void,
  get: () => PlayerState,
) {
  const { queue, index } = get()
  const track = queue[index]
  if (!track) return
  set({ current: track, loading: true, positionMs: 0, listenedSeconds: 0 })
  try {
    const stream = await api.streamUrl(track.id)
    await engine.load(stream, true)
  } catch (e) {
    useUiStore.getState().toast(`${track.title}: ${(e as Error).message}`, "error")
    set({ loading: false })
    // переходим к следующему, если трек недоступен
    if (index + 1 < queue.length) {
      set({ index: index + 1 })
      await loadCurrent(set, get)
    }
  }
}

/** Сохраняет прослушивание и начисляет XP. */
async function flushPlay(get: () => PlayerState, set: (p: Partial<PlayerState>) => void) {
  const { current, listenedSeconds, source } = get()
  if (!current || listenedSeconds < 20) return
  try {
    const res = await api.recordPlay(current, listenedSeconds, source)
    useProfileStore.getState().setProfile(res.profile)
    res.unlocked.forEach((a) =>
      useUiStore.getState().toast(`${a.icon} Ачивка: ${a.name} (+${a.xp} XP)`, "success"),
    )
  } catch {
    /* тихо игнорируем */
  }
  set({ listenedSeconds: 0 })
}

/** Догрузка «Волны», чтобы очередь никогда не заканчивалась. */
async function extendWave(
  set: (p: Partial<PlayerState>) => void,
  get: () => PlayerState,
) {
  if (extendingWave) return
  extendingWave = true
  try {
    const seed = get().current?.id
    const more = await api.buildWave(seed, 40, useUiStore.getState().discovery)
    set({ queue: uniqueById([...get().queue, ...more]) })
  } catch {
    /* ignore */
  } finally {
    extendingWave = false
  }
}
