import { create } from "zustand"
import { api } from "@/lib/api"
import { hexToRgb } from "@/lib/utils"
import type { Achievement, Profile, ScUser, Unlockable } from "@/lib/types"

interface ProfileState {
  profile: Profile | null
  cosmetics: Unlockable[]
  achievements: Achievement[]
  scUser: ScUser | null
  likedIds: Set<number>

  load: () => Promise<void>
  setProfile: (p: Profile) => void
  patch: (patch: Record<string, string>) => Promise<void>
  setScUser: (u: ScUser | null) => void
  refreshLikes: () => Promise<void>
  toggleLikeLocal: (trackId: number, liked: boolean) => void
  accentColor: () => string
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  cosmetics: [],
  achievements: [],
  scUser: null,
  likedIds: new Set(),

  async load() {
    const [profile, cosmetics, achievements, likedIds] = await Promise.all([
      api.profile(),
      api.cosmetics(),
      api.achievements(),
      api.likedIds(),
    ])
    set({ profile, cosmetics, achievements, likedIds: new Set(likedIds) })
    applyAccent(profile.accent, cosmetics)
  },

  setProfile(profile) {
    set({ profile })
    applyAccent(profile.accent, get().cosmetics)
  },

  async patch(patch) {
    const profile = await api.updateProfile(patch)
    get().setProfile(profile)
    set({ achievements: await api.achievements() })
  },

  setScUser(scUser) {
    set({ scUser })
  },

  async refreshLikes() {
    set({ likedIds: new Set(await api.likedIds()) })
  },

  toggleLikeLocal(trackId, liked) {
    const next = new Set(get().likedIds)
    if (liked) next.add(trackId)
    else next.delete(trackId)
    set({ likedIds: next })
  },

  accentColor() {
    const { profile, cosmetics } = get()
    const found = cosmetics.find((c) => c.kind === "accent" && c.id === profile?.accent)
    return found?.value ?? "#8b5cf6"
  },
}))

function applyAccent(accentId: string, cosmetics: Unlockable[]) {
  const accent = cosmetics.find((c) => c.kind === "accent" && c.id === accentId)
  const hex = accent?.value ?? "#8b5cf6"
  const [r, g, b] = hexToRgb(hex)
  document.documentElement.style.setProperty("--accent-rgb", `${r} ${g} ${b}`)
  document.documentElement.style.setProperty("--accent", hex)
}
