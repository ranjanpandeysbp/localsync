import axios, { AxiosError } from "axios";
import { isLogoutNavigation } from "../utils/logoutNav";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:2025/api/v1";

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 12000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ls_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // Default JSON Content-Type breaks multipart uploads — drop it for FormData
  if (typeof FormData !== "undefined" && config.data instanceof FormData) {
    const headers = config.headers as { delete?: (k: string) => void } & Record<string, unknown>;
    if (typeof headers.delete === "function") {
      headers.delete("Content-Type");
      headers.delete("content-type");
    } else {
      delete headers["Content-Type"];
      delete headers["content-type"];
    }
    if (config.timeout == null || config.timeout < 60000) {
      config.timeout = 60000;
    }
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const reqUrl = String(error.config?.url || "");
      // Wrong password / register conflicts are expected — don't treat as session expiry.
      if (
        reqUrl.includes("/auth/login") ||
        reqUrl.includes("/auth/register") ||
        reqUrl.includes("/auth/otp") ||
        reqUrl.includes("/auth/forgot-password") ||
        reqUrl.includes("/auth/reset-password")
      ) {
        return Promise.reject(error);
      }
      localStorage.removeItem("ls_token");
      if (
        window.location.pathname.startsWith("/forgot-password") ||
        window.location.pathname.startsWith("/reset-password")
      ) {
        return Promise.reject(error);
      }
      // Never hard-redirect on the landing page — Sign in / Register live there.
      if (window.location.pathname === "/") {
        return Promise.reject(error);
      }
      // After logout, land on `/` quietly; otherwise prompt sign-in.
      window.location.href = isLogoutNavigation() ? "/" : "/?login=1";
    }
    return Promise.reject(error);
  },
);

/** Turn FastAPI / axios errors into a readable string for UI. */
export function apiErrorMessage(err: unknown, fallback = "Request failed"): string {
  const ax = err as AxiosError<{ detail?: unknown }>;
  if (ax?.code === "ECONNABORTED" || /timeout/i.test(ax?.message || "")) {
    return "Server took too long to respond. Please try again.";
  }
  const detail = ax?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object") {
        const row = item as { msg?: string; loc?: unknown[] };
        const where = Array.isArray(row.loc)
          ? row.loc.filter((x) => x !== "body").join(".")
          : "";
        const msg = row.msg || JSON.stringify(item);
        return where ? `${where}: ${msg}` : msg;
      }
      return String(item);
    });
    return parts.filter(Boolean).join("; ") || fallback;
  }
  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }
  const message = (err as Error)?.message;
  return message || fallback;
}
