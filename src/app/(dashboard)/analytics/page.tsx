"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, ComposedChart, Line,
} from "recharts";
import { ArrowUpRight, ArrowDownRight, TrendingUp, BarChart3, Zap } from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import toast from "react-hot-toast";

interface RevenueData {
  month: string;
  receita: number;
  despesas: number;
  lucro: number;
}

interface OccupancyData {
  name: string;
  taxa: number;
  reservas: number;
  nights: number;
}

interface KPIs {
  ticketMedio: number;
  receitaTotal: number;
  despesasTotal: number;
  lucroLiquido: number;
  taxaOcupacaoMedia: number;
  totalReservas: number;
  variacaoReceita: number;
  variacaoOcupacao: number;
}

interface TopProperty {
  name: string;
  receita: number;
  reservas: number;
}

interface AnalyticsData {
  revenueByMonth: RevenueData[];
  occupancyByProperty: OccupancyData[];
  kpis: KPIs;
  topProperties: TopProperty[];
}

function VariationBadge({ value }: { value: number }) {
  const isPositive = value >= 0;
  return (
    <div className={`flex items-center gap-1 ${isPositive ? "text-green-600" : "text-red-600"}`}>
      {isPositive ? (
        <ArrowUpRight className="w-4 h-4" />
      ) : (
        <ArrowDownRight className="w-4 h-4" />
      )}
      <span className="text-sm font-semibold">{Math.abs(value).toFixed(1)}%</span>
    </div>
  );
}

function KPICard({
  title,
  value,
  variation,
  icon: Icon,
}: {
  title: string;
  value: string;
  variation: number;
  icon: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card p-6"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-gray-600 mb-2">{title}</p>
          <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
          <div className="mt-4">
            <VariationBadge value={variation} />
          </div>
        </div>
        <div className="text-3xl opacity-20">{Icon}</div>
      </div>
    </motion.div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="card p-6 h-32 animate-pulse bg-gray-200" />
        ))}
      </div>
      <div className="card p-6 h-80 animate-pulse bg-gray-200" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 h-80 animate-pulse bg-gray-200" />
        <div className="card p-6 h-80 animate-pulse bg-gray-200" />
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState("12");

  useEffect(() => {
    loadAnalytics();
  }, [months]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/analytics?months=${months}`);
      if (!res.ok) throw new Error();
      const analytics = await res.json();
      setData(analytics);
    } catch {
      toast.error("Erro ao carregar análises");
    } finally {
      setLoading(false);
    }
  }

  if (loading || !data) return <AnalyticsSkeleton />;

  const { kpis, revenueByMonth, occupancyByProperty, topProperties } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard Analítico</h1>
        <div className="flex gap-2">
          {["3", "6", "12"].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={`px-4 py-2 rounded-lg font-medium transition ${
                months === m
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-200 text-gray-700 hover:bg-gray-300"
              }`}
            >
              {m}m
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          title="Receita Total"
          value={formatCurrency(kpis.receitaTotal)}
          variation={kpis.variacaoReceita}
          icon={<TrendingUp className="w-8 h-8" />}
        />
        <KPICard
          title="Ticket Médio"
          value={formatCurrency(kpis.ticketMedio)}
          variation={kpis.variacaoReceita}
          icon={<Zap className="w-8 h-8" />}
        />
        <KPICard
          title="Taxa de Ocupação"
          value={`${kpis.taxaOcupacaoMedia}%`}
          variation={kpis.variacaoOcupacao}
          icon={<BarChart3 className="w-8 h-8" />}
        />
        <KPICard
          title="Lucro Líquido"
          value={formatCurrency(kpis.lucroLiquido)}
          variation={kpis.variacaoReceita}
          icon={<TrendingUp className="w-8 h-8" />}
        />
      </div>

      {/* Revenue Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6"
      >
        <h2 className="text-lg font-bold text-gray-900 mb-6">Receita vs Despesas</h2>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={revenueByMonth}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              labelFormatter={(label) => `Mês: ${label}`}
            />
            <Legend />
            <Area
              type="monotone"
              dataKey="receita"
              fill="#6366f1"
              stroke="#4f46e5"
              name="Receita"
            />
            <Area
              type="monotone"
              dataKey="despesas"
              fill="#ef4444"
              stroke="#dc2626"
              name="Despesas"
            />
            <Line
              type="monotone"
              dataKey="lucro"
              stroke="#10b981"
              strokeWidth={2}
              name="Lucro"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Occupancy Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6">Taxa de Ocupação por Imóvel</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart
              data={occupancyByProperty}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={120} />
              <Tooltip formatter={(value) => `${value}%`} />
              <Bar dataKey="taxa" fill="#6366f1" />
            </BarChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Top Properties Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-6"
        >
          <h2 className="text-lg font-bold text-gray-900 mb-6">Top Imóveis por Receita</h2>
          <div className="space-y-3">
            {topProperties.map((prop, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">
                    {idx + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{prop.name}</p>
                    <p className="text-xs text-gray-600">{prop.reservas} reservas</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900">{formatCurrency(prop.receita)}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Summary Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card p-6 grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        <div className="text-center">
          <p className="text-gray-600 text-sm mb-1">Total de Reservas</p>
          <p className="text-2xl font-bold text-gray-900">{kpis.totalReservas}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-600 text-sm mb-1">Despesas Totais</p>
          <p className="text-2xl font-bold text-red-600">{formatCurrency(kpis.despesasTotal)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-600 text-sm mb-1">Margem Líquida</p>
          <p className="text-2xl font-bold text-green-600">
            {kpis.receitaTotal > 0
              ? Math.round((kpis.lucroLiquido / kpis.receitaTotal) * 100)
              : 0}
            %
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-600 text-sm mb-1">Ocupação Média</p>
          <p className="text-2xl font-bold text-indigo-600">{kpis.taxaOcupacaoMedia}%</p>
        </div>
      </motion.div>
    </div>
  );
}
