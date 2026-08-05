import { create } from "zustand";
import { api } from "../services/api";
import type { User } from "../types";

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  setSession: (token: string, user: User) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
  login: (phone: string, password: string) => Promise<User>;
}

const BOOTSTRAP_MS = 8000;

export const useAuth = create<AuthState>((set) => ({
  token: localStorage.getItem("ls_token"),
  user: null,
  loading: true,

  setSession: (token, user) => {
    localStorage.setItem("ls_token", token);
    set({ token, user, loading: false });
  },

  logout: () => {
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
    localStorage.setItem("ls_token", tokenData.access_token);
    const { data: user } = await api.get<User>("/auth/me");
    set({ token: tokenData.access_token, user, loading: false });
    return user;
  },
}));
