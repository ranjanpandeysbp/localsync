import { create } from "zustand";
import { api } from "../services/api";
import type { Category } from "../types";

interface AdminCounts {
  providers: number;
  consumers: number;
  orders: number;
  categories: number;
  pendingProviders: number;
  messagesUnread: number;
}

interface AdminNavState {
  counts: AdminCounts;
  loading: boolean;
  refreshCounts: () => Promise<void>;
  bumpMessagesUnread: (by?: number) => void;
  clearMessagesUnread: () => void;
}

const empty: AdminCounts = {
  providers: 0,
  consumers: 0,
  orders: 0,
  categories: 0,
  pendingProviders: 0,
  messagesUnread: 0,
};

export const useAdminNav = create<AdminNavState>((set) => ({
  counts: empty,
  loading: false,
  refreshCounts: async () => {
    set({ loading: true });
    try {
      const [cats, provs, cons, ords, unread] = await Promise.all([
        api.get<Category[]>("/categories/admin/all"),
        api.get<{ user_id: string; verification_status: string }[]>("/admin/providers"),
        api.get<unknown[]>("/admin/consumers"),
        api.get<unknown[]>("/admin/orders"),
        api.get<{ unread_count: number }>("/support-conversations/unread-count"),
      ]);
      const parents = cats.data;
      const categoryCount =
        parents.length + parents.reduce((n, p) => n + (p.children?.length || 0), 0);
      set({
        counts: {
          providers: provs.data.length,
          consumers: cons.data.length,
          orders: ords.data.length,
          categories: categoryCount,
          pendingProviders: provs.data.filter((p) => p.verification_status === "PENDING").length,
          messagesUnread: unread.data.unread_count || 0,
        },
        loading: false,
      });
    } catch {
      set({ loading: false });
    }
  },
  bumpMessagesUnread: (by = 1) =>
    set((s) => ({
      counts: {
        ...s.counts,
        messagesUnread: Math.max(0, s.counts.messagesUnread + by),
      },
    })),
  clearMessagesUnread: () =>
    set((s) => ({
      counts: { ...s.counts, messagesUnread: 0 },
    })),
}));
