import { create } from 'zustand'

interface AppState {
  alertCount: number
  setAlertCount: (n: number) => void
  selectedRepo: string | null
  setSelectedRepo: (repo: string | null) => void
  sidebarOpen: boolean
  toggleSidebar: () => void
}

export const useStore = create<AppState>((set) => ({
  alertCount: 0,
  setAlertCount: (n) => set({ alertCount: n }),
  selectedRepo: null,
  setSelectedRepo: (repo) => set({ selectedRepo: repo }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}))
