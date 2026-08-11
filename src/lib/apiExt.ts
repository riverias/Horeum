import { invoke } from "@tauri-apps/api/core"
import type {
	BridgeList,
	DownloadItem,
	ImageHit,
	ImageSource,
	LoginBrowser,
	MediaItem,
	OpenedFile,
} from "@/lib/typesExt"

async function call<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
	return (await invoke(cmd, args ?? {})) as T
}

/**
 * Биндинги к расширенным Rust-командам (commands_ext.rs).
 * Всё это уже было в бэкенде, но фронт этим не пользовался.
 */
export const apix = {
	// ── локальный медиа-сервер ────────────────────────────────
	localBase: () => call<string>("local_base"),

	// ── медиатека (фоны: фото / гиф / видео) ──────────────────
	pickMedia: (kind: "image" | "video" | "any" = "any") =>
		call<MediaItem | null>("pick_media", { kind }),
	addMediaUrl: (url: string) => call<MediaItem>("add_media_url", { url }),
	mediaList: () => call<MediaItem[]>("media_list"),
	mediaRemove: (id: string) => call<void>("media_remove", { id }),
	imageSearch: (query: string, source: ImageSource = "pinterest", limit = 30) =>
		call<ImageHit[]>("image_search", { query, source, limit }),

	// ── загрузки ──────────────────────────────────────────────
	downloadTrack: (track: unknown, stream: unknown, dir?: string | null) =>
		call<DownloadItem>("download_track", { track, stream, dir: dir ?? null }),
	downloadsList: () => call<DownloadItem[]>("downloads_list"),
	downloadRemove: (id: string, deleteFile = false) =>
		call<void>("download_remove", { id, deleteFile }),
	downloadsDir: () => call<string>("downloads_dir"),
	pickFolder: () => call<string | null>("pick_folder"),
	revealPath: (path: string) => call<void>("reveal_path", { path }),

	// ── файлы (импорт / экспорт) ──────────────────────────────
	saveTextFile: (name: string, contents: string) =>
		call<string | null>("save_text_file", { name, contents }),
	openTextFile: () => call<OpenedFile | null>("open_text_file"),

	// ── YouTube ───────────────────────────────────────────────
	ytSearch: (query: string, limit = 30) =>
		call<any[]>("yt_search", { query, limit }),
	ytStreamUrl: (trackId: number) => call<any>("yt_stream_url", { trackId }),
	ytRelated: (trackId: number, limit = 25) =>
		call<any[]>("yt_related", { trackId, limit }),

	// ── мосты: Spotify / Яндекс.Музыка / Deezer / текст ───────
	importLink: (url: string) => call<BridgeList>("import_link", { url }),
	parseTrackList: (text: string) => call<BridgeList>("parse_track_list", { text }),

	// ── вход в SoundCloud ─────────────────────────────────────
	scLoginWindow: () => call<void>("sc_login_window"),
	closeLoginWindow: () => call<void>("close_login_window"),
	scLoginBrowser: (browser: LoginBrowser) =>
		call<string>("sc_login_browser", { browser }),

	// ── настройки (дублируем, чтобы модуль был самодостаточным)
	getSettings: () => call<Record<string, any>>("get_settings"),
	setSetting: (key: string, value: unknown) =>
		call<void>("set_setting", { key, value }),
}

export function isYouTube(id: number): boolean {
	return id < 0
}
