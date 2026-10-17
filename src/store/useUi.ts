import { create } from 'zustand';

/** Transient UI state that is not part of the plan. */
interface UiState {
  helpOpen: boolean;
  /** Cargo panel as a drawer on narrow screens. */
  panelOpen: boolean;
  setHelpOpen(open: boolean): void;
  setPanelOpen(open: boolean): void;
}

export const useUi = create<UiState>()((set) => ({
  helpOpen: false,
  panelOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}));
