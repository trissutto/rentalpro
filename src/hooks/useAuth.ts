import { create } from "zustand";
import { persist } from "zustand/middleware";
import { clearSessionCaches } from "@/lib/client-cache";

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      login: (user, token) => {
        void clearSessionCaches().catch(() => {});
        set({ user, token, isAuthenticated: true });
        localStorage.setItem("token", token);
      },

      logout: () => {
        set({ user: null, token: null, isAuthenticated: false });
        localStorage.removeItem("token");
        void clearSessionCaches().catch(() => {});
        void fetch("/api/auth/logout", { method: "POST", cache: "no-store" }).catch(() => {});
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    {
      name: "rental-auth",
      partialize: (state) => ({ user: state.user, token: state.token, isAuthenticated: state.isAuthenticated }),
    }
  )
);

// API helper with auth
export async function apiRequest(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem("token");
  const res = await fetch(url, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) { useAuthStore.getState().logout(); window.location.href = "/login"; }
  return res;
}
