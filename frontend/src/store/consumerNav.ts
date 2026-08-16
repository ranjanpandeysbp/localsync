import { create } from "zustand";
import { api } from "../services/api";

interface ConsumerNavState {
  quotesChatUnread: number;
  receivedQuotesUnread: number;
  loading: boolean;
  refreshQuotesChatUnread: () => Promise<void>;
  refreshReceivedQuotesUnread: () => Promise<void>;
  markReceivedQuotesSeen: () => Promise<void>;
  clearQuotesChatUnread: () => void;
  bumpQuotesChatUnread: (by?: number) => void;
  bumpReceivedQuotesUnread: (by?: number) => void;
}

export const useConsumerNav = create<ConsumerNavState>((set) => ({
  quotesChatUnread: 0,
  receivedQuotesUnread: 0,
  loading: false,
  refreshQuotesChatUnread: async () => {
    set({ loading: true });
    try {
      const { data } = await api.get<{ unread_count: number }>("/conversations/unread-count");
      set({ quotesChatUnread: data.unread_count || 0, loading: false });
    } catch {
      set({ loading: false });
    }
  },
  refreshReceivedQuotesUnread: async () => {
    try {
      const { data } = await api.get<{ unread_count: number }>("/quotes/received/unread-count");
      set({ receivedQuotesUnread: data.unread_count || 0 });
    } catch {
      /* keep previous */
    }
  },
  markReceivedQuotesSeen: async () => {
    try {
      await api.post("/quotes/received/mark-seen");
      set({ receivedQuotesUnread: 0 });
    } catch {
      /* keep previous */
    }
  },
  clearQuotesChatUnread: () => set({ quotesChatUnread: 0 }),
  bumpQuotesChatUnread: (by = 1) =>
    set((s) => ({ quotesChatUnread: Math.max(0, s.quotesChatUnread + by) })),
  bumpReceivedQuotesUnread: (by = 1) =>
    set((s) => ({ receivedQuotesUnread: Math.max(0, s.receivedQuotesUnread + by) })),
}));
