export interface Track {
  id: number
  title: string
  artist: string
  artist_id: number
  artist_avatar: string | null
  /** ms */
  duration: number
  artwork: string | null
  permalink_url: string
  genre: string | null
  tags: string[]
  playback_count: number
  likes_count: number
  reposts_count: number
  comment_count: number
  created_at: string | null
  description: string | null
  waveform_url: string | null
  bpm: number | null
  streamable: boolean
  policy: string | null
  has_transcodings: boolean
}

export interface StreamInfo {
  url: string
  protocol: "progressive" | "hls" | string
  mime_type: string
  preset: string
  quality: string
}

export interface ScUser {
  id: number
  username: string
  avatar: string | null
  followers: number
  followings: number
  track_count: number
  city: string | null
  country: string | null
  description: string | null
  permalink_url: string
}

export interface ScPlaylist {
  id: number
  title: string
  artwork: string | null
  owner: string
  track_count: number
  permalink_url: string
  tracks: Track[]
}

export interface Playlist {
  id: number
  name: string
  description: string
  cover: string | null
  color: string
  pinned: boolean
  track_count: number
  duration: number
  created_at: string
  updated_at: string
  tracks: Track[]
}

export interface LyricLine {
  time: number
  text: string
}

export interface Lyrics {
  track_id: number
  synced: LyricLine[]
  plain: string | null
  source: string
  matched_artist: string | null
  matched_title: string | null
  instrumental: boolean
}

export interface Profile {
  display_name: string
  bio: string
  avatar: string | null
  banner: string | null
  xp: number
  level: number
  level_xp: number
  next_level_xp: number
  progress: number
  title: string
  background: string
  frame: string
  accent: string
  streak: number
  tracks_played: number
  seconds_listened: number
  created_at: string
}

export interface Unlockable {
  id: string
  name: string
  kind: "background" | "frame" | "accent"
  level: number
  value: string
  animated: boolean
}

export interface Achievement {
  code: string
  name: string
  description: string
  icon: string
  xp: number
  unlocked: boolean
  unlocked_at: string | null
  progress: number
}

export interface ArtistStat {
  artist: string
  artist_id: number
  avatar: string | null
  plays: number
  seconds: number
}

export interface GenreStat {
  genre: string
  plays: number
}

export interface DayStat {
  day: string
  minutes: number
}

export interface Stats {
  tracks_played: number
  unique_tracks: number
  unique_artists: number
  minutes_listened: number
  likes: number
  playlists: number
  streak: number
  top_artists: ArtistStat[]
  top_genres: GenreStat[]
  last_14_days: DayStat[]
}

export interface Mood {
  id: string
  name: string
  emoji: string
  gradient: string
  queries: string[]
  genres: string[]
  /** Короткое описание настроения (может отсутствовать). */
  description?: string
}

export interface SessionInfo {
  logged_in: boolean
  client_id_ready: boolean
  user: ScUser | null
}

export interface SearchBundle {
  tracks: Track[]
  playlists: ScPlaylist[]
  users: ScUser[]
}

export interface PlayResult {
  profile: Profile
  unlocked: Achievement[]
  xp_gained: number
}

export interface GenreInfo {
  id: string
  name: string
}

export type RepeatMode = "off" | "all" | "one"
export type PlaySource = "library" | "wave" | "mood" | "search" | "charts" | "playlist"

/** Виды отображения списка треков. */
export type TrackLayout = "rows" | "compact" | "table" | "grid" | "big" | "mini"

export type ViewId =
  | "home"
  | "search"
  | "wave"
  | "moods"
  | "charts"
  | "library"
  | "history"
  | "playlists"
  | "playlist"
  | "artist"
  | "profile"
  | "downloads"
  | "settings"

// Расширенные типы (медиа, загрузки, импорт) живут в отдельном файле.
export * from "./typesExt"
