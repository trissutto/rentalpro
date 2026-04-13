"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Home, TrendingUp, LogIn, LogOut, Sparkles, AlertTriangle,
  Calendar, DollarSign, ArrowRight, CheckCircle2, Clock,
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

  if (loading) return <DashboardSkeleton />;

  const statCards = [
    {
      label: "Check-ins hoje",
      value: stats?.todayCheckins ?? 0,
      icon: LogIn,
      color: "bg-green-50 text-green-600",
      href: "/reservations?status=CHECKED_IN",
    },
    {
      label: "Check-outs hoje",
      value: stats?.todayCheckouts ?? 0,
      icon: LogOut,
      color: "bg-red-50 text-red-600",
      href: "/reservations?status=CHECKED_OUT",
    },
    {
      label: "Limpezas pendentes",
      value: stats?.pendingCleanings ?? 0,
      icon: Sparkles,
      color: "bg-yellow-50 text-yellow-600",
      href: "/cleaning",
      alert: (stats?.lateCleanings ?? 0) > 0,
    },
    {
      label: "Reservas ativas",
      value: stats?.activeReservations ?? 0,
      icon: Calendar,
      color: "bg-blue-50 text-blue-600",
      href: "/reservations",
    },
  ];

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pt-1">
        <div>
          <p className="text-sm text-slate-400 font-medium">{greeting},</p>
          <h1 className="text-2xl font-bold text-slate-900">{user?.name?.split(" ")[0]} 👋</h1>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">{formatDate(new Date(), "EEEE")}</p>
          <p className="text-sm font-semibold text-slate-700">{formatDate(new Date(), "dd MMM yyyy")}</p>
        </div>
      </div>

      {/* Occupancy banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-gradient-to-r from-brand-600 to-brand-700 rounded-2xl p-5 mb-5 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-brand-200 text-sm font-medium">Taxa de Ocupação</p>
            <p className="text-4xl font-bold mt-1">{stats?.occupancyRate ?? 0}%</p>
            <p className="text-brand-200 text-xs mt-1">{stats?.totalProperties} imóvel(eis) cadastrado(s)</p>
          </div>
          <div className="text-right">
            <div className="bg-white/15 rounded-xl p-3">
              <TrendingUp className="w-8 h-8" />
            </div>
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-4 bg-white/20 rounded-full h-2">
          <div
            className="bg-white rounded-full h-2 transition-all duration-700"
            style={{ width: `${stats?.occupancyRate ?? 0}%` }}
          />
        </div>
      </motion.div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {statCards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Link href={card.href} className="card block hover:shadow-card-hover transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center", card.color)}>
                    <Icon size={18} />
                  </div>
                  {card.alert && (
                    <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                      <AlertTriangle size={12} /> {stats?.lateCleanings} atrasada(s)
                    </span>
                  )}
                </div>
                <p className="text-2xl font-bold text-slate-900">{card.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{card.label}</p>
              </Link>
            </motion.div>
          );
        })}
      </div>

      {/* Monthly financial summary */}
      {user?.role !== "TEAM" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card mb-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Financeiro do Mês</h2>
            <Link href="/financial" className="text-xs text-brand-600 font-medium flex items-center gap-1">
              Ver tudo <ArrowRight size={12} />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-green-50 rounded-xl">
              <p className="text-xs text-green-600 font-medium">Receita</p>
              <p className="text-base font-bold text-green-700 mt-1">
                {formatCurrency(stats?.monthlyIncome ?? 0)}
              </p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-xl">
              <p className="text-xs text-red-600 font-medium">Despesas</p>
              <p className="text-base font-bold text-red-700 mt-1">
                {formatCurrency(stats?.monthlyExpenses ?? 0)}
              </p>
            </div>
            <div className="text-center p-3 bg-brand-50 rounded-xl">
              <p className="text-xs text-brand-600 font-medium">Lucro</p>
              <p className="text-base font-bold text-brand-700 mt-1">
                {formatCurrency(stats?.monthlyProfit ?? 0)}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Recent reservations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card mb-5"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Últimas Reservas</h2>
          <Link href="/reservations" className="text-xs text-brand-600 font-medium flex items-center gap-1">
            Ver todas <ArrowRight size={12} />
          </Link>
        </div>
        {recentReservations.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">Nenhuma reserva encontrada</p>
        ) : (
          <div className="space-y-2">
            {recentReservations.map((res) => (
              <Link key={res.id} href={`/reservations/${res.id}`}>
                <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                  <div className="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-600 font-bold text-sm flex-shrink-0">
                    {res.guestName.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{res.guestName}</p>
                    <p className="text-xs text-slate-400 truncate">{res.property.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className={cn("status-pill text-[10px]", getStatusColor(res.status))}>
                      {getStatusLabel(res.status)}
                    </span>
                    <p className="text-xs text-slate-400 mt-1">{formatDate(res.checkIn)}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </motion.div>

      {/* Upcoming cleanings */}
      {user?.role !== "OWNER" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card mb-5"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Limpezas Pendentes</h2>
            <Link href="/cleaning" className="text-xs text-brand-600 font-medium flex items-center gap-1">
              Ver painel <ArrowRight size={12} />
            </Link>
          </div>
          {upcomingCleanings.length === 0 ? (
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-2xl">
              <CheckCircle2 className="w-5 h-5 text-green-500" />
              <p className="text-sm text-green-700 font-medium">Tudo em dia! Nenhuma limpeza pendente.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {upcomingCleanings.map((cleaning) => (
                <Link key={cleaning.id} href="/cleaning">
                  <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                      cleaning.status === "LATE" ? "bg-red-50" : "bg-yellow-50"
                    )}>
                      {cleaning.status === "LATE"
                        ? <AlertTriangle size={16} className="text-red-500" />
                        : <Clock size={16} className="text-yellow-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{cleaning.property.name}</p>
                      <p className="text-xs text-slate-400">{cleaning.cleaner?.name ?? "Sem faxineira"}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className={cn("status-pill text-[10px]", getStatusColor(cleaning.status))}>
                        {getStatusLabel(cleaning.status)}
                      </span>
                      <p className="text-xs text-slate-400 mt-1">{formatDate(cleaning.scheduledDate)}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 pt-4">
      <div className="skeleton h-8 w-48 rounded-xl" />
      <div className="skeleton h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-2xl" />
        ))}
      </div>
      <div className="skeleton h-32 w-full rounded-2xl" />
      <div className="skeleton h-48 w-full rounded-2xl" />
    </div>
  );
}
