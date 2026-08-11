import { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { TitleBar } from "@/components/TitleBar"
import { Sidebar } from "@/components/Sidebar"
import { PlayerBar } from "@/components/PlayerBar"
import { Toasts } from "@/components/Toasts"
import { QueuePanel } from "@/components/QueuePanel"
import { LyricsPanel } from "@/components/LyricsPanel"
import { EqualizerPanel } from "@/components/EqualizerPanel"
import { CommandPalette } from "@/components/CommandPalette"
import { FullscreenPlayer } from "@/components/FullscreenPlayer"
import { BackgroundLayer } from "@/components/BackgroundLayer"
import { HomeView } from "@/views/HomeView"
import { SearchView } from "@/views/SearchView"
import { WaveView } from "@/views/WaveView"
import { MoodsView } from "@/views/MoodsView"
import { ChartsView } from "@/views/ChartsView"
import { LibraryView } from "@/views/LibraryView"
import { HistoryView } from "@/views/HistoryView"
import { PlaylistsView } from "@/views/PlaylistsView"
import { PlaylistView } from "@/views/PlaylistView"
import { ArtistView } from "@/views/ArtistView"
import { ProfileView } from "@/views/ProfileView"
import { DownloadsView } from "@/views/DownloadsView"
import { SettingsView } from "@/views/SettingsView"
import { useBootstrap } from "@/hooks/useBootstrap"
import { useKeyboard } from "@/hooks/useKeyboard"
import { useUiStore } from "@/store/ui"
import { useProfileStore } from "@/store/profile"
import { useAppearanceStore } from "@/store/appearance"

function CurrentView() {
  const view = useUiStore((s) => s.view)
  const param = useUiStore((s) => s.viewParam)

  switch (view) {
    case "search":
      return <SearchView />
    case "wave":
      return <WaveView />
    case "moods":
      return <MoodsView />
    case "charts":
      return <ChartsView />
    case "library":
      return <LibraryView />
    case "history":
      return <HistoryView />
    case "playlists":
      return <PlaylistsView />
    case "playlist":
      return <PlaylistView id={Number(param)} />
    case "artist":
      return <ArtistView id={Number(param)} />
    case "profile":
      return <ProfileView />
    case "downloads":
      return <DownloadsView />
    case "settings":
      return <SettingsView />
    default:
      return <HomeView />
  }
}

export default function App() {
  useBootstrap()
  useKeyboard()

  const view = useUiStore((s) => s.view)
  const fullscreen = useUiStore((s) => s.fullscreen)
  const background = useProfileStore((s) => s.profile?.background ?? "default")
  const customBg = useAppearanceStore((s) => s.bgMode === "media" && !!s.bgMediaUrl)

  useEffect(() => {
    document.title = "Horeum"
  }, [])

  return (
    <div className="relative flex h-screen w-screen flex-col overflow-hidden bg-ink-950">
      {!customBg && <div className={`bg-scene bg-${background}`} />}
      <BackgroundLayer />
      <div className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-black/10 via-black/40 to-black/70" />

      <div className="relative z-10 flex h-full flex-col">
        <TitleBar />

        <div className="flex min-h-0 flex-1">
          <Sidebar />

          <main className="relative min-w-0 flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={view}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
                className="scroll-area px-8 pb-40 pt-6"
              >
                <CurrentView />
              </motion.div>
            </AnimatePresence>
          </main>

          <QueuePanel />
          <LyricsPanel />
        </div>

        <PlayerBar />
      </div>

      <EqualizerPanel />
      <CommandPalette />
      <AnimatePresence>{fullscreen && <FullscreenPlayer />}</AnimatePresence>
      <Toasts />
    </div>
  )
}
