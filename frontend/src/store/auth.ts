import { create } from "zustand";
import { api } from "../services/api";
import type { User } from "../types";
import { markLogoutNavigation, consumeLogoutNavigation } from "../utils/logoutNav";

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
  login: (phone: string, password: string) => Promise<User>;
  refreshUser: () => Promise<User | null>;
}

const BOOTSTRAP_MS = 8000;

export const useAuth = create<AuthState>((set, get) => ({
  token: localStorage.getItem("ls_token"),
  user: null,
  loading: true,

  setSession: (token, user) => {
    consumeLogoutNavigation();
    localStorage.setItem("ls_token", token);
    set({ token, user, loading: false });
  },

  logout: () => {
    markLogoutNavigation();
    localStorage.removeItem("ls_token");
    set({ token: null, user: null, loading: false });
  },

  bootstrap: async () => {
    const token = localStorage.getItem("ls_token");
    if (!token) {
      set({ loading: false, user: null, token: null });
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), BOOTSTRAP_MS);

    try {
      const { data } = await api.get<User>("/auth/me", { signal: controller.signal });
      set({ token, user: data, loading: false });
    } catch {
      // Stale token or API down — leave login reachable instead of infinite Loading
      localStorage.removeItem("ls_token");
      set({ token: null, user: null, loading: false });
    } finally {
      window.clearTimeout(timer);
    }
  },

  login: async (phone, password) => {
    const { data: tokenData } = await api.post<{ access_token: string }>("/auth/login", {
      phone_number: phone,
      password,
    });
    consumeLogoutNavigation();
    localStorage.setItem("ls_token", tokenData.access_token);
    const { data: user } = await api.get<User>("/auth/me");
    set({ token: tokenData.access_token, user, loading: false });
    return user;
  },

  refreshUser: async () => {
    if (!get().token) return null;
    try {
      const { data } = await api.get<User>("/auth/me");
      set({ user: data });
      return data;
    } catch {
      return null;
    }
  },
}));
