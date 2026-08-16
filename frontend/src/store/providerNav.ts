import { create } from "zustand";
import { api } from "../services/api";

interface ProviderNavState {
  adminUnread: number;
  inquiryUnread: number;
  requestInquiryUnread: number;
  quoteInquiryUnread: number;
  loading: boolean;
  refreshAdminUnread: () => Promise<void>;
  refreshInquiryUnread: () => Promise<void>;
  clearAdminUnread: () => void;
  bumpAdminUnread: (by?: number) => void;
  bumpInquiryUnread: (by?: number) => void;
}

export const useProviderNav = create<ProviderNavState>((set) => ({
  adminUnread: 0,
  inquiryUnread: 0,
  requestInquiryUnread: 0,
  quoteInquiryUnread: 0,
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
  refreshInquiryUnread: async () => {
    try {
      const { data } = await api.get<{
        unread_count: number;
        request_unread_count?: number;
        quote_unread_count?: number;
      }>("/conversations/unread-count");
      set({
        inquiryUnread: data.unread_count || 0,
        requestInquiryUnread: data.request_unread_count || 0,
        quoteInquiryUnread: data.quote_unread_count || 0,
      });
    } catch {
      /* keep previous */
    }
  },
  clearAdminUnread: () => set({ adminUnread: 0 }),
  bumpAdminUnread: (by = 1) =>
    set((s) => ({ adminUnread: Math.max(0, s.adminUnread + by) })),
  bumpInquiryUnread: (by = 1) =>
    set((s) => ({
      inquiryUnread: Math.max(0, s.inquiryUnread + by),
      requestInquiryUnread: Math.max(0, s.requestInquiryUnread + by),
      quoteInquiryUnread: Math.max(0, s.quoteInquiryUnread + by),
    })),
}));
