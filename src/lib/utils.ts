import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | string): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(num);
}

export function formatDate(date: Date | string, pattern = "dd/MM/yyyy"): string {
  return format(new Date(date), pattern, { locale: ptBR });
}

export function formatDateTime(date: Date | string): string {
  return format(new Date(date), "dd/MM/yyyy HH:mm", { locale: ptBR });
}

export function calculateNights(checkIn: Date, checkOut: Date): number {
  return differenceInDays(new Date(checkOut), new Date(checkIn));
}

export function calculateCommission(total: number, rate = 0.10): number {
  return total * rate;
}

export function calculateOwnerAmount(total: number, commission: number, cleaningFee: number): number {
  return total - commission - cleaningFee;
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    CONFIRMED: "bg-blue-100 text-blue-700 border-blue-200",
    CHECKED_IN: "bg-green-100 text-green-700 border-green-200",
    CHECKED_OUT: "bg-gray-100 text-gray-700 border-gray-200",
    PENDING: "bg-yellow-100 text-yellow-700 border-yellow-200",
    CANCELLED: "bg-red-100 text-red-700 border-red-200",
    IN_PROGRESS: "bg-purple-100 text-purple-700 border-purple-200",
    DONE: "bg-green-100 text-green-700 border-green-200",
    LATE: "bg-red-100 text-red-700 border-red-200",
  };
  return colors[status] || "bg-gray-100 text-gray-700";
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    CONFIRMED: "Confirmada",
    CHECKED_IN: "Hospedado",
    CHECKED_OUT: "Check-out",
    PENDING: "Pendente",
    CANCELLED: "Cancelada",
    IN_PROGRESS: "Em andamento",
    DONE: "Concluída",
    LATE: "Atrasada",
    ADMIN: "Admin",
    TEAM: "Equipe",
    OWNER: "Proprietário",
    DIRECT: "Direto",
    AIRBNB: "Airbnb",
    BOOKING: "Booking",
    VRBO: "VRBO",
    MANUAL: "Manual",
  };
  return labels[status] || status;
}

export function generateReservationCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "R";
  for (let i = 0; i < 7; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function isOverdue(date: Date): boolean {
  return new Date(date) < new Date();
}

export function daysUntil(date: Date): number {
  return differenceInDays(new Date(date), new Date());
}
