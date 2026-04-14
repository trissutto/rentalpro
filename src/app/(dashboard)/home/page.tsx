"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  LogIn, LogOut, Sparkles, Calendar,
  ArrowRight, ArrowUpRight, TrendingUp,
  AlertTriangle, CheckCircle2, Clock,
  Home, DollarSign, CreditCard,
} from "lucide-react";
import { formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import { apiRequest } from "@/hooks/useAuth";
import { useAuthStore } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface DashboardStats {
  totalProperties: number;
  todayCheckins: number;
  todayCheckouts: number;
  pendingCleanings: number;
  lateCleanings: number;
  activeReservations: number;
  occupancyRate: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyProfit: number;
}

interface Reservation {
  id: string;
  code: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  status: string;
  property: { name: string };
}

interface Cleaning {
  id: string;
  status: string;
  scheduledDate: string;
  property: { name: string };
  cleaner?: { name: string } | null;
}

const FADE_UP = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay },
});

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentReservations, setRecentReservations] = useState<Reservation[]>([]);
  const [upcomingCleanings, setUpcomingCleanings] = useState<Cleaning[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiRequest("/api/dashboard");
        const data = await res.json();
        setStats(data.stats);
        setRecentReservations(data.recentReservations);
        setUpcomingCleanings(data.upcomingCleanings);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const isOwner = user?.role === "OWNER";
  const isAdmin = user?.role === "ADMIN";

  if (loading) return <DashboardSkeleton />;

  const income = stats?.monthlyIncome ?? 0;
  const expenses = stats?.monthlyExpenses ?? 0;
  const profit = stats?.monthlyProfit ?? 0;
  const occupancy = stats?.occupancyRate ?? 0;

  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto">

      {/* ── HEADER ──────────────────────────────────────────────── */}
      <motion.div {...FADE_UP(0)} className="flex items-end justify-between mb-8">
        <div>
          <p className="text-sm text-slate-400 font-medium mb-0.5">{greeting},</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            {user?.name?.split(" ")[0]}
          </h1>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">
            {new Date().toLocaleDateString("pt-BR", { weekday: "long" })}
          </p>
          <p className="text-sm font-semibold text-slate-600">
            {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
          </p>
        </div>
      </motion.div>

      {/* ── GRID PRINCIPAL ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">

        {/* Ocupação — card grande */}
        <motion.div {...FADE_UP(0.05)} className="col-span-2 relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-600 via-brand-600 to-brand-800 p-6 text-white shadow-lg shadow-brand-500/20">
          <div className="absolute -right-8 -top-8 w-40 h-40 bg-white/5 rounded-full" />
          <div className="absolute -right-2 bottom-0 w-24 h-24 bg-white/5 rounded-full" />
          <p className="text-brand-200 text-xs font-semibold uppercase tracking-widest mb-3">Ocupação atual</p>
          <div className="flex items-end gap-3 mb-4">
            <span className="text-6xl font-black leading-none">{occupancy}%</span>
            <span className="text-brand-200 text-sm mb-1.5 font-medium">{stats?.totalProperties} imóvel(eis)</span>
          </div>
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${occupancy}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="h-full bg-white rounded-full"
            />
          </div>
          <div className="flex items-center justify-between mt-4">
            <div>
              <p className="text-2xl font-bold">{stats?.activeReservations ?? 0}</p>
              <p className="text-brand-200 text-xs">reservas ativas</p>
            </div>
            <Link href="/reservations" className="flex items-center gap-1.5 text-xs font-semibold bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-xl transition-colors">
              Ver todas <ArrowRight size={12} />
            </Link>
          </div>
        </motion.div>

        {/* Check-in hoje */}
        <motion.div {...FADE_UP(0.1)}>
          <Link href="/reservations" className="block h-full bg-white border border-slate-100 rounded-3xl p-5 hover:shadow-md hover:border-green-200 transition-all group">
            <div className="w-10 h-10 bg-green-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-green-100 transition-colors">
              <LogIn size={18} className="text-green-600" />
            </div>
            <p className="text-4xl font-black text-slate-900 mb-1">{stats?.todayCheckins ?? 0}</p>
            <p className="text-xs text-slate-400 font-medium">Check-in hoje</p>
          </Link>
        </motion.div>

        {/* Check-out hoje */}
        <motion.div {...FADE_UP(0.12)}>
          <Link href="/reservations" className="block h-full bg-white border border-slate-100 rounded-3xl p-5 hover:shadow-md hover:border-red-200 transition-all group">
            <div className="w-10 h-10 bg-red-50 rounded-2xl flex items-center justify-center mb-4 group-hover:bg-red-100 transition-colors">
              <LogOut size={18} className="text-red-500" />
            </div>
            <p className="text-4xl font-black text-slate-900 mb-1">{stats?.todayCheckouts ?? 0}</p>
            <p className="text-xs text-slate-400 font-medium">Check-out hoje</p>
          </Link>
        </motion.div>

      </div>

      {/* ── SEGUNDA LINHA ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">

        {/* Financeiro do mês */}
        {!isOwner && (
          <motion.div {...FADE_UP(0.15)} className="md:col-span-2 bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold">Financeiro</p>
                <p className="text-base font-bold text-slate-900 mt-0.5">
                  {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
                </p>
              </div>
              <Link href="/financial" className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline">
                Detalhes <ArrowUpRight size={12} />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-green-50 rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={13} className="text-green-500" />
                  <p className="text-xs text-green-600 font-semibold">Receita</p>
                </div>
                <p className="text-xl font-black text-green-700">{formatCurrency(income)}</p>
              </div>
              <div className="bg-red-50 rounded-2xl p-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <DollarSign size={13} className="text-red-400" />
                  <p className="text-xs text-red-500 font-semibold">Despesas</p>
                </div>
                <p className="text-xl font-black text-red-600">{formatCurrency(expenses)}</p>
              </div>
              <div className={cn(
                "rounded-2xl p-4",
                profit >= 0 ? "bg-brand-50" : "bg-orange-50"
              )}>
                <div className="flex items-center gap-1.5 mb-2">
                  <TrendingUp size={13} className={profit >= 0 ? "text-brand-500" : "text-orange-500"} />
                  <p className={cn("text-xs font-semibold", profit >= 0 ? "text-brand-600" : "text-orange-600")}>Lucro</p>
                </div>
                <p className={cn("text-xl font-black", profit >= 0 ? "text-brand-700" : "text-orange-600")}>{formatCurrency(profit)}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Limpeza & Parcelamentos */}
        <motion.div {...FADE_UP(0.18)} className={cn("flex flex-col gap-3", isOwner ? "md:col-span-3 grid grid-cols-2" : "")}>
          {/* Limpezas */}
          {!isOwner && (
            <Link href="/cleaning" className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-md hover:border-yellow-200 transition-all group">
              <div className={cn(
                "w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 transition-colors",
                (stats?.lateCleanings ?? 0) > 0
                  ? "bg-red-50 group-hover:bg-red-100"
                  : "bg-yellow-50 group-hover:bg-yellow-100"
              )}>
                {(stats?.lateCleanings ?? 0) > 0
                  ? <AlertTriangle size={20} className="text-red-500" />
                  : <Sparkles size={20} className="text-yellow-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-2xl font-black text-slate-900">{stats?.pendingCleanings ?? 0}</p>
                <p className="text-xs text-slate-400 font-medium">Limpezas pendentes</p>
                {(stats?.lateCleanings ?? 0) > 0 && (
                  <p className="text-[11px] text-red-500 font-semibold mt-0.5">{stats?.lateCleanings} atrasada(s)</p>
                )}
              </div>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </Link>
          )}

          {/* Parcelamentos */}
          {isAdmin && (
            <Link href="/payments" className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-md hover:border-brand-200 transition-all group">
              <div className="w-12 h-12 rounded-2xl bg-brand-50 group-hover:bg-brand-100 flex items-center justify-center flex-shrink-0 transition-colors">
                <CreditCard size={20} className="text-brand-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-400 font-medium">Parcelamentos</p>
                <p className="text-xs text-slate-500 mt-0.5">Controlar pagamentos</p>
              </div>
              <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
            </Link>
          )}

          {/* Calendário */}
          <Link href="/calendar" className="flex items-center gap-4 bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-md hover:border-brand-200 transition-all group">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 group-hover:bg-slate-100 flex items-center justify-center flex-shrink-0 transition-colors">
              <Calendar size={20} className="text-slate-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-400 font-medium">Calendário</p>
              <p className="text-xs text-slate-500 mt-0.5">Ver disponibilidade</p>
            </div>
            <ArrowRight size={14} className="text-slate-300 group-hover:text-slate-500 transition-colors" />
          </Link>
        </motion.div>
      </div>

      {/* ── TERCEIRA LINHA ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Últimas reservas */}
        <motion.div {...FADE_UP(0.2)} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <p className="text-sm font-bold text-slate-900">Últimas Reservas</p>
            <Link href="/reservations" className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline">
              Ver todas <ArrowUpRight size={12} />
            </Link>
          </div>
          {recentReservations.length === 0 ? (
            <div className="text-center py-8">
              <Home size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">Nenhuma reserva ainda</p>
            </div>
          ) : (
            <div className="space-y-1">
              {recentReservations.map((res, i) => (
                <motion.div key={res.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 + i * 0.05 }}>
                  <Link href={`/reservations/${res.id}`}>
                    <div className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors group">
                      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0 shadow-sm">
                        {res.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{res.guestName}</p>
                        <p className="text-xs text-slate-400 truncate">{res.property.name}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getStatusColor(res.status))}>
                          {getStatusLabel(res.status)}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">{formatDate(res.checkIn)}</p>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Limpezas pendentes */}
        {!isOwner && (
          <motion.div {...FADE_UP(0.22)} className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <p className="text-sm font-bold text-slate-900">Limpezas Pendentes</p>
              <Link href="/cleaning" className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline">
                Ver painel <ArrowUpRight size={12} />
              </Link>
            </div>
            {upcomingCleanings.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-700 font-medium">Tudo em dia!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {upcomingCleanings.map((c, i) => (
                  <motion.div key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.28 + i * 0.05 }}>
                    <Link href="/cleaning">
                      <div className="flex items-center gap-3 p-2.5 rounded-2xl hover:bg-slate-50 transition-colors">
                        <div className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                          c.status === "LATE" ? "bg-red-50" : "bg-yellow-50"
                        )}>
                          {c.status === "LATE"
                            ? <AlertTriangle size={15} className="text-red-500" />
                            : <Clock size={15} className="text-yellow-500" />
                          }
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">{c.property.name}</p>
                          <p className="text-xs text-slate-400">{c.cleaner?.name ?? "Sem faxineira"}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", getStatusColor(c.status))}>
                            {getStatusLabel(c.status)}
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1">{formatDate(c.scheduledDate)}</p>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="p-5 md:p-8 max-w-6xl mx-auto space-y-5">
      <div className="skeleton h-10 w-40 rounded-2xl" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="col-span-2 skeleton h-44 rounded-3xl" />
        <div className="skeleton h-44 rounded-3xl" />
        <div className="skeleton h-44 rounded-3xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 skeleton h-40 rounded-3xl" />
        <div className="skeleton h-40 rounded-3xl" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="skeleton h-52 rounded-3xl" />
        <div className="skeleton h-52 rounded-3xl" />
      </div>
    </div>
  );
}
