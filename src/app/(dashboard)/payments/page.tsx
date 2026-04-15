"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle, CheckCircle2, Clock, DollarSign,
  ChevronDown, ChevronUp, ExternalLink, RefreshCw,
  FileCheck, AlertCircle, TrendingUp, User, Home,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

interface InstallmentItem {
  seq: number;
  label: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  mpPaymentId?: string;
  receiptUrl?: string;
  receiptUploadedAt?: string;
  reminderSent?: boolean;
  overdueAlertSent?: boolean;
}

interface InstallmentPlan {
  numInstallments: number;
  entryAmount: number;
  installmentAmount: number;
  deadline: string;
  createdAt: string;
  items: InstallmentItem[];
}

interface PlanStats {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  dueSoon: number;
  paidAmount: number;
  pendingAmount: number;
  overdueAmount: number;
  health: "ok" | "due_soon" | "overdue";
}

interface PlanEntry {
  reservationId: string;
  code: string;
  guestName: string;
  guestPhone?: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  reservationStatus: string;
  propertyName: string;
  propertyId: string;
  plan: InstallmentPlan;
  stats: PlanStats;
}

interface Summary {
  totalPlans: number;
  totalOverdue: number;
  totalDueSoon: number;
  totalPaidAmount: number;
  totalPendingAmount: number;
  totalOverdueAmount: number;
}

function fmtDate(iso: string) {
  if (!iso) return "—";
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR");
}

const HEALTH_CONFIG = {
  overdue: { label: "Inadimplente", color: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500", border: "border-l-red-500" },
  due_soon: { label: "Vence em breve", color: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-500", border: "border-l-amber-500" },
  ok: { label: "Em dia", color: "bg-green-100 text-green-700 border-green-200", dot: "bg-green-500", border: "border-l-green-500" },
};

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total > 0 ? Math.round((paid / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-brand-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{paid}/{total}</span>
    </div>
  );
}

function PlanCard({ entry, onManualPay }: { entry: PlanEntry; onManualPay: (code: string, seq: number) => void }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = HEALTH_CONFIG[entry.stats.health];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm border-l-4",
        cfg.border
      )}
    >
      {/* Header */}
      <div
        className="px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="font-mono text-sm font-bold text-slate-700">{entry.code}</span>
              <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border", cfg.color)}>
                <span className={cn("inline-block w-1.5 h-1.5 rounded-full mr-1", cfg.dot)} />
                {cfg.label}
              </span>
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-600 mb-1">
              <User size={12} className="text-slate-400" />
              <span className="font-medium">{entry.guestName}</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <Home size={11} />
              <span>{entry.propertyName}</span>
              <span className="mx-1">·</span>
              <span>{fmtDate(entry.checkIn)} → {fmtDate(entry.checkOut)}</span>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-slate-900">{formatCurrency(entry.totalAmount)}</p>
            <p className="text-xs text-green-600 font-medium">{formatCurrency(entry.stats.paidAmount)} pago</p>
            {entry.stats.pendingAmount > 0 && (
              <p className="text-xs text-slate-400">{formatCurrency(entry.stats.pendingAmount)} restante</p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <ProgressBar paid={entry.stats.paid} total={entry.stats.total} />
        </div>

        {/* Alertas */}
        {entry.stats.overdue > 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-1.5">
            <AlertCircle size={12} />
            <span>{entry.stats.overdue} parcela{entry.stats.overdue > 1 ? "s" : ""} vencida{entry.stats.overdue > 1 ? "s" : ""} — {formatCurrency(entry.stats.overdueAmount)}</span>
          </div>
        )}
        {entry.stats.dueSoon > 0 && entry.stats.overdue === 0 && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5">
            <Clock size={12} />
            <span>{entry.stats.dueSoon} parcela{entry.stats.dueSoon > 1 ? "s" : ""} vence em até 5 dias</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-2">
          <Link
            href={`/reservations/${entry.reservationId}`}
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-xs text-brand-600 hover:underline"
          >
            <ExternalLink size={11} /> Ver reserva
          </Link>
          <button className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Detalhe parcelas */}
      {expanded && (
        <div className="border-t border-slate-100">
          <div className="px-3 py-2 bg-slate-50 border-b border-slate-100">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cronograma de Parcelas</p>
          </div>
          <div className="divide-y divide-slate-50">
            {entry.plan.items.map((item) => {
              const dueDate = new Date(item.dueDate.length === 10 ? item.dueDate + "T12:00:00" : item.dueDate);
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const isOverdue = !item.paid && dueDate < today;
              const isDueSoon = !item.paid && !isOverdue && Math.floor((dueDate.getTime() - today.getTime()) / 86400_000) <= 5;

              return (
                <div key={item.seq} className={cn(
                  "flex items-center gap-3 px-5 py-3",
                  item.paid ? "bg-green-50/40" : isOverdue ? "bg-red-50/40" : isDueSoon ? "bg-amber-50/40" : ""
                )}>
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0",
                    item.paid ? "bg-green-100" : isOverdue ? "bg-red-100" : isDueSoon ? "bg-amber-100" : "bg-slate-100"
                  )}>
                    {item.paid
                      ? <CheckCircle2 size={14} className="text-green-600" />
                      : isOverdue
                        ? <AlertTriangle size={14} className="text-red-500" />
                        : <Clock size={14} className="text-slate-400" />
                    }
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-700">{item.label}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {item.paid
                        ? <span className="text-green-600">Pago em {fmtDate(item.paidAt || "")}</span>
                        : isOverdue
                          ? <span className="text-red-600 font-medium">Venceu em {fmtDate(item.dueDate)}</span>
                          : <span>Vencimento: {fmtDate(item.dueDate)}</span>
                      }
                      {item.mpPaymentId && (
                        <span className="text-slate-300">· MP: {item.mpPaymentId}</span>
                      )}
                    </div>

                    {/* Comprovante */}
                    {item.receiptUrl && (
                      <a
                        href={item.receiptUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline mt-0.5"
                      >
                        <FileCheck size={11} /> Ver comprovante
                      </a>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <p className={cn(
                      "text-sm font-bold",
                      item.paid ? "text-green-700" : isOverdue ? "text-red-600" : "text-slate-900"
                    )}>
                      {formatCurrency(item.amount)}
                    </p>
                    {!item.paid && (
                      <button
                        onClick={() => onManualPay(entry.code, item.seq)}
                        className="text-[10px] text-brand-600 hover:underline mt-0.5 block text-right"
                      >
                        Marcar pago
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function PaymentsPage() {
  const [plans, setPlans] = useState<PlanEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "overdue" | "due_soon" | "ok">("all");
  const [markingPaid, setMarkingPaid] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiRequest("/api/admin/installments");
      const data = await res.json();
      setPlans(data.plans ?? []);
      setSummary(data.summary ?? null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualPay(code: string, seq: number) {
    if (!confirm(`Confirmar pagamento manual da parcela ${seq} da reserva ${code}?`)) return;
    setMarkingPaid(true);
    try {
      const res = await apiRequest("/api/public/payments/pay-installment", {
        method: "POST",
        body: JSON.stringify({ code, seq, manual: true }),
      });
      if (res.ok !== false) {
        await loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setMarkingPaid(false);
    }
  }

  const filtered = plans.filter(p => filter === "all" || p.stats.health === filter);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Controle de Parcelamentos</h1>
          <p className="text-sm text-slate-400 mt-0.5">Acompanhe todas as reservas com pagamento parcelado</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-60 transition-colors"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Atualizar
        </button>
      </div>

      {/* Cards de resumo */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp size={16} className="text-brand-500" />
              <p className="text-xs text-slate-400 font-medium">Total arrecadado</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(summary.totalPaidAmount)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-amber-500" />
              <p className="text-xs text-slate-400 font-medium">A receber</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{formatCurrency(summary.totalPendingAmount)}</p>
          </div>
          <div className={cn(
            "border rounded-2xl p-4 shadow-sm",
            summary.totalOverdueAmount > 0 ? "bg-red-50 border-red-200" : "bg-white border-slate-200"
          )}>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle size={16} className={summary.totalOverdueAmount > 0 ? "text-red-500" : "text-slate-400"} />
              <p className="text-xs text-slate-400 font-medium">Em atraso</p>
            </div>
            <p className={cn("text-xl font-bold", summary.totalOverdueAmount > 0 ? "text-red-600" : "text-slate-900")}>
              {formatCurrency(summary.totalOverdueAmount)}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign size={16} className="text-slate-400" />
              <p className="text-xs text-slate-400 font-medium">Planos ativos</p>
            </div>
            <p className="text-xl font-bold text-slate-900">{summary.totalPlans}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={16} className="text-red-400" />
              <p className="text-xs text-slate-400 font-medium">Inadimplentes</p>
            </div>
            <p className={cn("text-xl font-bold", summary.totalOverdue > 0 ? "text-red-600" : "text-slate-900")}>
              {summary.totalOverdue}
            </p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-1">
              <Clock size={16} className="text-amber-400" />
              <p className="text-xs text-slate-400 font-medium">Vence em breve</p>
            </div>
            <p className={cn("text-xl font-bold", summary.totalDueSoon > 0 ? "text-amber-600" : "text-slate-900")}>
              {summary.totalDueSoon}
            </p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {(["all", "overdue", "due_soon", "ok"] as const).map(f => {
          const labels = { all: "Todos", overdue: "Inadimplentes", due_soon: "Vence em breve", ok: "Em dia" };
          const counts = {
            all: plans.length,
            overdue: plans.filter(p => p.stats.health === "overdue").length,
            due_soon: plans.filter(p => p.stats.health === "due_soon").length,
            ok: plans.filter(p => p.stats.health === "ok").length,
          };
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all",
                filter === f
                  ? "bg-brand-600 text-white shadow"
                  : "bg-white border border-slate-200 text-slate-600 hover:border-brand-300"
              )}
            >
              {labels[f]}
              {counts[f] > 0 && (
                <span className={cn("ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold",
                  filter === f ? "bg-white/20" : "bg-slate-100"
                )}>
                  {counts[f]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <RefreshCw size={16} className="animate-spin" /> Carregando...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            {filter === "all" ? "Nenhum plano de parcelamento ativo." : "Nenhuma reserva nessa categoria."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => (
            <PlanCard
              key={entry.reservationId}
              entry={entry}
              onManualPay={handleManualPay}
            />
          ))}
        </div>
      )}
    </div>
  );
}
