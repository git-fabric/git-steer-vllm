import { create } from 'zustand'

interface AppState {
  warningEventCount: number
  setWarningEventCount: (n: number) => void
  selectedNamespace: string
  setSelectedNamespace: (ns: string) => void
}

export const useStore = create<AppState>((set) => ({
  warningEventCount: 0,
  setWarningEventCount: (n) => set({ warningEventCount: n }),
  selectedNamespace: 'all',
  setSelectedNamespace: (ns) => set({ selectedNamespace: ns }),
}))
