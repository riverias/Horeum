import { useEffect, useMemo, useState } from "react"
import { api } from "@/lib/api"
import type { Lyrics, Track } from "@/lib/types"

/** Загрузка текста песни (LRCLIB) + вычисление активной строки. */
export function useLyrics(track: Track | null, positionMs: number) {
  const [lyrics, setLyrics] = useState<Lyrics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLyrics(null)
    setError(null)
    if (!track) return

    setLoading(true)
    api
      .lyrics(track)
      .then((l) => !cancelled && setLyrics(l))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [track?.id])

  const activeIndex = useMemo(() => {
    if (!lyrics?.synced.length) return -1
    const t = positionMs / 1000
    let idx = -1
    for (let i = 0; i < lyrics.synced.length; i++) {
      if (lyrics.synced[i].time <= t) idx = i
      else break
    }
    return idx
  }, [lyrics, positionMs])

  const reload = async () => {
    if (!track) return
    setLoading(true)
    try {
      setLyrics(await api.lyrics(track, true))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return { lyrics, loading, error, activeIndex, reload }
}
