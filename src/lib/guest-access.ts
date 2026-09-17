import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const GUEST_SCOPES = [
  "reservation:read", "guests:write", "payments:write", "checkin:write", "contract:read",
] as const;
export type GuestScope = typeof GUEST_SCOPES[number];
type GuestReservation = { code: string; checkOut: Date | string };
type AccessClaims = { v: 1; code: string; scopes: GuestScope[]; exp: number; nonce: string };
export const PRIVATE_GUEST_HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" };

function signingKey() {
  const secret = process.env.GUEST_ACCESS_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error("Chave de acesso de hóspedes não configurada");
  return createHmac("sha256", secret).update("reservas-ita:guest-access:v1").digest();
}

/** A reservation code is an identifier, never an access credential. */
export function createGuestAccess(reservation: GuestReservation, scopes: readonly GuestScope[] = GUEST_SCOPES) {
  const now = Date.now();
  const checkout = new Date(reservation.checkOut).getTime();
  if (!Number.isFinite(checkout) || !reservation.code.trim()) throw new Error("Reserva inválida para emissão de link");
  // Finite lifetime, including seven days to download documents after the stay.
  // Old bookings reissued from the dashboard receive a one-day document window.
  const expires = Math.min(Math.max(checkout + 7 * 86400000, now + 86400000), now + 730 * 86400000);
  const claims: AccessClaims = {
    v: 1, code: reservation.code.trim().toUpperCase(), scopes: [...scopes],
    exp: Math.floor(expires / 1000), nonce: randomBytes(32).toString("base64url"),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(payload).digest("base64url");
  return { accessToken: `${payload}.${signature}`, accessExpiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function createGuestLink(reservation: GuestReservation, path: string, baseUrl?: string) {
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Caminho de hóspede inválido");
  const { accessToken } = createGuestAccess(reservation);
  const url = new URL(path, baseUrl || "https://guest-link.invalid");
  url.searchParams.set("access_token", accessToken);
  return baseUrl ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
}

export function verifyGuestAccessToken(token: string, code: string, scope: GuestScope, now = Date.now()): boolean {
  if (!token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const expected = createHmac("sha256", signingKey()).update(parts[0]).digest();
    const supplied = Buffer.from(parts[1], "base64url");
    if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return false;
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as AccessClaims;
    return claims.v === 1 && claims.code === code.trim().toUpperCase()
      && Number.isFinite(claims.exp) && claims.exp * 1000 > now
      && typeof claims.nonce === "string" && /^[A-Za-z0-9_-]{43}$/.test(claims.nonce)
      && Array.isArray(claims.scopes) && claims.scopes.includes(scope);
  } catch { return false; }
}

// Bounded, per-instance limit. Production runs one application replica; when
// scaling horizontally this store must be replaced by a shared atomic limiter.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
function limited(key: string, max: number): boolean {
  const now = Date.now();
  let entry = attempts.get(key);
  if (!entry || entry.resetAt <= now) {
    if (attempts.size >= 10000) {
      Array.from(attempts.entries()).forEach(([k, value]) => { if (value.resetAt <= now) attempts.delete(k); });
      if (attempts.size >= 10000) attempts.delete(attempts.keys().next().value as string);
    }
    entry = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, entry);
  }
  entry.count += 1;
  return entry.count > max;
}

/** Return null when authorized; otherwise return this response from the route. */
export async function authorizeGuestRequest(req: NextRequest, code: string, scope: GuestScope = "reservation:read"): Promise<NextResponse | null> {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown").slice(0, 100);
  const token = req.headers.get("x-guest-token") || req.nextUrl.searchParams.get("access_token") || "";
  if (verifyGuestAccessToken(token, code, scope)) {
    if (!limited(`valid:${createHmac("sha256", signingKey()).update(token).digest("hex")}`, 300)) return null;
  } else {
    const user = await getAuthUser(req);
    if (user && ["ADMIN", "TEAM"].includes(user.role)) return null;
    if (user?.role === "OWNER" && ["reservation:read", "contract:read"].includes(scope)) {
      const owned = await prisma.reservation.findFirst({
        where: { code: code.toUpperCase(), property: { ownerId: user.id } }, select: { id: true },
      });
      if (owned) return null;
    }
    if (limited(`invalid:${ip}`, 20)) {
      return NextResponse.json({ error: "Muitas tentativas. Aguarde 15 minutos e tente novamente." }, {
        status: 429, headers: { ...PRIVATE_GUEST_HEADERS, "Retry-After": "900" },
      });
    }
    return NextResponse.json({ error: "Link de acesso inválido ou expirado. Solicite um novo link ao responsável pela reserva." }, {
      status: 401, headers: PRIVATE_GUEST_HEADERS,
    });
  }
  return NextResponse.json({ error: "Muitas consultas. Aguarde 15 minutos e tente novamente." }, {
    status: 429, headers: { ...PRIVATE_GUEST_HEADERS, "Retry-After": "900" },
  });
}

type CheckInReservation = {
  status: string; paymentStatus: string; checkIn: Date | string; checkOut: Date | string;
  property: { checkInTime: string | null; checkOutTime: string | null };
};

export function checkInEligibility(reservation: CheckInReservation, now = new Date()) {
  const time = (value: string | null, fallback: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "") ? value! : fallback;
  const start = `${new Date(reservation.checkIn).toISOString().slice(0, 10)}T${time(reservation.property.checkInTime, "14:00")}`;
  const end = `${new Date(reservation.checkOut).toISOString().slice(0, 10)}T${time(reservation.property.checkOutTime, "12:00")}`;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  const local = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  const allowed = ["CONFIRMED", "CHECKED_IN"].includes(reservation.status)
    && reservation.paymentStatus === "PAID" && local >= start && local < end;
  const reason = !["CONFIRMED", "CHECKED_IN"].includes(reservation.status)
    ? "A reserva precisa estar confirmada para liberar a entrada."
    : reservation.paymentStatus !== "PAID"
      ? "O pagamento precisa estar confirmado para liberar a entrada."
      : local < start ? "O acesso será liberado no dia e horário de check-in."
        : local >= end ? "O período de hospedagem já terminou." : null;
  return { allowed, reason, opensAt: `${start}:00-03:00`, closesAt: `${end}:00-03:00` };
}

export function validateGuestInput(value: unknown, limit: number) {
  if (!Array.isArray(value) || value.length === 0 || value.length > limit) return null;
  const guests: { name: string; birthDate: Date; docType: string; docNumber: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { name, birthDate, docType = "CPF", docNumber } = item;
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 150
      || typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)
      || typeof docType !== "string" || !["CPF", "RG", "PASSPORT", "PASSAPORTE", "CNH", "OUTRO"].includes(docType.toUpperCase())
      || typeof docNumber !== "string" || !docNumber.trim() || docNumber.length > 40) return null;
    const date = new Date(`${birthDate}T12:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthDate || date > new Date() || date.getUTCFullYear() < 1900) return null;
    guests.push({ name: name.trim(), birthDate: date, docType: docType.toUpperCase(), docNumber: docNumber.trim() });
  }
  return guests;
}
