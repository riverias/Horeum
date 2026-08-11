import { useEffect, useState } from "react"
import { listen } from "@tauri-apps/api/event"
import { motion } from "framer-motion"
import {
	CheckCircle2,
	Download,
	FolderOpen,
	Loader2,
	RefreshCw,
	Trash2,
	TriangleAlert,
} from "lucide-react"
import { apix } from "@/lib/apiExt"
import type { DownloadItem, DownloadProgress } from "@/lib/typesExt"
import { useUiStore } from "@/store/ui"
import { ConfirmDialog } from "@/components/Dialog"

function formatSize(bytes: number): string {
	if (!bytes) return "—"
	const units = ["Б", "КБ", "МБ", "ГБ"]
	let value = bytes
	let i = 0
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024
		i++
	}
	return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}

export function DownloadsView() {
	const [items, setItems] = useState<DownloadItem[]>([])
	const [progress, setProgress] = useState<Record<string, number>>({})
	const [loading, setLoading] = useState(true)
	const [toDelete, setToDelete] = useState<DownloadItem | null>(null)
	const toast = useUiStore((s) => s.toast)
	const downloadDir = useUiStore((s) => s.downloadDir)
	const setDownloadDir = useUiStore((s) => s.setDownloadDir)

	const refresh = async () => {
		try {
			setItems(await apix.downloadsList())
		} catch (e) {
			toast((e as Error).message, "error")
		} finally {
			setLoading(false)
		}
	}

	useEffect(() => {
		void refresh()
		const unlisteners: Array<() => void> = []

		listen<DownloadProgress>("download:progress", (e) => {
			const p = e.payload
			const percent =
				typeof p.percent === "number"
					? p.percent
					: p.total
						? ((p.received ?? 0) / p.total) * 100
						: 0
			setProgress((prev) => ({ ...prev, [p.id]: Math.max(0, Math.min(100, percent)) }))
		})
			.then((un) => unlisteners.push(un))
			.catch(() => {})

		listen<DownloadItem>("download:done", (e) => {
			setProgress((prev) => {
				const next = { ...prev }
				delete next[e.payload.id]
				return next
			})
			void refresh()
			if (e.payload.status === "error") {
				toast(`Ошибка загрузки: ${e.payload.title}`, "error")
			} else {
				toast(`Скачано: ${e.payload.title} ✅`, "success")
			}
		})
			.then((un) => unlisteners.push(un))
			.catch(() => {})

		return () => unlisteners.forEach((un) => un())
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	const chooseFolder = async () => {
		try {
			const dir = await apix.pickFolder()
			if (dir) {
				setDownloadDir(dir)
				toast("Папка загрузок обновлена", "success")
			}
		} catch (e) {
			toast((e as Error).message, "error")
		}
	}

	return (
		<div className="stagger space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-bold">Загрузки</h1>
					<p className="mt-1 text-sm text-white/50">
						{downloadDir || "Папка по умолчанию"}
					</p>
				</div>
				<div className="flex gap-2">
					<button className="btn" onClick={() => void refresh()}>
						<RefreshCw size={16} /> Обновить
					</button>
					<button className="btn" onClick={() => void chooseFolder()}>
						<FolderOpen size={16} /> Папка
					</button>
					{downloadDir && (
						<button
							className="btn btn-accent"
							onClick={() => void apix.revealPath(downloadDir).catch(() => {})}
						>
							Открыть папку
						</button>
					)}
				</div>
			</div>

			{loading && <div className="skeleton h-24 rounded-2xl" />}

			{!loading && !items.length && (
				<div className="card flex flex-col items-center gap-2 p-10 text-center">
					<Download size={28} className="text-white/40" />
					<div className="text-lg font-semibold">Пока ничего не скачано</div>
					<div className="text-sm text-white/50">
						Нажмите правой кнопкой по треку → «Скачать», или кнопка загрузки в
						плеере.
					</div>
				</div>
			)}

			<div className="space-y-2">
				{items.map((item) => {
					const pct = progress[item.id]
					const active = item.status === "active" || pct !== undefined
					return (
						<motion.div
							key={item.id}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							className="card flex items-center gap-4 p-3"
						>
							{item.artwork ? (
								<img
									src={item.artwork}
									alt=""
									decoding="async"
									className="h-12 w-12 rounded-lg object-cover"
								/>
							) : (
								<div className="grid h-12 w-12 place-items-center rounded-lg bg-white/5">
									<Download size={16} />
								</div>
							)}

							<div className="min-w-0 flex-1">
								<div className="truncate font-medium">{item.title}</div>
								<div className="truncate text-xs text-white/50">
									{item.artist} · {formatSize(item.size)}
									{item.error ? ` · ${item.error}` : ""}
								</div>
								{active && (
									<div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
										<div
											className="h-full rounded-full bg-[var(--accent)] transition-all"
											style={{ width: `${pct ?? 5}%` }}
										/>
									</div>
								)}
							</div>

							<div className="flex items-center gap-1">
								{active ? (
									<Loader2 size={16} className="animate-spin text-white/60" />
								) : item.status === "done" ? (
									<CheckCircle2 size={16} className="text-emerald-400" />
								) : (
									<TriangleAlert size={16} className="text-amber-400" />
								)}
								<button
									className="btn-icon"
									title="Показать в папке"
									onClick={() => void apix.revealPath(item.path).catch(() => {})}
								>
									<FolderOpen size={16} />
								</button>
								<button
									className="btn-icon"
									title="Удалить"
									onClick={() => setToDelete(item)}
								>
									<Trash2 size={16} />
								</button>
							</div>
						</motion.div>
					)
				})}
			</div>

			<ConfirmDialog
				open={!!toDelete}
				title="Удалить загрузку?"
				description={`Файл «${toDelete?.name ?? ""}» будет удалён с диска.`}
				confirmText="Удалить"
				danger
				onCancel={() => setToDelete(null)}
				onConfirm={async () => {
					if (!toDelete) return
					try {
						await apix.downloadRemove(toDelete.id, true)
						setToDelete(null)
						void refresh()
					} catch (e) {
						toast((e as Error).message, "error")
					}
				}}
			/>
		</div>
	)
}
