import { invoke } from "@tauri-apps/api/core"
import type {
  Achievement,
  GenreInfo,
  Lyrics,
  Mood,
  PlayResult,
  Playlist,
  Profile,
  ScPlaylist,
  ScUser,
  SearchBundle,
  SessionInfo,
  Stats,
  StreamInfo,
  Track,
  Unlockable,
} from "./types"

/** Тонкая обёртка над Tauri IPC с единообразными ошибками. */
async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    const message = typeof e === "string" ? e : (e as Error)?.message ?? "Неизвестная ошибка"
    throw new Error(message)
  }
}

export const api = {
  // system / session
  init: () => call<string>("sc_init"),
  session: () => call<SessionInfo>("sc_session"),
  login: (token: string) => call<ScUser>("sc_login", { token }),
  logout: () => call<void>("sc_logout"),
  genres: () => call<GenreInfo[]>("genres"),

  // discovery
  searchTracks: (query: string, limit = 50, offset = 0) =>
    call<Track[]>("search_tracks", { query, limit, offset }),
  searchAll: (query: string) => call<SearchBundle>("search_all", { query }),
  autocomplete: (query: string) => call<string[]>("autocomplete", { query }),
  charts: (kind: "top" | "trending" = "top", genre = "all-music", limit = 50) =>
    call<Track[]>("charts", { kind, genre, limit }),
  related: (trackId: number) => call<Track[]>("related_tracks", { trackId }),
  streamUrl: (trackId: number) => call<StreamInfo>("stream_url", { trackId }),
  scUser: (userId: number) => call<ScUser>("sc_user", { userId }),
  scUserTracks: (userId: number, limit = 50) =>
    call<Track[]>("sc_user_tracks", { userId, limit }),
  scPlaylist: (playlistId: number) => call<ScPlaylist>("sc_playlist", { playlistId }),
  resolveLink: (url: string) => call<Track[]>("resolve_link", { url }),

  // account
  myLikes: (limit = 200) => call<Track[]>("my_likes", { limit }),
  myScPlaylists: () => call<ScPlaylist[]>("my_sc_playlists"),
  myStream: (limit = 60) => call<Track[]>("my_stream", { limit }),
  syncScLikes: () => call<number>("sync_sc_likes"),

  // library
  toggleLike: (track: Track, remote = false) =>
    call<boolean>("toggle_like", { track, remote }),
  likedTracks: (limit = 500, offset = 0) =>
    call<Track[]>("liked_tracks", { limit, offset }),
  likedIds: () => call<number[]>("liked_ids"),
  history: (limit = 200) => call<Track[]>("history", { limit }),
  clearHistory: () => call<void>("clear_history"),
  blockTrack: (trackId: number) => call<void>("block_track", { trackId }),
  recordPlay: (track: Track, seconds: number, source = "library") =>
    call<PlayResult>("record_play", { track, seconds, source }),

  // playlists
  playlists: () => call<Playlist[]>("playlists"),
  playlist: (id: number) => call<Playlist>("playlist", { id }),
  createPlaylist: (name: string, description = "", color = "violet") =>
    call<Playlist>("create_playlist", { name, description, color }),
  updatePlaylist: (
    id: number,
    patch: {
      name?: string
      description?: string
      cover?: string
      color?: string
      pinned?: boolean
    },
  ) => call<Playlist>("update_playlist", { id, ...patch }),
  deletePlaylist: (id: number) => call<void>("delete_playlist", { id }),
  addToPlaylist: (id: number, tracks: Track[]) =>
    call<Playlist>("add_to_playlist", { id, tracks }),
  removeFromPlaylist: (id: number, trackId: number) =>
    call<Playlist>("remove_from_playlist", { id, trackId }),
  reorderPlaylist: (id: number, order: number[]) =>
    call<Playlist>("reorder_playlist", { id, order }),
  importScPlaylist: (url: string) => call<Playlist>("import_sc_playlist", { url }),

  // lyrics
  lyrics: (track: Track, force = false) =>
    call<Lyrics>("lyrics", {
      trackId: track.id,
      artist: track.artist,
      title: track.title,
      durationMs: track.duration,
      force,
    }),

  // wave / moods
  moods: () => call<Mood[]>("moods"),
  buildWave: (seedTrackId?: number, limit = 60, discovery = 0.55) =>
    call<Track[]>("build_wave", { seedTrackId, limit, discovery }),
  moodQueue: (moodId: string, limit = 60) =>
    call<Track[]>("mood_queue", { moodId, limit }),

  // profile
  profile: () => call<Profile>("profile"),
  updateProfile: (patch: Partial<Record<string, string>>) =>
    call<Profile>("update_profile", { patch }),
  cosmetics: () => call<Unlockable[]>("cosmetics"),
  achievements: () => call<Achievement[]>("achievements"),
  stats: () => call<Stats>("stats"),

  // settings
  getSettings: () => call<Record<string, unknown>>("get_settings"),
  setSetting: (key: string, value: unknown) => call<void>("set_setting", { key, value }),
}
