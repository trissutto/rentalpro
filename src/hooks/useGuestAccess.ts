"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

export function withGuestAccess(path: string, token: string): string {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Destino de acesso inválido");
  const url = new URL(path, "https://local.invalid");
  if (token) url.searchParams.set("access_token", token);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function useGuestAccess() {
  const token = useSearchParams().get("access_token") || "";
  const guestLink = useCallback((path: string) => withGuestAccess(path, token), [token]);
  const guestFetch = useCallback((path: string, init: RequestInit = {}) => {
    if (!path.startsWith("/api/public/")) throw new Error("Destino de acesso inválido");
    const headers = new Headers(init.headers);
    if (token) headers.set("x-guest-token", token);
    return fetch(path, { ...init, headers, cache: "no-store" });
  }, [token]);
  return { accessToken: token, guestLink, guestFetch };
}
