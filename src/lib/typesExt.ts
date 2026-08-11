// Расширенные типы для медиа, загрузок, импорта и внешних источников.

export type MediaKind = "image" | "gif" | "video"
export type ImageSource = "pinterest" | "unsplash" | "web" | "gif"

export interface MediaItem {
	id: string
	name: string
	kind: MediaKind | string
	url: string
	path: string
	size: number
	added_at?: string
}

export interface ImageHit {
	id: string
	url: string
	thumb: string
	width?: number
	height?: number
	title?: string
	source?: string
	link?: string
}

export type DownloadStatus = "active" | "done" | "error" | "missing" | string

export interface DownloadItem {
	id: string
	track_id: number
	title: string
	artist: string
	artwork?: string | null
	duration?: number
	name: string
	path: string
	size: number
	status: DownloadStatus
	error?: string | null
	created_at?: string
}

export interface DownloadProgress {
	id: string
	received?: number
	total?: number
	percent?: number
	status?: DownloadStatus
}

export interface BridgeTrack {
	artist: string
	title: string
	duration?: number
	cover?: string | null
}

export interface BridgeList {
	name: string
	source: string
	cover?: string | null
	tracks: BridgeTrack[]
}

export interface OpenedFile {
	name: string
	path: string
	contents: string
}

export type LoginBrowser =
	| "brave"
	| "chrome"
	| "edge"
	| "firefox"
	| "yandex"
	| "opera"
	| "default"
