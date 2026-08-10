import { AnimatePresence, motion } from "framer-motion"
import { CheckCircle2, Info, XCircle } from "lucide-react"
import { useUiStore } from "@/store/ui"

const ICON = {
  success: <CheckCircle2 size={16} className="text-emerald-400" />,
  error: <XCircle size={16} className="text-red-400" />,
  info: <Info size={16} className="text-sky-400" />,
}

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts)
  const dismiss = useUiStore((s) => s.dismiss)

  return (
    <div className="pointer-events-none fixed bottom-28 right-6 z-[100] flex w-[340px] flex-col gap-2">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            layout
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            onClick={() => dismiss(t.id)}
            className="glass-strong pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-left text-[13px] text-white/85 shadow-panel"
          >
            <span className="mt-0.5">{ICON[t.kind]}</span>
            <span className="flex-1 leading-snug">{t.message}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}
