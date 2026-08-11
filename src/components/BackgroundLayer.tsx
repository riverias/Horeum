import { useAppearanceStore } from "@/store/appearance"

/**
 * Пользовательский фон: фото, GIF или видео поверх пресета.
 * Пока фон не выбран — ничего не рисуем и работает обычный пресет.
 */
export function BackgroundLayer() {
	const {
		bgMode,
		bgMediaUrl,
		bgMediaKind,
		blur,
		dim,
		saturation,
		scale,
		grain,
		vignette,
		videoMuted,
	} = useAppearanceStore()

	const active = bgMode === "media" && !!bgMediaUrl

	const mediaStyle: React.CSSProperties = {
		filter: `blur(${blur}px) saturate(${saturation}%)`,
		transform: `scale(${scale / 100})`,
	}

	return (
		<div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
			{active &&
				(bgMediaKind === "video" ? (
					<video
						key={bgMediaUrl}
						src={bgMediaUrl}
						className="h-full w-full object-cover"
						autoPlay
						loop
						muted={videoMuted}
						playsInline
						style={mediaStyle}
					/>
				) : (
					<img
						key={bgMediaUrl}
						src={bgMediaUrl}
						alt=""
						decoding="async"
						className="h-full w-full object-cover"
						style={mediaStyle}
					/>
				))}

			{active && (
				<div
					className="absolute inset-0 bg-black"
					style={{ opacity: dim / 100 }}
				/>
			)}

			{grain && <div className="bg-grain absolute inset-0" />}
			{vignette && <div className="bg-vignette absolute inset-0" />}
		</div>
	)
}
