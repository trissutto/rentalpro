"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Search, Filter, X, Calendar, User, DollarSign,
  MapPin, Moon, Phone, Mail, FileText, ChevronDown, Loader2,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuthStore } from "@/hooks/useAuth";

interface Reservation {
  id: string;
  code: string;
  propertyId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number | string;
  status: string;
  source: string;
  notes?: string;
  property: { id: string; name: string; city: string };
  cleaning?: { id: string; status: string } | null;
}

interface Property {
  id: string;
  name: string;
  city: string;
  basePrice: number | string;
  cleaningFee: number | string;
  commissionRate: number | string;
  idealGuests?: number;
  maxGuests?: number;
  extraGuestFee?: number;
}

const STATUS_OPTIONS = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT", "PENDING", "CANCELLED"];

export default function ReservationsPage() {
  const { user } = useAuthStore();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadData();
  }, [statusFilter, page]);

  useEffect(() => {
    apiRequest("/api/properties").then((r) => r.json()).then((d) => setProperties(d.properties));
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (statusFilter) params.set("status", statusFilter);
      const res = await apiRequest(`/api/reservations?${params}`);
      const data = await res.json();
      setReservations(data.reservations);
      setTotal(data.total);
    } catch {
      toast.error("Erro ao carregar reservas");
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    try {
      const res = await apiRequest(`/api/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setReservations((prev) => prev.map((r) => r.id === id ? { ...r, status } : r));
      if (selectedRes?.id === id) setSelectedRes((prev) => prev ? { ...prev, status } : null);
      toast.success("Status atualizado!");
    } catch {
      toast.error("Erro ao atualizar status");
    }
  }

  const filtered = reservations.filter((r) =>
    r.guestName.toLowerCase().includes(search.toLowerCase()) ||
    r.code.toLowerCase().includes(search.toLowerCase()) ||
    r.property.name.toLowerCase().includes(search.toLowerCase())
  );

  const canEdit = user?.role !== "OWNER";

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5 pt-1">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reservas</h1>
          <p className="text-sm text-slate-400">{total} reserva(s) encontrada(s)</p>
        </div>
        {canEdit && (
          <button onClick={() => setShowModal(true)} className="btn-primary py-2 px-4 text-sm">
            <Plus size={16} /> Nova
          </button>
        )}
      </div>

      {/* Search & filter */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar hóspede ou código..."
            className="input-base pl-10"
          />
        </div>
        <div className="relative">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input-base appearance-none pr-8 min-w-[120px]"
          >
            <option value="">Todos</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{getStatusLabel(s)}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center py-12">
          <Calendar size={40} className="mx-auto text-slate-200 mb-3" />
          <p className="text-slate-400 font-medium">Nenhuma reserva encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((res, i) => (
            <motion.div
              key={res.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card cursor-pointer hover:shadow-card-hover transition-shadow"
              onClick={() => setSelectedRes(res)}
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center text-brand-700 font-bold text-sm flex-shrink-0">
                  {res.guestName.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-900 truncate">{res.guestName}</p>
                    <span className={cn("status-pill text-[10px] flex-shrink-0", getStatusColor(res.status))}>
                      {getStatusLabel(res.status)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-0.5 truncate">{res.property.name}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} /> {formatDate(res.checkIn)} → {formatDate(res.checkOut)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Moon size={11} /> {res.nights}d
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-bold text-slate-900">{formatCurrency(Number(res.totalAmount))}</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-mono">{res.code}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 20 && (
        <div className="flex items-center justify-center gap-3 mt-6">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-ghost">← Anterior</button>
          <span className="text-sm text-slate-500">Página {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page * 20 >= total} className="btn-ghost">Próxima →</button>
        </div>
      )}

      {/* Detail modal */}
      <AnimatePresence>
        {selectedRes && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedRes(null); }}>
            <motion.div
              className="modal-content max-h-[90vh] overflow-y-auto"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Reserva</h3>
                  <span className="text-xs font-mono text-slate-400">{selectedRes.code}</span>
                </div>
                <button onClick={() => setSelectedRes(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Status badge */}
                <span className={cn("status-pill", getStatusColor(selectedRes.status))}>
                  {getStatusLabel(selectedRes.status)}
                </span>

                {/* Guest info */}
                <div className="p-4 bg-slate-50 rounded-2xl space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Hóspede</p>
                  <p className="font-bold text-slate-900">{selectedRes.guestName}</p>
                  {selectedRes.guestPhone && (
                    <a href={`https://wa.me/55${selectedRes.guestPhone.replace(/\D/g, "")}`} target="_blank" className="flex items-center gap-2 text-green-600 text-sm">
                      <Phone size={13} /> {selectedRes.guestPhone}
                    </a>
                  )}
                  {selectedRes.guestEmail && (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Mail size={13} /> {selectedRes.guestEmail}
                    </p>
                  )}
                  <p className="text-sm text-slate-500">👥 {selectedRes.guestCount} hóspedes</p>
                </div>

                {/* Dates */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center p-3 bg-green-50 rounded-xl">
                    <p className="text-[10px] text-green-600 font-semibold">CHECK-IN</p>
                    <p className="font-bold text-green-700 text-sm mt-1">{formatDate(selectedRes.checkIn)}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-xl">
                    <p className="text-[10px] text-red-600 font-semibold">CHECK-OUT</p>
                    <p className="font-bold text-red-700 text-sm mt-1">{formatDate(selectedRes.checkOut)}</p>
                  </div>
                  <div className="text-center p-3 bg-slate-100 rounded-xl">
                    <p className="text-[10px] text-slate-500 font-semibold">DIÁRIAS</p>
                    <p className="font-bold text-slate-700 text-sm mt-1">{selectedRes.nights}</p>
                  </div>
                </div>

                {/* Financial */}
                <div className="p-4 bg-brand-50 rounded-2xl">
                  <p className="text-xs font-semibold text-brand-500 uppercase mb-2">Financeiro</p>
                  <p className="text-2xl font-bold text-brand-700">{formatCurrency(Number(selectedRes.totalAmount))}</p>
                  <p className="text-xs text-brand-400 mt-1">Fonte: {getStatusLabel(selectedRes.source)}</p>
                </div>

                {/* Notes */}
                {selectedRes.notes && (
                  <div className="p-3 bg-amber-50 rounded-xl">
                    <p className="text-xs font-semibold text-amber-600 mb-1">OBSERVAÇÕES</p>
                    <p className="text-sm text-amber-800">{selectedRes.notes}</p>
                  </div>
                )}

                {/* Status update */}
                {canEdit && (
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-2">Atualizar status</p>
                    <div className="flex flex-wrap gap-2">
                      {STATUS_OPTIONS.filter((s) => s !== selectedRes.status).map((s) => (
                        <button
                          key={s}
                          onClick={() => updateStatus(selectedRes.id, s)}
                          className={cn("py-2 px-3 rounded-xl text-xs font-medium transition-colors", getStatusColor(s))}
                        >
                          {getStatusLabel(s)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New reservation modal */}
      <AnimatePresence>
        {showModal && (
          <NewReservationModal
            properties={properties}
            onClose={() => setShowModal(false)}
            onCreated={() => { setShowModal(false); loadData(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function NewReservationModal({ properties, onClose, onCreated }: {
  properties: Property[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    propertyId: "", guestName: "", guestEmail: "", guestPhone: "", guestCount: 2,
    checkIn: "", checkOut: "", source: "DIRECT", notes: "",
    totalAmount: "", cleaningFee: "", commission: "", ownerAmount: "",
  });
  const [loading, setLoading] = useState(false);

  function recalc(updated: typeof form, propOverride?: Property) {
    const prop = propOverride ?? properties.find((p) => p.id === updated.propertyId);
    if (!prop || !updated.checkIn || !updated.checkOut) return updated;
    const nights = Math.ceil((new Date(updated.checkOut).getTime() - new Date(updated.checkIn).getTime()) / 86400000) + 1;
    if (nights <= 0) return updated;
    const base = Number(prop.basePrice) * nights;
    const cleaning = Number(prop.cleaningFee);
    const idealGuests = Number(prop.idealGuests ?? 2);
    const extraFee = Number(prop.extraGuestFee ?? 0);
    const extra = Math.max(0, updated.guestCount - idealGuests) * extraFee * nights;
    const total = base + cleaning + extra;
    const rate = Number(prop.commissionRate ?? 10) / 100;
    const commission = total * rate;
    const owner = total - commission - cleaning;
    return {
      ...updated,
      totalAmount: String(total.toFixed(2)),
      cleaningFee: String(cleaning),
      commission: String(commission.toFixed(2)),
      ownerAmount: String(owner.toFixed(2)),
    };
  }

  function updateForm(field: string, value: string | number) {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "propertyId" && value) {
        const prop = properties.find((p) => p.id === String(value));
        if (prop) updated.cleaningFee = String(prop.cleaningFee);
      }
      if (["checkIn", "checkOut", "propertyId", "guestCount"].includes(field) && updated.propertyId) {
        return recalc(updated);
      }
      return updated;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await apiRequest("/api/reservations", {
        method: "POST",
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Reserva criada com sucesso!");
      onCreated();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao criar reserva");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <motion.div
        className="modal-content max-h-[90vh] overflow-y-auto"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-slate-900">Nova Reserva</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Imóvel *</label>
            <select className="input-base" value={form.propertyId} onChange={(e) => updateForm("propertyId", e.target.value)} required>
              <option value="">Selecionar imóvel...</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.city}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-in *</label>
              <input type="date" className="input-base" value={form.checkIn} onChange={(e) => updateForm("checkIn", e.target.value)} required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Check-out *</label>
              <input type="date" className="input-base" value={form.checkOut} onChange={(e) => updateForm("checkOut", e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nome do Hóspede *</label>
            <input type="text" className="input-base" placeholder="Nome completo" value={form.guestName} onChange={(e) => updateForm("guestName", e.target.value)} required />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Telefone</label>
            <input type="tel" className="input-base" placeholder="(11) 99999-9999" value={form.guestPhone} onChange={(e) => updateForm("guestPhone", e.target.value)} />
          </div>

          {/* Guest count selector */}
          {(() => {
            const prop = properties.find((p) => p.id === form.propertyId);
            const ideal = Number(prop?.idealGuests ?? 2);
            const maxG = Number(prop?.maxGuests ?? 10);
            const extraFee = Number(prop?.extraGuestFee ?? 0);
            const counts = Array.from({ length: maxG }, (_, i) => i + 1);
            return (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">
                  Hóspedes
                  {prop && extraFee > 0 && (
                    <span className="ml-2 text-xs text-slate-400 font-normal">
                      base para {ideal} · +R$ {extraFee.toFixed(0)}/hóspede/diária acima do ideal
                    </span>
                  )}
                </label>
                <div className="flex gap-1.5 flex-wrap">
                  {counts.map((n) => {
                    const isAboveIdeal = n > ideal;
                    const isSelected = form.guestCount === n;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => updateForm("guestCount", n)}
                        title={isAboveIdeal && extraFee > 0 ? `+R$ ${(extraFee * (n - ideal)).toFixed(0)}/diária de excedente` : undefined}
                        className={cn(
                          "w-9 h-9 rounded-xl text-sm font-bold transition-all border-2",
                          isSelected
                            ? isAboveIdeal
                              ? "bg-red-500 border-red-500 text-white"
                              : "bg-brand-600 border-brand-600 text-white"
                            : isAboveIdeal
                            ? "border-red-200 text-red-500 hover:bg-red-50"
                            : "border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50"
                        )}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
                {form.guestCount > ideal && extraFee > 0 && (
                  <p className="text-xs text-red-500 mt-1.5 font-medium">
                    ⚠ {form.guestCount - ideal} hóspede(s) acima do ideal —
                    excedente de R$ {(extraFee * (form.guestCount - ideal)).toFixed(2).replace(".", ",")} por diária
                  </p>
                )}
              </div>
            );
          })()}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">E-mail</label>
            <input type="email" className="input-base" placeholder="hóspede@email.com" value={form.guestEmail} onChange={(e) => updateForm("guestEmail", e.target.value)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Canal</label>
            <select className="input-base" value={form.source} onChange={(e) => updateForm("source", e.target.value)}>
              <option value="DIRECT">Direto</option>
              <option value="AIRBNB">Airbnb</option>
              <option value="BOOKING">Booking</option>
              <option value="VRBO">VRBO</option>
              <option value="MANUAL">Manual</option>
            </select>
          </div>

          {/* Financial summary */}
          {form.totalAmount && (
            <div className="p-4 bg-brand-50 rounded-2xl border border-brand-100">
              <p className="text-xs font-semibold text-brand-600 mb-3">RESUMO FINANCEIRO</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Total</p>
                  <p className="font-bold text-slate-800">{formatCurrency(Number(form.totalAmount))}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Limpeza</p>
                  <p className="font-bold text-slate-800">{formatCurrency(Number(form.cleaningFee))}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Comissão (10%)</p>
                  <p className="font-bold text-slate-800">{formatCurrency(Number(form.commission))}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Repasse Dono</p>
                  <p className="font-bold text-green-600">{formatCurrency(Number(form.ownerAmount))}</p>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Observações</label>
            <textarea className="input-base resize-none" rows={3} placeholder="Pedidos especiais, senhas, instruções..." value={form.notes} onChange={(e) => updateForm("notes", e.target.value)} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Criando...</> : "Criar Reserva"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
