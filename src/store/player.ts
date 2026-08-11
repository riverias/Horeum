import { create } from "zustand"
import { engine } from "@/audio/engine"
import { api } from "@/lib/api"
import { apix, isYouTube } from "@/lib/apiExt"
import { shuffleArray, uniqueById } from "@/lib/utils"
import type { PlaySource, RepeatMode, StreamInfo, Track } from "@/lib/types"
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
  /** Длительность кроссфейда в мс (0 — выключен). */
  crossfadeMs: number
  gapless: boolean

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
  setCrossfade: (ms: number) => void
  setGapless: (on: boolean) => void
  downloadTrack: (track?: Track | null) => Promise<void>
  restoreSession: () => Promise<void>
  _bootstrap: () => void
}

let bootstrapped = false
let extendingWave = false
let sessionTimer: ReturnType<typeof setTimeout> | null = null
/** Номер последнего запроса трека: поздние ответы старых загрузок отбрасываем. */
let loadSeq = 0
/** Предзагруженные ссылки на потоки (гэплесс). */
const preloaded = new Map<number, { stream: StreamInfo; at: number }>()
let preloadingId: number | null = null
let crossfading = false

/** Ссылка на поток живёт недолго — считаем свежей 5 минут. */
const PRELOAD_TTL = 5 * 60_000

/** Треки YouTube приходят с отрицательным id и не имеют transcodings SoundCloud. */
function playable(t: Track): boolean {
  return Boolean(t.has_transcodings) || isYouTube(t.id)
}

/** Ссылка на поток: SoundCloud или YouTube — зависит от источника трека. */
async function streamFor(track: Track): Promise<StreamInfo> {
  const cached = preloaded.get(track.id)
  if (cached && Date.now() - cached.at < PRELOAD_TTL) {
    preloaded.delete(track.id)
    return cached.stream
  }
  return isYouTube(track.id)
    ? ((await apix.ytStreamUrl(track.id)) as StreamInfo)
    : await api.streamUrl(track.id)
}

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
  crossfadeMs: 0,
  gapless: true,

  async playQueue(tracks, startIndex = 0, source = "library") {
    const clean = uniqueById(tracks.filter(playable))
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
    saveSession(get)
  },

  removeFromQueue(i) {
    const { queue, index } = get()
    if (i === index) return
    set({
      queue: queue.filter((_, idx) => idx !== i),
      index: i < index ? index - 1 : index,
    })
    saveSession(get)
  },

  toggle() {
    engine.toggle()
  },

  async next(auto = false) {
    const { queue, index, repeat, waveMode } = get()
    await flushPlay(get, set)

    if (auto && repeat === "one") {
      engine.seek(0)
      engine.resetFade()
      crossfading = false
      void engine.play()
      return
    }

    let nextIndex = index + 1
    if (nextIndex >= queue.length) {
      if (waveMode) {
        await extendWave(set, get)
        nextIndex = get().index + 1
        if (nextIndex >= get().queue.length) {
          crossfading = false
          engine.resetFade()
          return
        }
      } else if (repeat === "all") {
        nextIndex = 0
      } else {
        set({ playing: false })
        engine.pause()
        engine.resetFade()
        crossfading = false
        return
      }
    }
    set({ index: nextIndex })
    await loadCurrent(set, get, true, 0, get().crossfadeMs)
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
    void api.setSetting("repeat", repeat).catch(() => {})
  },

  toggleShuffle() {
    const shuffle = !get().shuffle
    const { queue, index, originalQueue } = get()
    const current = queue[index]
    if (shuffle) {
      const rest = shuffleArray(queue.filter((_, i) => i !== index))
      set({ shuffle, queue: current ? [current, ...rest] : rest, index: 0 })
    } else {
      const restored = originalQueue.length ? originalQueue : queue
      const newIndex = current ? Math.max(0, restored.findIndex((t) => t.id === current.id)) : 0
      set({ shuffle, queue: restored, index: newIndex })
    }
    void api.setSetting("shuffle", shuffle).catch(() => {})
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

  /** Кроссфейд: 0–12 секунд. */
  setCrossfade(ms) {
    const value = Math.max(0, Math.min(12_000, Math.round(ms)))
    set({ crossfadeMs: value })
    if (value === 0) engine.resetFade()
    void api.setSetting("crossfade_ms", value).catch(() => {})
  },

  setGapless(on) {
    set({ gapless: on })
    if (!on) engine.cancelPrefetch()
    void api.setSetting("gapless", on).catch(() => {})
  },

  /** Скачивание трека в папку загрузок (MP3/M4A из потока). */
  async downloadTrack(track) {
    const ui = useUiStore.getState()
    const t = track ?? get().current
    if (!t) return
    try {
      ui.toast(`Скачиваю: ${t.title}`, "info")
      const stream = isYouTube(t.id)
        ? ((await apix.ytStreamUrl(t.id)) as StreamInfo)
        : await api.streamUrl(t.id)
      const dir = useUiStore.getState().downloadDir || null
      await apix.downloadTrack(t, stream, dir)
    } catch (e) {
      ui.toast(`Загрузка: ${(e as Error).message}`, "error")
    }
  },

  /** Возвращает очередь и позицию после перезапуска приложения. */
  async restoreSession() {
    try {
      const settings = await api.getSettings()
      const cf = Number(settings.crossfade_ms)
      if (Number.isFinite(cf)) set({ crossfadeMs: Math.max(0, Math.min(12_000, cf)) })
      if (typeof settings.gapless === "boolean") set({ gapless: settings.gapless })

      const raw = settings.session
      const data = typeof raw === "string" ? JSON.parse(raw) : raw
      if (!data || !Array.isArray(data.queue) || !data.queue.length) return
      const queue: Track[] = data.queue
      const index = Math.min(Math.max(0, Number(data.index) || 0), queue.length - 1)
      set({
        queue,
        originalQueue: queue,
        index,
        current: queue[index] ?? null,
        source: (data.source as PlaySource) ?? "library",
        waveMode: Boolean(data.waveMode),
        positionMs: Number(data.positionMs) || 0,
        durationMs: queue[index]?.duration ?? 0,
      })
      await loadCurrent(set, get, false, Number(data.positionMs) || 0)
    } catch {
      /* нечего восстанавливать */
    }
  },

  _bootstrap() {
    if (bootstrapped) return
    bootstrapped = true

    engine.on("time", (currentMs, durationMs) => {
      const state = get()
      const total = durationMs || state.current?.duration || 0
      set({ positionMs: currentMs, durationMs: total })

      const remaining = total - currentMs

      // гэплесс: заранее готовим следующий трек
      if (state.gapless && total > 0 && remaining < 45_000) {
        void preloadNext(get)
      }

      // кроссфейд на стыке треков
      if (
        state.crossfadeMs > 0 &&
        state.playing &&
        total > state.crossfadeMs + 5_000 &&
        remaining > 0 &&
        remaining <= state.crossfadeMs &&
        !crossfading &&
        state.repeat !== "one"
      ) {
        crossfading = true
        void engine.fadeOut(Math.min(state.crossfadeMs, remaining)).then(async () => {
          await get().next(true)
          crossfading = false
        })
      }

      // sleep timer
      if (state.sleepTimerAt && Date.now() >= state.sleepTimerAt) {
        engine.pause()
        set({ sleepTimerAt: null })
        useUiStore.getState().toast("Таймер сна: воспроизведение остановлено", "info")
      }
    })
    engine.on("playing", (playing) => set({ playing }))
    engine.on("loading", (loading) => set({ loading }))
    engine.on("ended", () => {
      if (crossfading) return
      void get().next(true)
    })
    engine.on("error", (message) => {
      useUiStore.getState().toast(message, "error")
      void get().next(true)
    })

    // счётчик реально прослушанного времени
    setInterval(() => {
      if (get().playing) set({ listenedSeconds: get().listenedSeconds + 1 })
    }, 1000)

    // периодически сохраняем сессию, чтобы всё вернулось после выхода
    setInterval(() => {
      if (get().current) saveSession(get, true)
    }, 15_000)
    window.addEventListener("beforeunload", () => saveSession(get, true))
  },
}))

/** Готовит ссылку на поток следующего трека и прогревает кэш. */
async function preloadNext(get: () => PlayerState) {
  const { queue, index } = get()
  const nextTrack = queue[index + 1]
  if (!nextTrack) return
  const cached = preloaded.get(nextTrack.id)
  if (cached && Date.now() - cached.at < PRELOAD_TTL) return
  if (preloadingId === nextTrack.id) return
  preloadingId = nextTrack.id
  try {
    const stream = isYouTube(nextTrack.id)
      ? ((await apix.ytStreamUrl(nextTrack.id)) as StreamInfo)
      : await api.streamUrl(nextTrack.id)
    preloaded.set(nextTrack.id, { stream, at: Date.now() })
    engine.prefetch(stream)
  } catch {
    /* предзагрузка необязательна */
  } finally {
    if (preloadingId === nextTrack.id) preloadingId = null
  }
}

async function loadCurrent(
  set: (partial: Partial<PlayerState>) => void,
  get: () => PlayerState,
  autoplay = true,
  seekMs = 0,
  fadeInMs = 0,
) {
  const { queue, index } = get()
  const track = queue[index]
  if (!track) return
  const seq = ++loadSeq
  set({ current: track, loading: true, positionMs: seekMs, listenedSeconds: 0 })
  try {
    const stream = await streamFor(track)
    if (seq !== loadSeq) return
    await engine.load(stream, autoplay, fadeInMs)
    if (seq !== loadSeq) return
    if (seekMs > 0) engine.seek(seekMs)
    if (fadeInMs === 0) engine.resetFade()
    saveSession(get, true)
    if (get().gapless) void preloadNext(get)
  } catch (e) {
    if (seq !== loadSeq) return
    useUiStore.getState().toast(`${track.title}: ${(e as Error).message}`, "error")
    set({ loading: false })
    if (autoplay && index + 1 < queue.length) {
      set({ index: index + 1 })
      await loadCurrent(set, get)
    }
  }
}

/** Сохраняет очередь/позицию в настройки (с дебаунсом). */
function saveSession(get: () => PlayerState, immediate = false) {
  const write = () => {
    const s = get()
    if (!s.current) return
    const payload = {
      queue: s.queue.slice(0, 200),
      index: s.index,
      positionMs: s.positionMs,
      source: s.source,
      waveMode: s.waveMode,
    }
    void api.setSetting("session", JSON.stringify(payload)).catch(() => {})
  }
  if (immediate) {
    write()
    return
  }
  if (sessionTimer) clearTimeout(sessionTimer)
  sessionTimer = setTimeout(write, 1000)
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

/** Догрузка «Моей волны», чтобы очередь никогда не заканчивалась. */
async function extendWave(
  set: (p: Partial<PlayerState>) => void,
  get: () => PlayerState,
) {
  if (extendingWave) return
  extendingWave = true
  try {
    const current = get().current
    const seed = current?.id
    let more: Track[] = []
    if (current && isYouTube(current.id)) {
      more = (await apix.ytRelated(current.id, 30)) as Track[]
    } else {
      more = await api.buildWave(seed, 40, useUiStore.getState().discovery)
    }
    const known = new Set(get().queue.map((t) => t.id))
    const fresh = more.filter((t) => !known.has(t.id))
    set({ queue: uniqueById([...get().queue, ...fresh]) })
  } catch {
    /* ignore */
  } finally {
    extendingWave = false
  }
}
