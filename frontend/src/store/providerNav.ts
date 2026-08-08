import { create } from "zustand";
import { api } from "../services/api";

interface ProviderNavState {
  adminUnread: number;
  loading: boolean;
  refreshAdminUnread: () => Promise<void>;
  clearAdminUnread: () => void;
  bumpAdminUnread: (by?: number) => void;
}

export const useProviderNav = create<ProviderNavState>((set) => ({
  adminUnread: 0,
  loading: false,
  refreshAdminUnread: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<{ unread_count: number }>(
        "/support-conversations/unread-count",
      );
      set({ adminUnread: data.unread_count || 0, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  clearAdminUnread: () => set({ adminUnread: 0 }),
  bumpAdminUnread: (by = 1) =>
    set((s) => ({ adminUnread: Math.max(0, s.adminUnread + by) })),
}));
