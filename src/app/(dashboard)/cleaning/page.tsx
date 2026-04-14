"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, MapPin, Clock, User, CheckCircle2,
  AlertTriangle, Plus, X, ChevronDown, Phone, MessageCircle,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatDateTime, getStatusLabel } from "@/lib/utils";
import toast from "react-hot-toast";

interface Cleaning {
  id: string;
  status: "PENDING" | "IN_PROGRESS" | "DONE" | "LATE";
  scheduledDate: string;
  checkoutTime?: string;
  deadline?: string;
  notes?: string;
  property: { id: string; name: string; address: string; city: string };
  cleaner?: { id: string; name: string; phone: string } | null;
  reservation?: { guestName: string; notes?: string } | null;
}

interface Cleaner {
  id: string;
  name: string;
  phone: string;
  region?: string;
}

const COLUMNS = [
  { id: "PENDING", label: "Pendentes", icon: Clock, color: "bg-yellow-50 border-yellow-200", badge: "bg-yellow-400" },
  { id: "IN_PROGRESS", label: "Em andamento", icon: Sparkles, color: "bg-blue-50 border-blue-200", badge: "bg-blue-500" },
  { id: "DONE", label: "Concluídas", icon: CheckCircle2, color: "bg-green-50 border-green-200", badge: "bg-green-500" },
  { id: "LATE", label: "Atrasadas", icon: AlertTriangle, color: "bg-red-50 border-red-200", badge: "bg-red-500" },
];

function buildWhatsAppConvocationUrl(cleaning: Cleaning): string {
  const name = cleaning.cleaner?.name?.split(" ")[0] ?? "Colaboradora";
  const property = cleaning.property.name;
  const address = `${cleaning.property.address}, ${cleaning.property.city}`;
  const deadline = cleaning.deadline
    ? new Date(cleaning.deadline).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "a combinar";
  const guest = cleaning.reservation?.guestName ?? "";

  const msg = [
    `Olá ${name}! 👋`,
    ``,
    `Você tem uma limpeza agendada:`,
    ``,
    `🏠 *${property}*`,
    `📍 ${address}`,
    `⏰ Prazo: ${deadline}`,
    guest ? `👤 Checkout: ${guest}` : "",
    ``,
    `Por favor confirme o recebimento. Obrigado! 🙏`,
  ].filter((l) => l !== undefined).join("\n");

  const phone = cleaning.cleaner?.phone?.replace(/\D/g, "") ?? "";
  return `https://wa.me/55${phone}?text=${encodeURIComponent(msg)}`;
}

export default function CleaningPage() {
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [cleaners, setCleaners] = useState<Cleaner[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCleaning, setSelectedCleaning] = useState<Cleaning | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [cleanRes, cleanerRes] = await Promise.all([
        apiRequest("/api/cleanings"),
        apiRequest("/api/cleaners"),
      ]);
      const [cleanData, cleanerData] = await Promise.all([cleanRes.json(), cleanerRes.json()]);
      setCleanings(cleanData.cleanings);
      setCleaners(cleanerData.cleaners);
    } catch {
      toast.error("Erro ao carregar limpezas");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    setUpdatingId(id);
    try {
      const res = await apiRequest(`/api/cleanings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setCleanings((prev) => prev.map((c) => c.id === id ? { ...c, status: status as Cleaning["status"] } : c));
      toast.success(`Status atualizado: ${getStatusLabel(status)}`);
      if (selectedCleaning?.id === id) setSelectedCleaning(null);
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setUpdatingId(null);
    }
  }

  async function assignCleaner(cleaningId: string, cleanerId: string) {
    try {
      const res = await apiRequest(`/api/cleanings/${cleaningId}`, {
        method: "PATCH",
        body: JSON.stringify({ cleanerId }),
      });
      if (!res.ok) throw new Error();
      // Find cleaner in the full list (handles both real cleaners and team members)
      const cleaner = cleaners.find((c) => c.id === cleanerId) ?? null;
      const cleanerObj = cleaner ? { id: cleaner.id, name: cleaner.name, phone: cleaner.phone } : null;
      setCleanings((prev) =>
        prev.map((c) => c.id === cleaningId ? { ...c, cleaner: cleanerObj } : c)
      );
      // Also update the open modal if it's the same cleaning
      if (selectedCleaning?.id === cleaningId) {
        setSelectedCleaning((prev) => prev ? { ...prev, cleaner: cleanerObj } : prev);
      }
      toast.success(`${cleaner?.name ?? "Colaboradora"} atribuída!`);
    } catch {
      toast.error("Erro ao atribuir colaboradora");
    }
  }

  const grouped = COLUMNS.map((col) => ({
    ...col,
    items: cleanings.filter((c) => c.status === col.id),
  }));

  if (loading) return <CleaningSkeleton />;

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Limpeza</h1>
          <p className="text-sm text-slate-400">{cleanings.length} tarefa(s) total</p>
        </div>
        <button
          onClick={loadData}
          className="btn-secondary text-sm py-2 px-3"
        >
          Atualizar
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
        {COLUMNS.map((col) => {
          const count = cleanings.filter((c) => c.status === col.id).length;
          return (
            <div key={col.id} className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-slate-200">
              <div className={cn("w-2 h-2 rounded-full", col.badge)} />
              <span className="text-xs font-medium text-slate-600">{col.label}</span>
              <span className="text-xs font-bold text-slate-900">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-6" style={{ minHeight: "50vh" }}>
        {grouped.map((col) => {
          const Icon = col.icon;
          return (
            <div key={col.id} className={cn("kanban-col border flex-shrink-0 w-72", col.color)}>
              {/* Column header */}
              <div className="flex items-center gap-2 mb-2">
                <Icon size={15} className="text-slate-600" />
                <span className="text-sm font-semibold text-slate-700">{col.label}</span>
                <span className={cn("ml-auto text-xs text-white px-2 py-0.5 rounded-full font-bold", col.badge)}>
                  {col.items.length}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {col.items.map((cleaning) => (
                  <motion.div
                    key={cleaning.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-xl p-3.5 shadow-card cursor-pointer hover:shadow-card-hover transition-shadow"
                    onClick={() => setSelectedCleaning(cleaning)}
                  >
                    {/* Property */}
                    <div className="flex items-start gap-2 mb-2">
                      <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Sparkles size={14} className="text-slate-500" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{cleaning.property.name}</p>
                        <p className="text-xs text-slate-400 truncate">{cleaning.property.city}</p>
                      </div>
                    </div>

                    {/* Cleaner */}
                    <div className="flex items-center gap-1.5 mb-2">
                      <User size={12} className="text-slate-400 flex-shrink-0" />
                      <p className="text-xs text-slate-500 truncate">
                        {cleaning.cleaner?.name ?? <span className="text-red-400 font-medium">Sem faxineira</span>}
                      </p>
                    </div>

                    {/* Time */}
                    {cleaning.deadline && (
                      <div className="flex items-center gap-1.5">
                        <Clock size={12} className={cn("flex-shrink-0", cleaning.status === "LATE" ? "text-red-400" : "text-slate-400")} />
                        <p className={cn("text-xs", cleaning.status === "LATE" ? "text-red-500 font-medium" : "text-slate-500")}>
                          Prazo: {formatDateTime(cleaning.deadline)}
                        </p>
                      </div>
                    )}

                    {/* Guest */}
                    {cleaning.reservation?.guestName && (
                      <p className="text-[10px] text-slate-400 mt-2 pt-2 border-t border-slate-100">
                        Checkout: {cleaning.reservation.guestName}
                      </p>
                    )}

                    {/* Quick actions */}
                    <div className="flex gap-1.5 mt-3">
                      {col.id === "PENDING" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(cleaning.id, "IN_PROGRESS"); }}
                          disabled={updatingId === cleaning.id}
                          className="flex-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                        >▶ Iniciar</button>
                      )}
                      {col.id === "IN_PROGRESS" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(cleaning.id, "DONE"); }}
                          disabled={updatingId === cleaning.id}
                          className="flex-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-medium hover:bg-green-100 transition-colors"
                        >✓ Concluir</button>
                      )}
                      {col.id === "LATE" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); updateStatus(cleaning.id, "IN_PROGRESS"); }}
                          disabled={updatingId === cleaning.id}
                          className="flex-1 py-1.5 bg-orange-50 text-orange-700 rounded-lg text-xs font-medium hover:bg-orange-100 transition-colors"
                        >▶ Reiniciar</button>
                      )}
                      {cleaning.cleaner?.phone && (
                        <a
                          href={buildWhatsAppConvocationUrl(cleaning)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Convocar via WhatsApp"
                          className="p-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-colors flex items-center justify-center"
                        >
                          <MessageCircle size={14} />
                        </a>
                      )}
                    </div>
                  </motion.div>
                ))}

                {col.items.length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <p className="text-xs">Nenhuma tarefa aqui</p>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail modal */}
      <AnimatePresence>
        {selectedCleaning && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedCleaning(null); }}>
            <motion.div
              className="modal-content max-h-[85vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-slate-900">Detalhes da Limpeza</h3>
                <button onClick={() => setSelectedCleaning(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl">
                  <p className="text-base font-bold text-slate-900">{selectedCleaning.property.name}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <MapPin size={13} className="text-slate-400" />
                    <p className="text-sm text-slate-500">{selectedCleaning.property.address}</p>
                  </div>
                </div>

                {/* Assign cleaner */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Faxineira responsável</label>
                  <div className="relative">
                    <select
                      className="input-base appearance-none"
                      value={selectedCleaning.cleaner?.id ?? ""}
                      onChange={(e) => {
                        if (e.target.value) assignCleaner(selectedCleaning.id, e.target.value);
                      }}
                    >
                      <option value="">Selecionar faxineira...</option>
                      {cleaners.map((c) => (
                        <option key={c.id} value={c.id}>{c.name} — {c.region}</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3.5 top-3.5 text-slate-400 pointer-events-none" />
                  </div>
                  {selectedCleaning.cleaner?.phone && (
                    <a
                      href={buildWhatsAppConvocationUrl(selectedCleaning)}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 mt-3 w-full py-3 px-4 bg-green-500 hover:bg-green-600 text-white rounded-xl text-sm font-semibold transition-colors"
                    >
                      <MessageCircle size={16} />
                      📲 Convocar {selectedCleaning.cleaner.name.split(" ")[0]} via WhatsApp
                    </a>
                  )}
                </div>

                {/* Status actions */}
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Atualizar status</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { status: "PENDING", label: "Pendente", cls: "bg-yellow-50 text-yellow-700 hover:bg-yellow-100" },
                      { status: "IN_PROGRESS", label: "Iniciada", cls: "bg-blue-50 text-blue-700 hover:bg-blue-100" },
                      { status: "DONE", label: "Concluída", cls: "bg-green-50 text-green-700 hover:bg-green-100" },
                      { status: "LATE", label: "Atrasada", cls: "bg-red-50 text-red-700 hover:bg-red-100" },
                    ].map(({ status, label, cls }) => (
                      <button
                        key={status}
                        onClick={() => updateStatus(selectedCleaning.id, status)}
                        disabled={selectedCleaning.status === status || updatingId === selectedCleaning.id}
                        className={cn("py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-40", cls)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {selectedCleaning.notes && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-100">
                    <p className="text-xs font-semibold text-amber-700 mb-1">OBSERVAÇÕES</p>
                    <p className="text-sm text-amber-800">{selectedCleaning.notes}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CleaningSkeleton() {
  return (
    <div className="flex gap-4 pt-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="w-72 flex-shrink-0 space-y-3">
          <div className="skeleton h-8 rounded-xl" />
          {[...Array(3)].map((_, j) => <div key={j} className="skeleton h-28 rounded-xl" />)}
        </div>
      ))}
    </div>
  );
}
