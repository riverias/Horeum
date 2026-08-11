import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"
import { X } from "lucide-react"

interface ModalProps {
	open: boolean
	title: string
	description?: string
	onClose: () => void
	children: React.ReactNode
	wide?: boolean
}

/** Красивое модальное окно вместо alert()/prompt(). */
export function Modal({
	open,
	title,
	description,
	onClose,
	children,
	wide,
}: ModalProps) {
	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose()
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [open, onClose])

	return (
		<AnimatePresence>
			{open && (
				<motion.div
					className="fixed inset-0 z-[999] flex items-center justify-center p-6"
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					exit={{ opacity: 0 }}
				>
					<div
						className="absolute inset-0 bg-black/60 backdrop-blur-sm"
						onClick={onClose}
					/>
					<motion.div
						initial={{ scale: 0.94, y: 12, opacity: 0 }}
						animate={{ scale: 1, y: 0, opacity: 1 }}
						exit={{ scale: 0.96, y: 8, opacity: 0 }}
						transition={{ type: "spring", stiffness: 320, damping: 26 }}
						className={`glass-strong relative z-10 w-full ${
							wide ? "max-w-3xl" : "max-w-md"
						} rounded-2xl border border-white/10 p-5 shadow-2xl`}
					>
						<button
							className="btn-icon absolute right-3 top-3"
							onClick={onClose}
							aria-label="Закрыть"
						>
							<X size={16} />
						</button>
						<h3 className="pr-8 text-lg font-semibold">{title}</h3>
						{description && (
							<p className="mt-1 text-sm text-white/50">{description}</p>
						)}
						<div className="mt-4">{children}</div>
					</motion.div>
				</motion.div>
			)}
		</AnimatePresence>
	)
}

interface PromptDialogProps {
	open: boolean
	title: string
	description?: string
	label?: string
	defaultValue?: string
	placeholder?: string
	multiline?: boolean
	maxLength?: number
	confirmText?: string
	onCancel: () => void
	onSubmit: (value: string) => void
}

/** Ввод текста в модалке (замена window.prompt). */
export function PromptDialog({
	open,
	title,
	description,
	label,
	defaultValue = "",
	placeholder,
	multiline,
	maxLength,
	confirmText = "Сохранить",
	onCancel,
	onSubmit,
}: PromptDialogProps) {
	const [value, setValue] = useState(defaultValue)

	useEffect(() => {
		if (open) setValue(defaultValue)
	}, [open, defaultValue])

	return (
		<Modal open={open} title={title} description={description} onClose={onCancel}>
			<div className="space-y-3">
				{label && <div className="text-xs uppercase tracking-wide text-white/40">{label}</div>}
				{multiline ? (
					<textarea
						autoFocus
						className="input min-h-[120px] w-full resize-y"
						value={value}
						maxLength={maxLength}
						placeholder={placeholder}
						onChange={(e) => setValue(e.target.value)}
					/>
				) : (
					<input
						autoFocus
						className="input w-full"
						value={value}
						maxLength={maxLength}
						placeholder={placeholder}
						onChange={(e) => setValue(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") onSubmit(value.trim())
						}}
					/>
				)}
				{maxLength && (
					<div className="text-right text-[11px] text-white/30">
						{value.length}/{maxLength}
					</div>
				)}
				<div className="flex justify-end gap-2 pt-1">
					<button className="btn" onClick={onCancel}>
						Отмена
					</button>
					<button className="btn btn-accent" onClick={() => onSubmit(value.trim())}>
						{confirmText}
					</button>
				</div>
			</div>
		</Modal>
	)
}

interface ConfirmDialogProps {
	open: boolean
	title: string
	description?: string
	confirmText?: string
	danger?: boolean
	onCancel: () => void
	onConfirm: () => void
}

export function ConfirmDialog({
	open,
	title,
	description,
	confirmText = "Подтвердить",
	danger,
	onCancel,
	onConfirm,
}: ConfirmDialogProps) {
	return (
		<Modal open={open} title={title} description={description} onClose={onCancel}>
			<div className="flex justify-end gap-2">
				<button className="btn" onClick={onCancel}>
					Отмена
				</button>
				<button
					className={`btn ${danger ? "text-red-300" : "btn-accent"}`}
					onClick={onConfirm}
				>
					{confirmText}
				</button>
			</div>
		</Modal>
	)
}
