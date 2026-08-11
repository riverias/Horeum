import { create } from "zustand"
import { apix } from "@/lib/apiExt"
import type { MediaKind } from "@/lib/typesExt"

export interface AppearanceSnapshot {
	bgMode: "preset" | "media"
	bgMediaUrl: string
	bgMediaKind: MediaKind
	blur: number
	dim: number
	saturation: number
	scale: number
	grain: boolean
	vignette: boolean
	accent: string
	useCustomAccent: boolean
	iconAccent: boolean
	animations: boolean
	glass: number
	radius: number
	videoMuted: boolean
}

export const defaultAppearance: AppearanceSnapshot = {
	bgMode: "preset",
	bgMediaUrl: "",
	bgMediaKind: "image",
	blur: 0,
	dim: 35,
	saturation: 100,
	scale: 105,
	grain: false,
	vignette: true,
	accent: "#ff5500",
	useCustomAccent: false,
	iconAccent: false,
	animations: true,
	glass: 60,
	radius: 16,
	videoMuted: true,
}

interface AppearanceStore extends AppearanceSnapshot {
	loaded: boolean
	patch: (p: Partial<AppearanceSnapshot>) => void
	hydrate: (raw: unknown) => void
	reset: () => void
	snapshot: () => AppearanceSnapshot
}

export function hexToRgb(hex: string): [number, number, number] {
	const m = hex.replace("#", "").trim()
	const full =
		m.length === 3
			? m
					.split("")
					.map((c) => c + c)
					.join("")
			: m
	const n = parseInt(full.slice(0, 6) || "ff5500", 16)
	if (Number.isNaN(n)) return [255, 85, 0]
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persist(snap: AppearanceSnapshot) {
	if (saveTimer) clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		apix.setSetting("appearance", JSON.stringify(snap)).catch(() => {})
	}, 350)
}

export function applyAppearance(snap: AppearanceSnapshot) {
	const root = document.documentElement
	const [r, g, b] = hexToRgb(snap.accent)
	if (snap.useCustomAccent) {
		root.style.setProperty("--accent", snap.accent)
		root.style.setProperty("--accent-rgb", `${r}, ${g}, ${b}`)
		root.dataset.customAccent = "on"
	} else {
		root.dataset.customAccent = "off"
	}
	root.dataset.iconAccent = snap.iconAccent ? "on" : "off"
	root.dataset.animations = snap.animations ? "on" : "off"
	root.dataset.customBg = snap.bgMode === "media" && snap.bgMediaUrl ? "on" : "off"
	root.style.setProperty("--bg-blur", `${snap.blur}px`)
	root.style.setProperty("--bg-dim", String(snap.dim / 100))
	root.style.setProperty("--bg-sat", `${snap.saturation}%`)
	root.style.setProperty("--bg-scale", String(snap.scale / 100))
	root.style.setProperty("--glass-alpha", String(snap.glass / 100))
	root.style.setProperty("--radius-ui", `${snap.radius}px`)
}

export const useAppearanceStore = create<AppearanceStore>((set, get) => ({
	...defaultAppearance,
	loaded: false,

	snapshot: () => {
		const s = get()
		const out = {} as AppearanceSnapshot
		;(Object.keys(defaultAppearance) as Array<keyof AppearanceSnapshot>).forEach(
			(k) => {
				// @ts-expect-error index write
				out[k] = s[k]
			},
		)
		return out
	},

	patch: (p) => {
		set(p as Partial<AppearanceStore>)
		const snap = get().snapshot()
		applyAppearance(snap)
		persist(snap)
	},

	hydrate: (raw) => {
		let parsed: Partial<AppearanceSnapshot> = {}
		try {
			if (typeof raw === "string" && raw.trim().startsWith("{")) {
				parsed = JSON.parse(raw)
			} else if (raw && typeof raw === "object") {
				parsed = raw as Partial<AppearanceSnapshot>
			}
		} catch {
			parsed = {}
		}
		const merged = { ...defaultAppearance, ...parsed }
		set({ ...merged, loaded: true })
		applyAppearance(merged)
	},

	reset: () => {
		set({ ...defaultAppearance })
		applyAppearance(defaultAppearance)
		persist(defaultAppearance)
	},
}))
