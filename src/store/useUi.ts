import { create } from 'zustand';

/** Transient editor UI state that is not part of the plan. */
interface UiState {
  helpOpen: boolean;
  /** Desktop: the floating cargo panel is hidden to see the whole scene. */
  panelHidden: boolean;
  /** Phones and tablets: the cargo panel as a drawer. */
  drawerOpen: boolean;
  vehicleCollapsed: boolean;
  addFormCollapsed: boolean;
  autoloadOpen: boolean;
  setHelpOpen(open: boolean): void;
  setPanelHidden(hidden: boolean): void;
  setDrawerOpen(open: boolean): void;
  setVehicleCollapsed(collapsed: boolean): void;
  setAddFormCollapsed(collapsed: boolean): void;
  setAutoloadOpen(open: boolean): void;
}

const narrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;

export const useUi = create<UiState>()((set) => ({
  helpOpen: false,
  panelHidden: false,
  drawerOpen: false,
  vehicleCollapsed: narrow(),
  addFormCollapsed: false,
  autoloadOpen: false,
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  setPanelHidden: (panelHidden) => set({ panelHidden }),
  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
  setVehicleCollapsed: (vehicleCollapsed) => set({ vehicleCollapsed }),
  setAddFormCollapsed: (addFormCollapsed) => set({ addFormCollapsed }),
  setAutoloadOpen: (autoloadOpen) => set({ autoloadOpen }),
}));
