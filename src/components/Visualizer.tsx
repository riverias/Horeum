import { useEffect, useRef } from "react"
import { engine } from "@/audio/engine"
import { useUiStore } from "@/store/ui"

type Props = { className?: string; mode?: "bars" | "wave" | "radial"; height?: number }

/** Canvas-визуализатор на AnalyserNode: столбики / осциллограф / радиальный круг. */
export function Visualizer({ className, mode, height = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const globalMode = useUiStore((s) => s.visualizer)
  const active = mode ?? (globalMode === "off" ? null : globalMode)

  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      const analyser = engine.getAnalyser()
      const dpr = window.devicePixelRatio || 1
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      if (!analyser) return

      const accent =
        getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
        "#8b5cf6"

      if (active === "wave") {
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)
        ctx.lineWidth = 2
        ctx.strokeStyle = accent
        ctx.shadowBlur = 12
        ctx.shadowColor = accent
        ctx.beginPath()
        for (let i = 0; i < data.length; i++) {
          const x = (i / data.length) * w
          const y = (data[i] / 255) * h
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
        ctx.stroke()
        ctx.shadowBlur = 0
        return
      }

      const data = new Uint8Array(analyser.frequencyBinCount)
      analyser.getByteFrequencyData(data)

      if (active === "radial") {
        const cx = w / 2
        const cy = h / 2
        const radius = Math.min(w, h) * 0.24
        const bars = 96
        ctx.shadowBlur = 10
        ctx.shadowColor = accent
        for (let i = 0; i < bars; i++) {
          const v = data[Math.floor((i / bars) * data.length * 0.7)] / 255
          const angle = (i / bars) * Math.PI * 2 - Math.PI / 2
          const len = radius * 0.25 + v * radius * 1.15
          ctx.strokeStyle = `rgba(255,255,255,${0.25 + v * 0.75})`
          ctx.lineWidth = 2.5
          ctx.beginPath()
          ctx.moveTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius)
          ctx.lineTo(cx + Math.cos(angle) * (radius + len), cy + Math.sin(angle) * (radius + len))
          ctx.stroke()
        }
        ctx.shadowBlur = 0
        return
      }

      // bars
      const bars = 64
      const gap = 2
      const bw = (w - gap * (bars - 1)) / bars
      for (let i = 0; i < bars; i++) {
        const v = data[Math.floor((i / bars) * data.length * 0.75)] / 255
        const bh = Math.max(2, v * h)
        const grad = ctx.createLinearGradient(0, h, 0, h - bh)
        grad.addColorStop(0, accent)
        grad.addColorStop(1, "rgba(255,255,255,0.92)")
        ctx.fillStyle = grad
        const x = i * (bw + gap)
        const r = Math.min(bw / 2, 3)
        ctx.beginPath()
        ctx.roundRect(x, h - bh, bw, bh, [r, r, 0, 0])
        ctx.fill()
      }
    }

    draw()
    return () => cancelAnimationFrame(raf)
  }, [active])

  if (!active) return null
  return <canvas ref={canvasRef} className={className} style={{ height, width: "100%" }} />
}
