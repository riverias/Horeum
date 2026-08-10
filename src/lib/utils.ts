import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** ms → m:ss / h:mm:ss */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "0:00"
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`
}

export function formatSeconds(sec: number): string {
  return formatDuration(sec * 1000)
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".0", "")}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".0", "")}K`
  return String(n)
}

export function formatListenTime(minutes: number): string {
  if (minutes < 60) return `${minutes} мин`
  const h = Math.floor(minutes / 60)
  if (h < 24) return `${h} ч ${minutes % 60} мин`
  return `${Math.floor(h / 24)} д ${h % 24} ч`
}

export function shuffleArray<T>(input: T[]): T[] {
  const arr = [...input]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export function uniqueById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>()
  return items.filter((i) => (seen.has(i.id) ? false : seen.add(i.id)))
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "")
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

export function artworkOf(track: { artwork: string | null }, size = 500): string {
  if (!track.artwork) return ""
  if (size <= 120) return track.artwork.replace("-t500x500", "-t120x120")
  return track.artwork
}

/** Извлечение доминантного цвета обложки для динамической темы. */
export async function dominantColor(url: string): Promise<[number, number, number] | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas")
        const size = 32
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext("2d")
        if (!ctx) return resolve(null)
        ctx.drawImage(img, 0, 0, size, size)
        const { data } = ctx.getImageData(0, 0, size, size)
        let r = 0
        let g = 0
        let b = 0
        let count = 0
        for (let i = 0; i < data.length; i += 4) {
          const [pr, pg, pb, pa] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
          if (pa < 200) continue
          const max = Math.max(pr, pg, pb)
          const min = Math.min(pr, pg, pb)
          if (max - min < 22) continue // пропускаем серое
          r += pr
          g += pg
          b += pb
          count++
        }
        if (!count) return resolve(null)
        resolve([Math.round(r / count), Math.round(g / count), Math.round(b / count)])
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
}
