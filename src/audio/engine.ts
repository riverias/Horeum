import Hls from "hls.js"
import type { StreamInfo } from "@/lib/types"

export const EQ_BANDS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

export const EQ_PRESETS: Record<string, number[]> = {
  "Ровно": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  "Басс": [7, 6, 5, 3, 1, 0, 0, 0, 0, 0],
  "Глубокий": [6, 5, 3, 1, -1, -1, 1, 3, 4, 4],
  "Вокал": [-3, -2, 0, 2, 4, 5, 4, 2, 0, -1],
  "Электроника": [5, 4, 1, 0, -2, 2, 1, 2, 5, 6],
  "Рок": [5, 4, 3, 1, -1, -1, 2, 3, 4, 4],
  "Классика": [4, 3, 2, 1, -1, -1, 0, 2, 3, 4],
  "Ночь": [-2, -1, 0, 1, 2, 2, 1, 0, -1, -2],
}

type EngineEvents = {
  time: (currentMs: number, durationMs: number) => void
  ended: () => void
  error: (message: string) => void
  loading: (loading: boolean) => void
  playing: (playing: boolean) => void
}

/** Сообщения браузера про прерванный play() — это не ошибка, а гонка загрузок. */
function isBenignPlayError(e: unknown): boolean {
  const err = e as { name?: string; message?: string }
  const msg = String(err?.message ?? "")
  return (
    err?.name === "AbortError" ||
    /interrupted by a new load request/i.test(msg) ||
    /interrupted by a call to pause/i.test(msg) ||
    /request was interrupted/i.test(msg)
  )
}

/**
 * Аудиодвижок Horeum.
 *
 * HTMLAudioElement → MediaElementSource → [10x BiquadFilter] → Gain → Analyser → Destination
 * HLS-потоки прокидываются через hls.js.
 *
 * Загрузки пронумерованы (`loadSeq`): если пока грузился трек A пользователь включил B,
 * старый play() тихо отменяется. Громкость разделена на базовую (пользовательскую)
 * и множитель фейда, чтобы кроссфейд не сбивал настройки громкости.
 */
export class AudioEngine {
  readonly audio: HTMLAudioElement
  private ctx: AudioContext | null = null
  private source: MediaElementAudioSourceNode | null = null
  private filters: BiquadFilterNode[] = []
  private gain: GainNode | null = null
  private analyser: AnalyserNode | null = null
  private hls: Hls | null = null
  private loadSeq = 0
  private pendingPlay: Promise<void> | null = null
  private baseVolume = 0.8
  private fadeFactor = 1
  private fadeTimer: ReturnType<typeof setInterval> | null = null
  private prefetchAbort: AbortController | null = null
  private listeners: { [K in keyof EngineEvents]: Set<EngineEvents[K]> } = {
    time: new Set(),
    ended: new Set(),
    error: new Set(),
    loading: new Set(),
    playing: new Set(),
  }

  constructor() {
    this.audio = new Audio()
    this.audio.preload = "auto"
    this.audio.crossOrigin = "anonymous"
    this.audio.volume = 0.8

    this.audio.addEventListener("timeupdate", () =>
      this.emit("time", this.audio.currentTime * 1000, (this.audio.duration || 0) * 1000),
    )
    this.audio.addEventListener("ended", () => this.emit("ended"))
    this.audio.addEventListener("waiting", () => this.emit("loading", true))
    this.audio.addEventListener("canplay", () => this.emit("loading", false))
    this.audio.addEventListener("playing", () => {
      this.emit("loading", false)
      this.emit("playing", true)
    })
    this.audio.addEventListener("pause", () => this.emit("playing", false))
    this.audio.addEventListener("error", () => {
      const code = this.audio.error?.code
      if (!this.audio.currentSrc || code === MediaError.MEDIA_ERR_ABORTED) return
      this.emit("error", "Не удалось воспроизвести трек")
    })
  }

  // ------------------------------------------------------------- events
  on<K extends keyof EngineEvents>(event: K, cb: EngineEvents[K]): () => void {
    this.listeners[event].add(cb)
    return () => this.listeners[event].delete(cb)
  }

  private emit<K extends keyof EngineEvents>(event: K, ...args: Parameters<EngineEvents[K]>) {
    this.listeners[event].forEach((cb) => (cb as (...a: unknown[]) => void)(...args))
  }

  // -------------------------------------------------------- audio graph
  private ensureGraph() {
    if (this.ctx) return
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      this.ctx = new Ctx()
      this.source = this.ctx.createMediaElementSource(this.audio)
      this.filters = EQ_BANDS.map((freq, i) => {
        const f = this.ctx!.createBiquadFilter()
        f.type = i === 0 ? "lowshelf" : i === EQ_BANDS.length - 1 ? "highshelf" : "peaking"
        f.frequency.value = freq
        f.Q.value = 1
        f.gain.value = 0
        return f
      })
      this.gain = this.ctx.createGain()
      this.analyser = this.ctx.createAnalyser()
      this.analyser.fftSize = 512
      this.analyser.smoothingTimeConstant = 0.82

      let node: AudioNode = this.source
      this.filters.forEach((f) => {
        node.connect(f)
        node = f
      })
      node.connect(this.gain)
      this.gain.connect(this.analyser)
      this.analyser.connect(this.ctx.destination)
    } catch (e) {
      this.ctx = null
      this.analyser = null
      console.warn("[horeum] WebAudio graph disabled:", e)
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser
  }

  setEqBand(index: number, gainDb: number) {
    this.ensureGraph()
    const f = this.filters[index]
    if (f) f.gain.value = gainDb
  }

  setEqPreset(values: number[]) {
    values.forEach((v, i) => this.setEqBand(i, v))
  }

  get generation(): number {
    return this.loadSeq
  }

  // ------------------------------------------------------------ playback
  async load(stream: StreamInfo, autoplay = true, fadeInMs = 0) {
    const seq = ++this.loadSeq
    this.stopFade()

    try {
      this.audio.pause()
    } catch {
      /* ignore */
    }
    if (this.pendingPlay) {
      await this.pendingPlay.catch(() => {})
      if (seq !== this.loadSeq) return
    }

    this.detachHls()
    this.emit("loading", true)

    // если будет фейд-ин — начинаем с тишины
    this.fadeFactor = fadeInMs > 0 ? 0 : 1
    this.applyVolume()

    const isHls = stream.protocol === "hls" || stream.url.includes(".m3u8")
    if (isHls && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false, maxBufferLength: 60 })
      this.hls = hls
      hls.loadSource(stream.url)
      hls.attachMedia(this.audio)
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal || seq !== this.loadSeq) return
        this.emit("error", `HLS: ${data.details}`)
      })
    } else {
      this.audio.src = stream.url
      this.audio.load()
    }

    if (seq !== this.loadSeq) return
    if (autoplay) {
      await this.play(seq)
      if (seq === this.loadSeq && fadeInMs > 0) this.fadeTo(1, fadeInMs)
    }
  }

  async play(seq?: number) {
    if (seq !== undefined && seq !== this.loadSeq) return
    this.ensureGraph()
    if (this.ctx?.state === "suspended") {
      await this.ctx.resume().catch(() => {})
    }
    if (seq !== undefined && seq !== this.loadSeq) return

    try {
      const p = this.audio.play()
      if (p) {
        this.pendingPlay = p
        await p
      }
    } catch (e) {
      if (isBenignPlayError(e)) return
      if ((e as { name?: string })?.name === "NotAllowedError") {
        this.emit("error", "Автозапуск заблокирован — нажми Play")
        return
      }
      this.emit("error", (e as Error).message)
    } finally {
      this.pendingPlay = null
    }
  }

  pause() {
    this.audio.pause()
  }

  toggle() {
    if (this.audio.paused) void this.play()
    else this.pause()
  }

  seek(ms: number) {
    if (Number.isFinite(this.audio.duration)) {
      this.audio.currentTime = Math.max(0, Math.min(ms / 1000, this.audio.duration))
    }
  }

  // ------------------------------------------------------------- volume
  private applyVolume() {
    this.audio.volume = Math.max(0, Math.min(1, this.baseVolume * this.fadeFactor))
  }

  setVolume(value: number) {
    this.baseVolume = Math.max(0, Math.min(1, value))
    this.applyVolume()
  }

  setMuted(muted: boolean) {
    this.audio.muted = muted
  }

  setRate(rate: number) {
    this.audio.playbackRate = Math.max(0.5, Math.min(2.5, rate))
  }

  private stopFade() {
    if (this.fadeTimer) {
      clearInterval(this.fadeTimer)
      this.fadeTimer = null
    }
  }

  /** Плавно ведёт множитель громкости к цели (0…1) за `ms`. */
  fadeTo(target: number, ms: number): Promise<void> {
    this.stopFade()
    const clamped = Math.max(0, Math.min(1, target))
    if (ms <= 0) {
      this.fadeFactor = clamped
      this.applyVolume()
      return Promise.resolve()
    }
    const from = this.fadeFactor
    const started = performance.now()
    return new Promise((resolve) => {
      this.fadeTimer = setInterval(() => {
        const t = Math.min(1, (performance.now() - started) / ms)
        this.fadeFactor = from + (clamped - from) * t
        this.applyVolume()
        if (t >= 1) {
          this.stopFade()
          resolve()
        }
      }, 40)
    })
  }

  /** Затухание перед сменой трека. */
  async fadeOut(ms: number) {
    await this.fadeTo(0, ms)
  }

  /** Появление после смены трека. */
  async fadeIn(ms: number) {
    await this.fadeTo(1, ms)
  }

  /** Сброс фейда в полную громкость. */
  resetFade() {
    this.stopFade()
    this.fadeFactor = 1
    this.applyVolume()
  }

  /**
   * «Гэплесс»-предзагрузка: заранее тянем первые мегабайты следующего трека,
   * чтобы старт был мгновенным и без паузы между треками.
   */
  prefetch(stream: StreamInfo) {
    const isHls = stream.protocol === "hls" || stream.url.includes(".m3u8")
    this.prefetchAbort?.abort()
    const controller = new AbortController()
    this.prefetchAbort = controller
    const headers: Record<string, string> = isHls ? {} : { Range: "bytes=0-1572863" }
    void fetch(stream.url, { signal: controller.signal, headers })
      .then((r) => r.arrayBuffer())
      .catch(() => {
        /* предзагрузка необязательна */
      })
  }

  cancelPrefetch() {
    this.prefetchAbort?.abort()
    this.prefetchAbort = null
  }

  private detachHls() {
    if (this.hls) {
      try {
        this.hls.destroy()
      } catch {
        /* ignore */
      }
      this.hls = null
    }
  }

  destroy() {
    this.loadSeq++
    this.stopFade()
    this.cancelPrefetch()
    this.detachHls()
    this.audio.pause()
    this.audio.removeAttribute("src")
    void this.ctx?.close()
  }
}

export const engine = new AudioEngine()
