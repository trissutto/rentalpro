"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2, Plus, X, AlertCircle, CheckCircle2, Save, RefreshCw,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Property {
  id: string;
  name: string;
}

interface Expense {
  id: string;
  propertyId: string;
  propertyName: string;
  category: string;
  description: string;
  amount: number;
  isPaid: boolean;
  paidAt: string | null;
  createdAt: string;
}

// ── Category definitions ──────────────────────────────────────────────────────
const FIXED_CATEGORIES = [
  { key: "AGUA",     label: "Água",     icon: "💧", color: "bg-blue-50 border-blue-200" },
  { key: "LUZ",      label: "Luz",      icon: "⚡", color: "bg-yellow-50 border-yellow-200" },
  { key: "IPTU",     label: "IPTU",     icon: "🏛️", color: "bg-orange-50 border-orange-200" },
  { key: "INTERNET", label: "Internet", icon: "🌐", color: "bg-indigo-50 border-indigo-200" },
  { key: "JARDIM",   label: "Jardim",   icon: "🌿", color: "bg-green-50 border-green-200" },
  { key: "PISCINA",  label: "Piscina",  icon: "🏊", color: "bg-cyan-50 border-cyan-200" },
];

const VARIABLE_CATEGORIES = [
  { key: "MAINTENANCE",   label: "Manutenção",  icon: "🔧" },
  { key: "SUPPLIES",      label: "Suprimentos", icon: "📦" },
  { key: "CLEANING_COST", label: "Limpeza",     icon: "🧹" },
  { key: "INSURANCE",     label: "Seguro",      icon: "🛡️" },
  { key: "OTHER",         label: "Outros",      icon: "📌" },
];

const ALL_CATEGORIES = [...FIXED_CATEGORIES, ...VARIABLE_CATEGORIES];

function getCategoryMeta(key: string) {
  return ALL_CATEGORIES.find((c) => c.key === key) ?? { key, label: key, icon: "📌" };
}

// ── Fixed expense row state ───────────────────────────────────────────────────
interface FixedRow {
  category: string;
  amount: string;
  isPaid: boolean;
  paidAt: string;
}

function buildDefaultRows(): FixedRow[] {
  return FIXED_CATEGORIES.map((c) => ({
    category: c.key,
    amount: "",
    isPaid: false,
    paidAt: "",
  }));
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function ExpenseSkeleton() {
  return (
    <div className="space-y-6">
      <div className="card p-6 h-16 animate-pulse bg-gray-100 rounded-2xl" />
      <div className="card p-6 h-72 animate-pulse bg-gray-100 rounded-2xl" />
      <div className="card p-6 h-48 animate-pulse bg-gray-100 rounded-2xl" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"fixed" | "variable">("fixed");

  // Shared filters
  const [filterProperty, setFilterProperty] = useState("");
  const [filterMonth, setFilterMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Fixed tab state
  const [fixedRows, setFixedRows] = useState<FixedRow[]>(buildDefaultRows());
  const [savingFixed, setSavingFixed] = useState(false);

  // Variable tab state
  const [varExpenses, setVarExpenses] = useState<Expense[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    propertyId: "",
    category: "MAINTENANCE",
    description: "",
    amount: "",
    paidAt: "",
    isPaid: false,
  });

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadProperties();
  }, []);

  useEffect(() => {
    if (filterProperty) {
      if (activeTab === "fixed") loadFixedExpenses();
      else loadVariableExpenses();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterProperty, filterMonth, activeTab]);

  async function loadProperties() {
    setLoading(true);
    try {
      const res = await apiRequest("/api/properties");
      if (res.ok) {
        const data = await res.json();
        const props: Property[] = data.properties || [];
        setProperties(props);
        if (props.length > 0) {
          setFilterProperty(props[0].id);
          setFormData((f) => ({ ...f, propertyId: props[0].id }));
        }
      }
    } catch {
      toast.error("Erro ao carregar imóveis");
    } finally {
      setLoading(false);
    }
  }

  async function loadFixedExpenses() {
    try {
      const res = await apiRequest(
        `/api/expenses?propertyId=${filterProperty}&month=${filterMonth}&expenseType=fixed`
      );
      if (!res.ok) return;
      const data = await res.json();
      const existing: Expense[] = data.expenses || [];

      // Merge with defaults — one row per fixed category
      const rows = buildDefaultRows().map((row) => {
        const found = existing.find((e) => e.category === row.category);
        if (found) {
          return {
            category: found.category,
            amount: String(found.amount),
            isPaid: found.isPaid,
            paidAt: found.paidAt ? found.paidAt.slice(0, 10) : "",
          };
        }
        return row;
      });
      setFixedRows(rows);
    } catch {
      toast.error("Erro ao carregar despesas fixas");
    }
  }

  async function loadVariableExpenses() {
    try {
      const res = await apiRequest(
        `/api/expenses?propertyId=${filterProperty}&month=${filterMonth}&expenseType=variable`
      );
      if (!res.ok) return;
      const data = await res.json();
      setVarExpenses(data.expenses || []);
    } catch {
      toast.error("Erro ao carregar despesas variáveis");
    }
  }

  // ── Save fixed ─────────────────────────────────────────────────────────────
  async function handleSaveFixed() {
    if (!filterProperty || !filterMonth) {
      toast.error("Selecione um imóvel e mês");
      return;
    }
    setSavingFixed(true);
    try {
      const items = fixedRows.map((r) => ({
        category: r.category,
        description: getCategoryMeta(r.category).label,
        amount: parseFloat(r.amount) || 0,
        isPaid: r.isPaid,
        paidAt: r.paidAt || null,
      }));

      const res = await apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          bulkFixed: true,
          propertyId: filterProperty,
          month: filterMonth,
          items,
        }),
      });

      if (!res.ok) throw new Error();
      toast.success("Despesas fixas salvas!");
    } catch {
      toast.error("Erro ao salvar despesas fixas");
    } finally {
      setSavingFixed(false);
    }
  }

  // ── Add variable expense ───────────────────────────────────────────────────
  async function handleAddExpense(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.propertyId || !formData.description || !formData.amount) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    try {
      const res = await apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify({
          propertyId: formData.propertyId,
          category: formData.category,
          description: formData.description,
          amount: parseFloat(formData.amount),
          paidAt: formData.paidAt || null,
          isPaid: formData.isPaid,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Despesa lançada!");
      setFormData((f) => ({ ...f, category: "MAINTENANCE", description: "", amount: "", paidAt: "", isPaid: false }));
      setShowForm(false);
      loadVariableExpenses();
    } catch {
      toast.error("Erro ao criar despesa");
    }
  }

  async function handleDeleteExpense(id: string) {
    if (!confirm("Deletar esta despesa?")) return;
    try {
      const res = await apiRequest(`/api/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Despesa deletada!");
      loadVariableExpenses();
    } catch {
      toast.error("Erro ao deletar");
    }
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const fixedTotal = fixedRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const fixedPaid  = fixedRows.filter((r) => r.isPaid).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const varTotal   = varExpenses.reduce((s, e) => s + e.amount, 0);

  if (loading) return <ExpenseSkeleton />;

  const selectedPropName = properties.find((p) => p.id === filterProperty)?.name ?? "";

  // ── Month label for display ─────────────────────────────────────────────────
  const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const [yy, mm] = filterMonth.split("-");
  const monthLabel = `${MONTHS[parseInt(mm) - 1]}/${yy}`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-3xl font-bold text-slate-900">Gestão de Despesas</h1>
        {activeTab === "variable" && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary flex items-center gap-2"
          >
            {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showForm ? "Cancelar" : "Lançar Despesa"}
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card p-4 flex gap-4 flex-wrap items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Imóvel</label>
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="input-base"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide">Mês de referência</label>
          <input
            type="month"
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="input-base"
          />
        </div>
        <div className="text-sm text-slate-500 pb-1">
          📍 {selectedPropName} — {monthLabel}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
        <button
          onClick={() => setActiveTab("fixed")}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "fixed"
              ? "bg-white shadow text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          📋 Despesas Fixas
        </button>
        <button
          onClick={() => setActiveTab("variable")}
          className={`px-5 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "variable"
              ? "bg-white shadow text-slate-900"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          🔧 Despesas Variáveis
        </button>
      </div>

      <AnimatePresence mode="wait">
        {/* ── FIXED TAB ──────────────────────────────────────────────────────── */}
        {activeTab === "fixed" && (
          <motion.div
            key="fixed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Total Fixo</p>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(fixedTotal)}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Pago</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(fixedPaid)}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Pendente</p>
                <p className="text-xl font-bold text-amber-600">{formatCurrency(fixedTotal - fixedPaid)}</p>
              </div>
            </div>

            {/* Grid of fixed expense inputs */}
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Contas do Mês — {monthLabel}</h2>
                  <p className="text-sm text-slate-500 mt-0.5">Preencha os valores e marque o que já foi pago</p>
                </div>
                <button
                  onClick={() => loadFixedExpenses()}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
                  title="Recarregar"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {FIXED_CATEGORIES.map((cat, idx) => {
                  const row = fixedRows[idx];
                  const meta = FIXED_CATEGORIES.find((c) => c.key === cat.key)!;
                  return (
                    <div
                      key={cat.key}
                      className={`border-2 rounded-2xl p-4 space-y-3 transition-all ${
                        row.isPaid ? "border-green-300 bg-green-50" : meta.color
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{meta.icon}</span>
                          <span className="font-semibold text-slate-800">{meta.label}</span>
                        </div>
                        {row.isPaid ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-amber-400" />
                        )}
                      </div>

                      {/* Value input */}
                      <div>
                        <label className="text-xs text-slate-500 font-medium">Valor (R$)</label>
                        <div className="flex items-center mt-1 rounded-xl border border-slate-200 bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-500 focus-within:border-brand-500">
                          <span className="px-3 py-2 text-sm font-semibold text-slate-500 bg-slate-50 border-r border-slate-200 select-none">R$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={row.amount}
                            onChange={(e) => {
                              const updated = [...fixedRows];
                              updated[idx] = { ...updated[idx], amount: e.target.value };
                              setFixedRows(updated);
                            }}
                            className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                            placeholder="0,00"
                          />
                        </div>
                      </div>

                      {/* Paid toggle */}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <div
                          onClick={() => {
                            const updated = [...fixedRows];
                            updated[idx] = {
                              ...updated[idx],
                              isPaid: !updated[idx].isPaid,
                              paidAt: !updated[idx].isPaid
                                ? new Date().toISOString().slice(0, 10)
                                : "",
                            };
                            setFixedRows(updated);
                          }}
                          className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 cursor-pointer ${
                            row.isPaid ? "bg-green-500" : "bg-slate-300"
                          }`}
                        >
                          <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${
                            row.isPaid ? "translate-x-4" : "translate-x-0"
                          }`} />
                        </div>
                        <span className={`text-sm font-medium ${row.isPaid ? "text-green-700" : "text-slate-500"}`}>
                          {row.isPaid ? "Pago" : "Pendente"}
                        </span>
                      </label>

                      {/* Payment date (when paid) */}
                      {row.isPaid && (
                        <div>
                          <label className="text-xs text-slate-500 font-medium">Data pagamento</label>
                          <input
                            type="date"
                            value={row.paidAt}
                            onChange={(e) => {
                              const updated = [...fixedRows];
                              updated[idx] = { ...updated[idx], paidAt: e.target.value };
                              setFixedRows(updated);
                            }}
                            className="input-base mt-1"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <button
                onClick={handleSaveFixed}
                disabled={savingFixed || !filterProperty}
                className="btn-primary w-full flex items-center justify-center gap-2 mt-2"
              >
                {savingFixed ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {savingFixed ? "Salvando..." : "Salvar Despesas Fixas"}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── VARIABLE TAB ───────────────────────────────────────────────────── */}
        {activeTab === "variable" && (
          <motion.div
            key="variable"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            {/* Add form */}
            <AnimatePresence>
              {showForm && (
                <motion.form
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  onSubmit={handleAddExpense}
                  className="card p-6 space-y-4"
                >
                  <h2 className="text-lg font-bold text-slate-900">Lançar Despesa Variável</h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Imóvel*</label>
                      <select
                        value={formData.propertyId}
                        onChange={(e) => setFormData({ ...formData, propertyId: e.target.value })}
                        className="input-base"
                        required
                      >
                        <option value="">Selecione</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Categoria*</label>
                      <select
                        value={formData.category}
                        onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                        className="input-base"
                        required
                      >
                        {VARIABLE_CATEGORIES.map((cat) => (
                          <option key={cat.key} value={cat.key}>{cat.icon} {cat.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Descrição*</label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="input-base"
                      placeholder="Ex: Troca de torneira, Compra de suprimentos..."
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Valor (R$)*</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="input-base"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Data pagamento</label>
                      <input
                        type="date"
                        value={formData.paidAt}
                        onChange={(e) => setFormData({ ...formData, paidAt: e.target.value })}
                        className="input-base"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isPaid}
                      onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked })}
                      className="w-4 h-4 accent-brand-600"
                    />
                    <span className="text-sm font-medium text-slate-700">Marcado como pago</span>
                  </label>

                  <button type="submit" className="btn-primary w-full">Criar Despesa</button>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Total Variável</p>
                <p className="text-xl font-bold text-slate-800">{formatCurrency(varTotal)}</p>
              </div>
              <div className="card p-4 text-center">
                <p className="text-xs text-slate-500 mb-1">Registros</p>
                <p className="text-xl font-bold text-slate-800">{varExpenses.length}</p>
              </div>
            </div>

            {/* List */}
            <div className="card p-6 space-y-3">
              <h2 className="text-lg font-bold text-slate-900">
                Despesas Variáveis — {monthLabel}
              </h2>

              {varExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
                  <span className="text-4xl">📋</span>
                  <p>Nenhuma despesa variável neste mês</p>
                  <button
                    onClick={() => setShowForm(true)}
                    className="mt-2 text-sm text-brand-600 font-medium hover:underline"
                  >
                    + Lançar despesa
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {varExpenses.map((expense) => {
                    const meta = getCategoryMeta(expense.category);
                    return (
                      <div
                        key={expense.id}
                        className="flex items-center justify-between p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition"
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-2xl">{meta.icon}</span>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-900">{expense.description}</p>
                            <p className="text-xs text-slate-500">
                              {meta.label} · {formatDate(expense.createdAt)}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="font-bold text-slate-900">{formatCurrency(expense.amount)}</p>
                            {expense.isPaid ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" /> Pago
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                                <AlertCircle className="w-3 h-3" /> Pendente
                              </span>
                            )}
                          </div>
                          <button
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="p-2 text-red-400 hover:bg-red-50 rounded-lg transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Total across both tabs */}
      <div className="card p-4 flex items-center justify-between bg-slate-900 text-white rounded-2xl">
        <span className="text-sm font-medium text-slate-300">Total despesas do mês ({selectedPropName})</span>
        <span className="text-xl font-bold">{formatCurrency(fixedTotal + varTotal)}</span>
      </div>
    </div>
  );
}
