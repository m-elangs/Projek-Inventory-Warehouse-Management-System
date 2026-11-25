import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UiState {
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  selectedWarehouseId: number | null;
  quickStockModal: 'in' | 'out' | null;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
  setSelectedWarehouseId: (id: number | null) => void;
  setQuickStockModal: (mode: 'in' | 'out' | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      mobileMenuOpen: false,
      selectedWarehouseId: null,
      quickStockModal: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
      setSelectedWarehouseId: (id) => set({ selectedWarehouseId: id }),
      setQuickStockModal: (mode) => set({ quickStockModal: mode }),
    }),
    {
      name: 'strata-wms-ui',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        selectedWarehouseId: state.selectedWarehouseId,
      }),
    }
  )
);
