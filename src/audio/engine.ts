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
 * HLS-потоки прокидываются через hls.js (местами SoundCloud отдаёт только m3u8).
 *
 * Все загрузки пронумерованы (`loadSeq`): если пока грузился трек A пользователь
 * включил трек B, старый play() просто тихо отменяется без красного тоста.
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
      // пустой src или отмена загрузки — это наша же смена трека, молчим
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
      // CORS / недоступный WebAudio — играем без эффектов
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

  /** Номер последней загрузки — сторонний код может проверить актуальность. */
  get generation(): number {
    return this.loadSeq
  }

  // ------------------------------------------------------------ playback
  async load(stream: StreamInfo, autoplay = true) {
    const seq = ++this.loadSeq

    // гасим текущее воспроизведение ДО подмены src, иначе браузер ругается
    // «The play() request was interrupted by a new load request»
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
    if (autoplay) await this.play(seq)
  }

  /**
   * Запуск воспроизведения. Если передан `seq`, вызов отменяется,
   * когда успела начаться более свежая загрузка.
   */
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

  setVolume(value: number) {
    this.audio.volume = Math.max(0, Math.min(1, value))
  }

  setMuted(muted: boolean) {
    this.audio.muted = muted
  }

  setRate(rate: number) {
    this.audio.playbackRate = Math.max(0.5, Math.min(2.5, rate))
  }

  /** Плавное затухание перед сменой трека (простой кроссфейд). */
  async fadeOut(ms: number) {
    if (ms <= 0) return
    const start = this.audio.volume
    const steps = 16
    for (let i = 1; i <= steps; i++) {
      this.audio.volume = start * (1 - i / steps)
      await new Promise((r) => setTimeout(r, ms / steps))
    }
    this.audio.volume = start
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
    this.detachHls()
    this.audio.pause()
    this.audio.removeAttribute("src")
    void this.ctx?.close()
  }
}

export const engine = new AudioEngine()
