"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  Trash2,
  ToggleRight,
  ToggleLeft,
  Loader2,
  Zap,
  Gift,
  AlertCircle,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

interface PricingRule {
  id: string;
  name: string;
  type: string;
  daysOfWeek: string | null;
  startDate: string | null;
  endDate: string | null;
  priceType: string;
  value: number;
  priority: number;
  minNights: number;
  active: boolean;
  createdAt?: string;
}

interface Property {
  id: string;
  name: string;
  basePrice: number;
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function PricingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  // Main state
  const [property, setProperty] = useState<Property | null>(null);
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"coefficients" | "holidays" | "packages">("coefficients");

  // Tab 1: Coefficients
  const [weekdayMultiplier, setWeekdayMultiplier] = useState(0.85);
  const [weekendMultiplier, setWeekendMultiplier] = useState(1.2);
  const [holidayMultiplier, setHolidayMultiplier] = useState(1.3);
  const [applyingCoeff, setApplyingCoeff] = useState(false);

  // Tab 2: Holidays
  const [generatingYear, setGeneratingYear] = useState<2026 | 2027 | null>(null);

  // Tab 3: Packages
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editingPackagePrice, setEditingPackagePrice] = useState("");
  const [editingMinNightsId, setEditingMinNightsId] = useState<string | null>(null);
  const [editingMinNights, setEditingMinNights] = useState("");

  // Load data
  useEffect(() => {
    Promise.all([
      apiRequest(`/api/properties/${id}`).then((r) => r.json()),
      apiRequest(`/api/pricing-rules?propertyId=${id}`).then((r) => r.json()),
    ])
      .then(([propData, rulesData]) => {
        setProperty(propData.property || null);
        setRules(rulesData.rules || []);
      })
      .catch((err) => toast.error("Erro ao carregar dados"))
      .finally(() => setLoading(false));
  }, [id]);

  // Tab 1: Apply coefficients
  async function applyCoefficients() {
    if (!property) return;
    setApplyingCoeff(true);
    try {
      // Create or update 3 MULTIPLIER rules
      const coeffRules = [
        {
          propertyId: id,
          name: "Dias úteis (Seg-Qui)",
          type: "WEEKDAY",
          priceType: "MULTIPLIER",
          daysOfWeek: [1, 2, 3, 4], // Mon-Thu
          value: weekdayMultiplier,
          priority: 5,
        },
        {
          propertyId: id,
          name: "Fim de semana (Sex-Dom)",
          type: "WEEKEND",
          priceType: "MULTIPLIER",
          daysOfWeek: [5, 6, 0], // Fri-Sat-Sun
          value: weekendMultiplier,
          priority: 5,
          minNights: 2,  // mínimo 2 noites no fim de semana
        },
        {
          propertyId: id,
          name: "Feriados",
          type: "HOLIDAY_BASE",
          priceType: "MULTIPLIER",
          daysOfWeek: null,
          startDate: null,
          endDate: null,
          value: holidayMultiplier,
          priority: 8,
        },
      ];

      // Delete existing coefficient rules first
      await apiRequest(`/api/pricing-rules?propertyId=${id}`, {
        method: "GET",
      })
        .then((r) => r.json())
        .then(async (data) => {
          const existingCoeff = (data.rules || []).filter(
            (r: PricingRule) =>
              r.type === "WEEKDAY" || r.type === "WEEKEND" || r.type === "HOLIDAY_BASE"
          );
          for (const rule of existingCoeff) {
            await apiRequest(`/api/pricing-rules/${rule.id}`, {
              method: "DELETE",
            });
          }
        });

      // Create new ones
      for (const rule of coeffRules) {
        await apiRequest("/api/pricing-rules", {
          method: "POST",
          body: JSON.stringify(rule),
        });
      }

      // Refresh rules
      const rulesData = await apiRequest(
        `/api/pricing-rules?propertyId=${id}`
      ).then((r) => r.json());
      setRules(rulesData.rules || []);

      toast.success("Coeficientes aplicados!");
    } catch (err) {
      toast.error("Erro ao aplicar coeficientes");
    } finally {
      setApplyingCoeff(false);
    }
  }

  // Tab 2: Generate holidays
  async function generateHolidays(year: 2026 | 2027) {
    setGeneratingYear(year);
    try {
      const res = await apiRequest("/api/pricing-rules/generate-holidays", {
        method: "POST",
        body: JSON.stringify({
          propertyId: id,
          year,
          baseMultiplier: holidayMultiplier,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }

      const data = await res.json();
      toast.success(`${data.created} regras criadas (${data.packages} pacotes)`);

      // Refresh rules
      const rulesData = await apiRequest(
        `/api/pricing-rules?propertyId=${id}`
      ).then((r) => r.json());
      setRules(rulesData.rules || []);
    } catch (err: any) {
      toast.error(err.message || "Erro ao gerar feriados");
    } finally {
      setGeneratingYear(null);
    }
  }

  // Update package price
  async function updatePackagePrice(ruleId: string, newPrice: number) {
    try {
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) return;

      await apiRequest(`/api/pricing-rules/${ruleId}`, {
        method: "PUT",
        body: JSON.stringify({
          ...rule,
          value: newPrice,
        }),
      });

      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, value: newPrice } : r))
      );
      setEditingPackageId(null);
      toast.success("Preço atualizado!");
    } catch (err) {
      toast.error("Erro ao atualizar preço");
    }
  }

  // Update package minNights
  async function updateMinNights(ruleId: string, nights: number) {
    try {
      const rule = rules.find((r) => r.id === ruleId);
      if (!rule) return;
      await apiRequest(`/api/pricing-rules/${ruleId}`, {
        method: "PUT",
        body: JSON.stringify({ ...rule, minNights: nights }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, minNights: nights } : r))
      );
      setEditingMinNightsId(null);
      toast.success("Estadia mínima atualizada!");
    } catch {
      toast.error("Erro ao atualizar estadia mínima");
    }
  }

  // Toggle rule active
  async function toggleRule(rule: PricingRule) {
    try {
      await apiRequest(`/api/pricing-rules/${rule.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...rule, active: !rule.active }),
      });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, active: !r.active } : r))
      );
    } catch {
      toast.error("Erro ao atualizar regra");
    }
  }

  // Delete rule
  async function deleteRule(id: string) {
    if (!confirm("Remover esta regra?")) return;
    try {
      await apiRequest(`/api/pricing-rules/${id}`, { method: "DELETE" });
      setRules((prev) => prev.filter((r) => r.id !== id));
      toast.success("Regra removida");
    } catch {
      toast.error("Erro ao remover regra");
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-slate-300" />
        </div>
      </div>
    );
  }

  const basePrice = property?.basePrice || 500;

  // Calculate preview prices
  const weekdayPrice = Math.round(basePrice * weekdayMultiplier * 100) / 100;
  const weekdayPercent =
    ((weekdayMultiplier - 1) * 100).toFixed(0);
  const weekendPrice = Math.round(basePrice * weekendMultiplier * 100) / 100;
  const weekendPercent =
    ((weekendMultiplier - 1) * 100).toFixed(0);
  const holidayPrice = Math.round(basePrice * holidayMultiplier * 100) / 100;
  const holidayPercent =
    ((holidayMultiplier - 1) * 100).toFixed(0);

  // Get rules by type
  const coefficientRules = rules.filter((r) =>
    ["WEEKDAY", "WEEKEND", "HOLIDAY_BASE"].includes(r.type)
  );
  const holidayRules = rules.filter((r) => r.type === "HOLIDAY");
  const packageRules = rules.filter((r) => r.type === "PACKAGE");
  const otherRules = rules.filter(
    (r) =>
      !["WEEKDAY", "WEEKEND", "HOLIDAY_BASE", "HOLIDAY", "PACKAGE"].includes(
        r.type
      )
  );

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 mb-5 text-sm"
      >
        <ChevronLeft size={16} /> Voltar
      </button>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Precificação</h1>
        <p className="text-slate-500 text-sm mt-1">
          {property?.name} · Base R$ {basePrice.toFixed(2)}
        </p>
      </div>

      {/* Tab selector */}
      <div className="mb-8 bg-slate-100 p-1 rounded-2xl flex gap-1 w-fit">
        {[
          { key: "coefficients", label: "Coeficientes" },
          { key: "holidays", label: "Feriados & Calendário" },
          { key: "packages", label: "Pacotes Promocionais" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() =>
              setActiveTab(tab.key as "coefficients" | "holidays" | "packages")
            }
            className={cn(
              "px-4 py-2 rounded-xl font-medium text-sm transition",
              activeTab === tab.key
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: COEFFICIENTS */}
      <AnimatePresence mode="wait">
        {activeTab === "coefficients" && (
          <motion.div
            key="coefficients"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Coefficient Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Weekday */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-4">
                  Dias úteis (Seg-Qui)
                </p>
                <div className="space-y-4">
                  <div>
                    <input
                      type="range"
                      min="0.5"
                      max="1"
                      step="0.05"
                      value={weekdayMultiplier}
                      onChange={(e) =>
                        setWeekdayMultiplier(parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      min="0.5"
                      max="1"
                      step="0.05"
                      value={weekdayMultiplier}
                      onChange={(e) =>
                        setWeekdayMultiplier(parseFloat(e.target.value) || 0.85)
                      }
                      className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-lg"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      {weekdayMultiplier >= 1 ? "+" : ""}
                      {weekdayPercent}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    <p>Base R$ {basePrice.toFixed(2)}</p>
                    <p className="font-semibold text-slate-700 mt-1">
                      → R$ {weekdayPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Weekend */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-4">
                  Fim de semana (Sex-Dom)
                </p>
                <div className="space-y-4">
                  <div>
                    <input
                      type="range"
                      min="1"
                      max="2"
                      step="0.05"
                      value={weekendMultiplier}
                      onChange={(e) =>
                        setWeekendMultiplier(parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      min="1"
                      max="2"
                      step="0.05"
                      value={weekendMultiplier}
                      onChange={(e) =>
                        setWeekendMultiplier(parseFloat(e.target.value) || 1.2)
                      }
                      className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-lg"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      +{weekendPercent}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    <p>Base R$ {basePrice.toFixed(2)}</p>
                    <p className="font-semibold text-slate-700 mt-1">
                      → R$ {weekendPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Holidays */}
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  Feriados normais
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  Feriados isolados (ex: Tiradentes, 7 de Setembro…)<br />
                  Natal, Réveillon e Carnaval são pacotes especiais gerados automaticamente.
                </p>
                <div className="space-y-4">
                  <div>
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={holidayMultiplier}
                      onChange={(e) =>
                        setHolidayMultiplier(parseFloat(e.target.value))
                      }
                      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <input
                      type="number"
                      min="1"
                      max="3"
                      step="0.05"
                      value={holidayMultiplier}
                      onChange={(e) =>
                        setHolidayMultiplier(parseFloat(e.target.value) || 1.3)
                      }
                      className="w-20 px-2 py-1 text-sm border border-slate-200 rounded-lg"
                    />
                    <span className="text-xs font-semibold text-slate-500">
                      +{holidayPercent}%
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-2">
                    <p>Base R$ {basePrice.toFixed(2)}</p>
                    <p className="font-semibold text-slate-700 mt-1">
                      → R$ {holidayPrice.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Apply Button */}
            <button
              onClick={applyCoefficients}
              disabled={applyingCoeff}
              className="w-full py-3 px-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {applyingCoeff ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              Aplicar Coeficientes
            </button>

            {/* Existing Coefficient Rules */}
            {coefficientRules.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">
                  Regras ativas
                </p>
                <div className="space-y-2">
                  {coefficientRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {rule.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {rule.priceType === "MULTIPLIER"
                            ? `${rule.value >= 1 ? "+" : ""}${(
                                (rule.value - 1) *
                                100
                              ).toFixed(0)}%`
                            : `R$ ${rule.value.toFixed(2)}`}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleRule(rule)}
                        className="text-slate-400 hover:text-brand-600"
                      >
                        {rule.active ? (
                          <ToggleRight size={20} className="text-brand-500" />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Other Rules */}
            {otherRules.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">
                  Outras regras
                </p>
                <div className="space-y-2">
                  {otherRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {rule.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {rule.startDate && rule.endDate && (
                            <>
                              {new Date(rule.startDate).toLocaleDateString(
                                "pt-BR"
                              )}{" "}
                              –{" "}
                              {new Date(rule.endDate).toLocaleDateString(
                                "pt-BR"
                              )}
                            </>
                          )}
                        </p>
                      </div>
                      <button
                        onClick={() => toggleRule(rule)}
                        className="text-slate-400 hover:text-brand-600"
                      >
                        {rule.active ? (
                          <ToggleRight size={20} className="text-brand-500" />
                        ) : (
                          <ToggleLeft size={20} />
                        )}
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 2: HOLIDAYS */}
        {activeTab === "holidays" && (
          <motion.div
            key="holidays"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {/* Generate Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => generateHolidays(2026)}
                disabled={generatingYear === 2026}
                className="py-4 px-6 bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-2xl hover:border-orange-300 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {generatingYear === 2026 ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Gift size={18} className="text-orange-600" />
                )}
                <div className="text-left">
                  <p className="font-semibold text-slate-800">
                    🎉 Gerar Feriados 2026
                  </p>
                  <p className="text-xs text-slate-500">
                    {
                      rules.filter(
                        (r) =>
                          r.type === "HOLIDAY" &&
                          r.startDate &&
                          new Date(r.startDate).getFullYear() === 2026
                      ).length
                    }{" "}
                    feriados
                  </p>
                </div>
              </button>

              <button
                onClick={() => generateHolidays(2027)}
                disabled={generatingYear === 2027}
                className="py-4 px-6 bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-2xl hover:border-blue-300 transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {generatingYear === 2027 ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Gift size={18} className="text-blue-600" />
                )}
                <div className="text-left">
                  <p className="font-semibold text-slate-800">
                    🎉 Gerar Feriados 2027
                  </p>
                  <p className="text-xs text-slate-500">
                    {
                      rules.filter(
                        (r) =>
                          r.type === "HOLIDAY" &&
                          r.startDate &&
                          new Date(r.startDate).getFullYear() === 2027
                      ).length
                    }{" "}
                    feriados
                  </p>
                </div>
              </button>
            </div>

            {/* Holidays List */}
            {holidayRules.length > 0 && (
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
                <p className="text-sm font-semibold text-slate-700 mb-3">
                  Feriados configurados
                </p>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {holidayRules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {rule.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {rule.startDate &&
                            new Date(rule.startDate).toLocaleDateString(
                              "pt-BR"
                            )}
                        </p>
                      </div>
                      <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-1 rounded">
                        +{((rule.value - 1) * 100).toFixed(0)}%
                      </span>
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="text-slate-300 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* TAB 3: PACKAGES */}
        {activeTab === "packages" && (
          <motion.div
            key="packages"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-6"
          >
            {packageRules.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center">
                <AlertCircle size={32} className="mx-auto text-slate-300 mb-3" />
                <p className="text-slate-500">
                  Nenhum pacote criado ainda. Use a aba "Feriados" para gerar
                  automaticamente!
                </p>
              </div>
            ) : (
              <>
                {/* Package Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {packageRules.map((rule) => {
                    const startDate = rule.startDate
                      ? new Date(rule.startDate)
                      : null;
                    const endDate = rule.endDate
                      ? new Date(rule.endDate)
                      : null;
                    const nights = startDate && endDate
                      ? Math.ceil(
                          (endDate.getTime() - startDate.getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : 0;
                    const pricePerNight =
                      rule.value > 0 ? (rule.value / nights).toFixed(2) : "—";
                    const isEditing = editingPackageId === rule.id;

                    return (
                      <motion.div
                        key={rule.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800">
                              {rule.name}
                            </p>
                            <p className="text-xs text-slate-500 mt-1">
                              {startDate?.toLocaleDateString("pt-BR")} a{" "}
                              {endDate?.toLocaleDateString("pt-BR")}
                            </p>
                          </div>
                          <button
                            onClick={() => toggleRule(rule)}
                            className="text-slate-400 hover:text-brand-600"
                          >
                            {rule.active ? (
                              <ToggleRight
                                size={20}
                                className="text-brand-500"
                              />
                            ) : (
                              <ToggleLeft size={20} />
                            )}
                          </button>
                        </div>

                        <div className="bg-slate-50 rounded-lg p-3 mb-4">
                          <p className="text-xs text-slate-500 mb-2">
                            {nights} noites
                          </p>
                          {isEditing ? (
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                value={editingPackagePrice}
                                onChange={(e) =>
                                  setEditingPackagePrice(e.target.value)
                                }
                                placeholder="Preço total"
                                className="flex-1 px-2 py-1 text-sm border border-slate-200 rounded-lg"
                                autoFocus
                              />
                              <button
                                onClick={() =>
                                  updatePackagePrice(
                                    rule.id,
                                    parseFloat(editingPackagePrice) || 0
                                  )
                                }
                                className="px-3 py-1 bg-brand-600 text-white text-sm rounded-lg hover:bg-brand-700"
                              >
                                OK
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingPackageId(rule.id);
                                setEditingPackagePrice(String(rule.value));
                              }}
                              className={cn(
                                "w-full text-left font-bold text-lg py-2 px-2 rounded-lg transition",
                                rule.value > 0
                                  ? "text-slate-800 hover:bg-slate-200"
                                  : "bg-orange-100 text-orange-700 hover:bg-orange-200"
                              )}
                            >
                              {rule.value > 0
                                ? `R$ ${rule.value.toFixed(2)}`
                                : "💰 Definir preço"}
                            </button>
                          )}
                        </div>

                        {rule.value > 0 && (
                          <p className="text-xs text-slate-500 text-center mb-3">
                            R$ {pricePerNight}/noite equivalente
                          </p>
                        )}

                        {/* Estadia mínima */}
                        <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                          <div>
                            <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wide">Estadia mínima</p>
                            {editingMinNightsId === rule.id ? (
                              <div className="flex gap-1.5 mt-1">
                                <input
                                  type="number"
                                  min="1"
                                  max="30"
                                  value={editingMinNights}
                                  onChange={(e) => setEditingMinNights(e.target.value)}
                                  className="w-16 px-2 py-0.5 text-sm border border-amber-300 rounded"
                                  autoFocus
                                />
                                <button
                                  onClick={() => updateMinNights(rule.id, parseInt(editingMinNights) || 1)}
                                  className="px-2 py-0.5 bg-amber-500 text-white text-xs rounded hover:bg-amber-600"
                                >OK</button>
                                <button
                                  onClick={() => setEditingMinNightsId(null)}
                                  className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded"
                                >✕</button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingMinNightsId(rule.id); setEditingMinNights(String(rule.minNights ?? nights)); }}
                                className="text-sm font-bold text-amber-800 hover:underline"
                              >
                                {rule.minNights ?? nights} noite{(rule.minNights ?? nights) > 1 ? "s" : ""}
                              </button>
                            )}
                          </div>
                          <span className="text-lg">🔒</span>
                        </div>

                        <button
                          onClick={() => deleteRule(rule.id)}
                          className="w-full py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
                        >
                          Remover pacote
                        </button>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Summary */}
                <div className="bg-gradient-to-br from-brand-50 to-blue-50 rounded-2xl p-5 border border-brand-200">
                  <p className="text-sm font-semibold text-slate-700 mb-2">
                    Resumo
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-slate-500">Total de pacotes</p>
                      <p className="text-2xl font-bold text-slate-800">
                        {packageRules.length}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">
                        Preço médio dos pacotes
                      </p>
                      <p className="text-2xl font-bold text-slate-800">
                        R${" "}
                        {packageRules.length > 0
                          ? (
                              packageRules.reduce((sum, r) => sum + r.value, 0) /
                              packageRules.length
                            ).toFixed(2)
                          : "0,00"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
