"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3,
  ArrowUpRight, ArrowDownRight, Plus, X, Loader2, ChevronDown,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend,
} from "recharts";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Transaction {
  id: string;
  type: "INCOME" | "EXPENSE";
  category: string;
  description: string;
  amount: number | string;
  isPaid: boolean;
  paidAt?: string;
  createdAt: string;
  reservation?: { code: string; guestName: string } | null;
}

interface FinancialSummary {
  income: number;
  expenses: number;
  netProfit: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  RESERVATION_INCOME: "Reserva",
  OWNER_REPASSE: "Repasse Proprietário",
  CLEANING_COST: "Custo de Limpeza",
  MAINTENANCE: "Manutenção",
  COMMISSION: "Comissão",
  OTHER: "Outros",
};

export default function FinancialPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [monthlyData, setMonthlyData] = useState<unknown[]>([]);
  const [period, setPeriod] = useState("month");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadData();
  }, [period]);

  async function loadData() {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/financial?period=${period}`);
      const data = await res.json();
      setTransactions(data.transactions);
      setSummary(data.summary);
      // Format monthly data for chart
      const formatted = (data.monthlyData || []).map((d: Record<string, unknown>) => ({
        month: format(new Date(d.month as string), "MMM", { locale: ptBR }),
        Receita: Number(d.income),
        Despesas: Number(d.expenses),
      }));
      setMonthlyData(formatted);
    } catch {
      toast.error("Erro ao carregar financeiro");
    } finally {
      setLoading(false);
    }
  }

  async function markAsPaid(id: string) {
    try {
      const res = await apiRequest(`/api/financial/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPaid: true, paidAt: new Date().toISOString() }),
      });
      if (!res.ok) throw new Error();
      setTransactions((prev) =>
        prev.map((t) => t.id === id ? { ...t, isPaid: true, paidAt: new Date().toISOString() } : t)
      );
      toast.success("Marcado como pago!");
    } catch {
      toast.error("Erro ao atualizar");
    }
  }

  if (loading) return <FinancialSkeleton />;

  const profitMargin = summary && summary.income > 0
    ? Math.round((summary.netProfit / summary.income) * 100)
    : 0;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Financeiro</h1>
          <p className="text-sm text-slate-400">Controle de receitas e despesas</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="input-base py-2 pr-8 text-sm appearance-none"
            >
              <option value="month">Este mês</option>
              <option value="year">Este ano</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-3 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card text-center">
          <div className="w-8 h-8 bg-green-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <ArrowUpRight size={16} className="text-green-600" />
          </div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Receita</p>
          <p className="text-base font-bold text-green-600 mt-1">{formatCurrency(summary?.income ?? 0)}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card text-center">
          <div className="w-8 h-8 bg-red-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <ArrowDownRight size={16} className="text-red-500" />
          </div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Despesas</p>
          <p className="text-base font-bold text-red-500 mt-1">{formatCurrency(summary?.expenses ?? 0)}</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="card text-center">
          <div className="w-8 h-8 bg-brand-50 rounded-xl flex items-center justify-center mx-auto mb-2">
            <TrendingUp size={16} className="text-brand-600" />
          </div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase">Lucro</p>
          <p className={cn("text-base font-bold mt-1", (summary?.netProfit ?? 0) >= 0 ? "text-brand-600" : "text-red-500")}>
            {formatCurrency(summary?.netProfit ?? 0)}
          </p>
        </motion.div>
      </div>

      {/* Profit margin banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.15 }}
        className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5 mb-5 text-white"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-slate-400 text-sm">Margem de Lucro</p>
            <p className="text-4xl font-bold mt-1">{profitMargin}%</p>
          </div>
          <BarChart3 className="w-10 h-10 text-slate-500" />
        </div>
        <div className="mt-3 bg-slate-700 rounded-full h-2">
          <div
            className="bg-brand-400 rounded-full h-2 transition-all duration-700"
            style={{ width: `${Math.max(0, Math.min(100, profitMargin))}%` }}
          />
        </div>
      </motion.div>

      {/* Chart */}
      {monthlyData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="card mb-5"
        >
          <h2 className="font-semibold text-slate-900 mb-4">Evolução Anual</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(v: number) => formatCurrency(v)}
                contentStyle={{ borderRadius: "12px", border: "1px solid #e2e8f0", fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              <Bar dataKey="Receita" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Transactions list */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="card"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Transações</h2>
          <button onClick={() => setShowAddModal(true)} className="btn-primary py-1.5 px-3 text-xs">
            <Plus size={14} /> Adicionar
          </button>
        </div>

        {transactions.length === 0 ? (
          <p className="text-center text-slate-400 text-sm py-6">Nenhuma transação encontrada</p>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                <div className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                  tx.type === "INCOME" ? "bg-green-50" : "bg-red-50"
                )}>
                  {tx.type === "INCOME"
                    ? <ArrowUpRight size={16} className="text-green-600" />
                    : <ArrowDownRight size={16} className="text-red-500" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{tx.description}</p>
                  <p className="text-xs text-slate-400">{CATEGORY_LABELS[tx.category] ?? tx.category}</p>
                  {tx.reservation && (
                    <p className="text-xs text-brand-500 font-mono">{tx.reservation.code}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={cn("font-bold text-sm", tx.type === "INCOME" ? "text-green-600" : "text-red-500")}>
                    {tx.type === "INCOME" ? "+" : "-"}{formatCurrency(Number(tx.amount))}
                  </p>
                  {!tx.isPaid && tx.type === "EXPENSE" ? (
                    <button
                      onClick={() => markAsPaid(tx.id)}
                      className="text-[10px] text-brand-600 font-medium mt-0.5 hover:underline"
                    >Marcar pago</button>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-0.5">{tx.isPaid ? "✓ Pago" : "Pendente"}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function FinancialSkeleton() {
  return (
    <div className="max-w-2xl mx-auto space-y-4 pt-4">
      <div className="skeleton h-8 w-40 rounded-xl" />
      <div className="grid grid-cols-3 gap-3">
        {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="skeleton h-20 rounded-2xl" />
      <div className="skeleton h-52 rounded-2xl" />
      <div className="skeleton h-64 rounded-2xl" />
    </div>
  );
}
