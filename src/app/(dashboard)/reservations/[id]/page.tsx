"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, User, Phone, Mail, Calendar, Moon,
  DollarSign, MapPin, FileText, Sparkles, CheckCircle2,
  Clock, AlertTriangle, Loader2, X, FileSignature, MessageCircle,
  CreditCard, Link2, Copy, Pencil, Save, RefreshCw,
} from "lucide-react";
import { apiRequest, useAuthStore } from "@/hooks/useAuth";
import { cn, formatCurrency, formatDate, formatDateTime, getStatusColor, getStatusLabel } from "@/lib/utils";
import toast from "react-hot-toast";
import Link from "next/link";

interface GuestData {
  id: string;
  name: string;
  birthDate: string;
  docType: string;
  docNumber: string;
}

interface Reservation {
  id: string;
  code: string;
  propertyId: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
  guestCount: number;
  paymentStatus?: string;
  paymentMethod?: string;
  mpCheckoutUrl?: string;
  paidAt?: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number | string;
  cleaningFee: number | string;
  commission: number | string;
  ownerAmount: number | string;
  status: string;
  source: string;
  notes?: string;
  createdAt: string;
  property: {
    id: string;
    name: string;
    address: string;
    city: string;
    state: string;
    owner: { id: string; name: string };
  };
  cleaning?: {
    id: string;
    status: string;
    scheduledDate: string;
    deadline?: string;
    cleaner?: { name: string; phone: string } | null;
  } | null;
  transactions?: {
    id: string;
    type: string;
    description: string;
    amount: number | string;
    isPaid: boolean;
  }[];
  guests?: GuestData[];
}

const STATUS_OPTIONS = [
  { value: "PENDING", label: "Pendente" },
  { value: "CONFIRMED", label: "Confirmar" },
  { value: "CHECKED_IN", label: "Check-in feito" },
  { value: "CHECKED_OUT", label: "Check-out feito" },
  { value: "CANCELLED", label: "Cancelar" },
];

export default function ReservationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuthStore();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [generatingPayment, setGeneratingPayment] = useState(false);

  const canEdit = user?.role !== "OWNER";

  // Edit mode
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    checkIn: "",
    checkOut: "",
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCount: "",
    source: "",
    notes: "",
    manualTotal: "",
  });
  const [preview, setPreview] = useState<{
    nights: number; totalAmount: number; cleaningFee: number;
    commission: number; ownerAmount: number;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiRequest(`/api/reservations/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setReservation(d.reservation);
        setLoading(false);
      })
      .catch(() => {
        toast.error("Reserva não encontrada");
        setLoading(false);
      });
  }, [id]);

  async function updateStatus(status: string) {
    setUpdating(true);
    try {
      const res = await apiRequest(`/api/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReservation(data.reservation);
      toast.success(`Status: ${getStatusLabel(status)}`);
    } catch {
      toast.error("Erro ao atualizar status");
    } finally {
      setUpdating(false);
    }
  }

  async function generatePaymentLink() {
    if (!reservation) return;
    setGeneratingPayment(true);
    try {
      const res = await apiRequest("/api/payments/create", {
        method: "POST",
        body: JSON.stringify({ reservationId: reservation.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReservation(prev => prev ? { ...prev, mpCheckoutUrl: data.checkoutUrl } : prev);
      toast.success("Link de pagamento gerado!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar link");
    } finally {
      setGeneratingPayment(false);
    }
  }

  function copyPaymentLink() {
    if (!reservation) return;
    const url = `${window.location.origin}/pagar/${reservation.code}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  }

  function sendPaymentWhatsApp() {
    if (!reservation?.guestPhone) return;
    const url = `${window.location.origin}/pagar/${reservation.code}`;
    const msg = encodeURIComponent(
      `Olá ${reservation.guestName}! 👋\n\nSegue o link para pagamento da sua reserva na *${reservation.property?.name}*.\n\n💳 ${url}\n\nAceitamos PIX e cartão de crédito em até 12x.\n\nCódigo da reserva: *${reservation.code}*`
    );
    const phone = reservation.guestPhone.replace(/\D/g, "");
    window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
  }

  function openEdit() {
    if (!reservation) return;
    setEditData({
      checkIn:    reservation.checkIn.slice(0, 10),
      checkOut:   reservation.checkOut.slice(0, 10),
      guestName:  reservation.guestName,
      guestEmail: reservation.guestEmail ?? "",
      guestPhone: reservation.guestPhone ?? "",
      guestCount: String(reservation.guestCount),
      source:     reservation.source ?? "",
      notes:      reservation.notes ?? "",
      manualTotal: "",
    });
    setPreview(null);
    setEditMode(true);
  }

  function calcPreview() {
    if (!reservation || !editData.checkIn || !editData.checkOut) return;
    const ci = new Date(editData.checkIn);
    const co = new Date(editData.checkOut);
    const nights = Math.max(1, Math.round((co.getTime() - ci.getTime()) / 86400000)) + 1;
    const prop = (reservation as any).property;
    const basePrice = prop?.basePrice ?? 0;
    const cleaningFee = prop?.cleaningFee ?? Number(reservation.cleaningFee);
    const commissionRate = prop?.commissionRate ?? 10;
    const totalAmount = editData.manualTotal ? Number(editData.manualTotal) : basePrice * nights;
    const commission = Math.round(totalAmount * commissionRate) / 100;
    const ownerAmount = totalAmount + cleaningFee - commission;
    setPreview({ nights, totalAmount, cleaningFee, commission, ownerAmount });
  }

  async function saveEdit() {
    if (!reservation) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        guestName:  editData.guestName,
        guestEmail: editData.guestEmail,
        guestPhone: editData.guestPhone,
        guestCount: editData.guestCount,
        source:     editData.source,
        notes:      editData.notes,
      };
      // Only include dates if changed
      if (editData.checkIn !== reservation.checkIn.slice(0, 10) ||
          editData.checkOut !== reservation.checkOut.slice(0, 10)) {
        payload.checkIn  = editData.checkIn;
        payload.checkOut = editData.checkOut;
      }
      if (editData.manualTotal) payload.manualTotal = editData.manualTotal;

      const res = await apiRequest(`/api/reservations/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReservation(data.reservation);
      setEditMode(false);
      setPreview(null);
      toast.success("Reserva atualizada!");
    } catch {
      toast.error("Erro ao salvar alterações");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-4 pt-4">
      <div className="skeleton h-8 w-32 rounded" />
      <div className="skeleton h-48 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  );

  if (!reservation) return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <p className="text-slate-400 text-lg mb-4">Reserva não encontrada.</p>
      <button onClick={() => router.back()} className="btn-primary">← Voltar</button>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => router.push("/reservations")}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 mb-5 text-sm pt-1"
      >
        <ChevronLeft size={16} /> Voltar para reservas
      </button>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{reservation.guestName}</h1>
            <p className="text-sm font-mono text-slate-400 mt-0.5">{reservation.code}</p>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("status-pill text-xs flex-shrink-0", getStatusColor(reservation.status))}>
              {getStatusLabel(reservation.status)}
            </span>
            {canEdit && !editMode && (
              <button
                onClick={openEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-50 text-brand-700 rounded-xl text-xs font-semibold hover:bg-brand-100 transition"
              >
                <Pencil size={12} /> Editar
              </button>
            )}
            {editMode && (
              <button
                onClick={() => { setEditMode(false); setPreview(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-200 transition"
              >
                <X size={12} /> Cancelar
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Property */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Imóvel</p>
        <p className="font-bold text-slate-900 text-base">{reservation.property.name}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <MapPin size={12} className="text-slate-400" />
          <p className="text-sm text-slate-500">{reservation.property.address}, {reservation.property.city}</p>
        </div>
        <p className="text-xs text-slate-400 mt-1">Proprietário: {reservation.property.owner?.name}</p>
      </motion.div>

      {/* Guest info */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Hóspede</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <User size={14} className="text-slate-400" />
            <p className="text-sm text-slate-700">{reservation.guestName} · {reservation.guestCount} hóspedes</p>
          </div>
          {reservation.guestPhone && (
            <a href={`https://wa.me/55${reservation.guestPhone.replace(/\D/g, "")}`} target="_blank"
              className="flex items-center gap-2 text-green-600 hover:underline">
              <Phone size={14} />
              <span className="text-sm">{reservation.guestPhone}</span>
            </a>
          )}
          {reservation.guestEmail && (
            <div className="flex items-center gap-2">
              <Mail size={14} className="text-slate-400" />
              <p className="text-sm text-slate-600">{reservation.guestEmail}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-slate-400" />
            <p className="text-sm text-slate-500">Canal: {getStatusLabel(reservation.source)}</p>
          </div>
        </div>
      </motion.div>

      {/* Guest list */}
      {reservation.guests && reservation.guests.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="card mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-3">
            Dados dos hóspedes ({reservation.guests.length})
          </p>
          <div className="space-y-2">
            {reservation.guests.map((g, i) => (
              <div key={g.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-xl">
                <div className="w-6 h-6 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-800 text-sm">{g.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Nascimento: {g.birthDate ? new Date(g.birthDate).toLocaleDateString("pt-BR") : "—"}
                    {" · "}
                    {g.docType}: {g.docNumber}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}
      {reservation.guests && reservation.guests.length === 0 && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="p-4 bg-amber-50 border border-amber-100 rounded-2xl mb-4 flex items-center gap-3">
          <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
          <div>
            <p className="text-xs font-semibold text-amber-700">Dados dos hóspedes pendentes</p>
            <p className="text-xs text-amber-600 mt-0.5">
              O hóspede ainda não preencheu os dados. Link:{" "}
              <span className="font-mono">/reserva/{reservation.code}/hospedes</span>
            </p>
          </div>
        </motion.div>
      )}

      {/* Dates */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.11 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Período</p>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-green-50 rounded-xl">
            <p className="text-[10px] text-green-600 font-bold uppercase">Check-in</p>
            <p className="font-bold text-green-700 text-sm mt-1">{formatDate(reservation.checkIn)}</p>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-xl">
            <p className="text-[10px] text-red-500 font-bold uppercase">Check-out</p>
            <p className="font-bold text-red-600 text-sm mt-1">{formatDate(reservation.checkOut)}</p>
          </div>
          <div className="text-center p-3 bg-slate-100 rounded-xl">
            <p className="text-[10px] text-slate-500 font-bold uppercase">Diárias</p>
            <p className="font-bold text-slate-700 text-sm mt-1">{reservation.nights}</p>
          </div>
        </div>
      </motion.div>

      {/* ── EDIT FORM ────────────────────────────────────────────────────── */}
      {editMode && canEdit && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="card mb-4 border-2 border-brand-200 bg-brand-50/30"
        >
          <p className="text-xs font-semibold text-brand-600 uppercase mb-4">✏️ Editar reserva</p>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Check-in</label>
              <input type="date" value={editData.checkIn}
                onChange={(e) => { setEditData({ ...editData, checkIn: e.target.value }); setPreview(null); }}
                className="input-base" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Check-out</label>
              <input type="date" value={editData.checkOut}
                onChange={(e) => { setEditData({ ...editData, checkOut: e.target.value }); setPreview(null); }}
                className="input-base" />
            </div>
          </div>

          {/* Recalculate button */}
          {(editData.checkIn !== reservation.checkIn.slice(0, 10) ||
            editData.checkOut !== reservation.checkOut.slice(0, 10)) && (
            <div className="mb-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Valor total manual (opcional — deixe em branco para calcular automático)
                </label>
                <div className="flex items-center border border-slate-200 rounded-xl bg-white overflow-hidden focus-within:ring-2 focus-within:ring-brand-500">
                  <span className="px-3 py-2 text-sm font-semibold text-slate-500 bg-slate-50 border-r border-slate-200">R$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={editData.manualTotal}
                    onChange={(e) => { setEditData({ ...editData, manualTotal: e.target.value }); setPreview(null); }}
                    className="flex-1 px-3 py-2 text-sm outline-none bg-transparent"
                    placeholder="calculado automaticamente"
                  />
                </div>
              </div>
              <button
                onClick={calcPreview}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
              >
                <RefreshCw size={13} /> Recalcular valores
              </button>

              {/* Preview */}
              {preview && (
                <div className="p-4 bg-white border border-brand-200 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-brand-700 mb-2">📊 Novos valores calculados</p>
                  {[
                    { label: "Diárias",         value: `${preview.nights} diária${preview.nights !== 1 ? "s" : ""}`,         plain: true },
                    { label: "Total reserva",   value: formatCurrency(preview.totalAmount),  color: "text-slate-900" },
                    { label: "Taxa limpeza",    value: formatCurrency(preview.cleaningFee),  color: "text-slate-600" },
                    { label: "Comissão",        value: formatCurrency(preview.commission),   color: "text-red-500" },
                    { label: "Repasse prop.",   value: formatCurrency(preview.ownerAmount),  color: "text-green-600" },
                  ].map(({ label, value, color, plain }) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className="text-slate-500">{label}</span>
                      <span className={cn("font-bold", plain ? "text-slate-700" : color)}>{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Guest info */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nome do hóspede</label>
              <input type="text" value={editData.guestName}
                onChange={(e) => setEditData({ ...editData, guestName: e.target.value })}
                className="input-base" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Nº de hóspedes</label>
              <input type="number" min="1" value={editData.guestCount}
                onChange={(e) => setEditData({ ...editData, guestCount: e.target.value })}
                className="input-base" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Telefone</label>
              <input type="text" value={editData.guestPhone}
                onChange={(e) => setEditData({ ...editData, guestPhone: e.target.value })}
                className="input-base" placeholder="(11) 99999-9999" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">E-mail</label>
              <input type="email" value={editData.guestEmail}
                onChange={(e) => setEditData({ ...editData, guestEmail: e.target.value })}
                className="input-base" />
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Observações</label>
            <textarea value={editData.notes}
              onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
              rows={3}
              className="input-base resize-none"
              placeholder="Pedidos especiais, restrições, etc." />
          </div>

          <button
            onClick={saveEdit}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition disabled:opacity-60"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Salvando...</>
              : <><Save size={14} /> Salvar alterações</>
            }
          </button>
        </motion.div>
      )}

      {/* Financial */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Financeiro</p>
        <div className="space-y-2">
          {[
            { label: "Total da reserva", value: Number(reservation.totalAmount), color: "text-slate-900" },
            { label: "Taxa de limpeza", value: Number(reservation.cleaningFee), color: "text-slate-600" },
            { label: "Comissão (10%)", value: Number(reservation.commission), color: "text-red-500" },
            { label: "Repasse proprietário", value: Number(reservation.ownerAmount), color: "text-green-600" },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex justify-between items-center py-1.5 border-b border-slate-50 last:border-0">
              <p className="text-sm text-slate-500">{label}</p>
              <p className={cn("font-bold text-sm", color)}>{formatCurrency(value)}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Cleaning */}
      {reservation.cleaning && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.17 }}
          className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase">Limpeza</p>
            <span className={cn("status-pill text-[10px]", getStatusColor(reservation.cleaning.status))}>
              {getStatusLabel(reservation.cleaning.status)}
            </span>
          </div>
          <div className="space-y-1.5 text-sm text-slate-600">
            <div className="flex items-center gap-2">
              <Calendar size={13} className="text-slate-400" />
              <span>{formatDate(reservation.cleaning.scheduledDate)}</span>
            </div>
            {reservation.cleaning.deadline && (
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-slate-400" />
                <span>Prazo: {formatDateTime(reservation.cleaning.deadline)}</span>
              </div>
            )}
            {reservation.cleaning.cleaner && (
              <div className="flex items-center gap-2">
                <User size={13} className="text-slate-400" />
                <span>{reservation.cleaning.cleaner.name}</span>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Notes */}
      {reservation.notes && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="p-4 bg-amber-50 rounded-2xl border border-amber-100 mb-4">
          <p className="text-xs font-semibold text-amber-700 mb-1">OBSERVAÇÕES</p>
          <p className="text-sm text-amber-800 whitespace-pre-line">{reservation.notes}</p>
        </motion.div>
      )}

      {/* Status update */}
      {canEdit && (
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
          className="card mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Atualizar status</p>
          <div className="grid grid-cols-2 gap-2">
            {STATUS_OPTIONS.filter((s) => s.value !== reservation.status).map((opt) => (
              <button
                key={opt.value}
                onClick={() => updateStatus(opt.value)}
                disabled={updating}
                className={cn(
                  "py-2.5 px-3 rounded-xl text-xs font-semibold transition-colors disabled:opacity-50",
                  getStatusColor(opt.value)
                )}
              >
                {updating ? <Loader2 size={12} className="animate-spin mx-auto" /> : opt.label}
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* Payment */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
        className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-slate-400 uppercase">Pagamento</p>
          {reservation.paymentStatus && (
            <span className={cn("px-2.5 py-1 rounded-full text-xs font-bold border", {
              "bg-amber-50 text-amber-600 border-amber-200": reservation.paymentStatus === "PENDING",
              "bg-green-50 text-green-600 border-green-200": reservation.paymentStatus === "PAID",
              "bg-red-50 text-red-600 border-red-200": reservation.paymentStatus === "FAILED",
              "bg-slate-50 text-slate-500 border-slate-200": reservation.paymentStatus === "REFUNDED",
            })}>
              {reservation.paymentStatus === "PENDING" ? "⏳ Pendente"
                : reservation.paymentStatus === "PAID" ? "✓ Pago"
                : reservation.paymentStatus === "FAILED" ? "✗ Recusado"
                : "Reembolsado"}
            </span>
          )}
        </div>

        {reservation.paymentStatus === "PAID" && (
          <div className="text-sm text-slate-600 mb-3 space-y-1">
            {reservation.paymentMethod && <p>Método: <strong>{reservation.paymentMethod}</strong></p>}
            {reservation.paidAt && <p>Pago em: <strong>{new Date(reservation.paidAt).toLocaleString("pt-BR")}</strong></p>}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={generatePaymentLink}
            disabled={generatingPayment}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-60"
          >
            {generatingPayment
              ? <><Loader2 size={13} className="animate-spin" /> Gerando...</>
              : <><CreditCard size={13} /> {reservation.mpCheckoutUrl ? "Regenerar link de pagamento" : "Gerar link de pagamento"}</>
            }
          </button>

          {reservation.mpCheckoutUrl && (
            <div className="flex gap-2">
              <button onClick={copyPaymentLink}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition">
                <Copy size={12} /> Copiar link
              </button>
              {reservation.guestPhone && (
                <button onClick={sendPaymentWhatsApp}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition">
                  <MessageCircle size={12} /> WhatsApp
                </button>
              )}
              <a href={`/pagar/${reservation.code}`} target="_blank"
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition">
                <Link2 size={12} />
              </a>
            </div>
          )}
        </div>
      </motion.div>

      {/* Contract */}
      <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}
        className="card mb-4">
        <p className="text-xs font-semibold text-slate-400 uppercase mb-3">Contrato</p>
        <div className="flex gap-2 flex-wrap">
          <a
            href={`/api/public/contract/${reservation.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:bg-black text-white text-xs font-semibold rounded-xl transition"
          >
            <FileSignature size={14} /> 📄 Contrato PDF
          </a>
          <a
            href={`/contrato/${reservation.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition"
          >
            Ver online
          </a>
          {reservation.guestPhone && (
            <button
              onClick={() => {
                const url = `${window.location.origin}/api/public/contract/${reservation.code}`;
                const msg = encodeURIComponent(
                  `Olá ${reservation.guestName}! 👋\n\nSegue o contrato da sua reserva na *Villa Mare*.\n\n📄 Acesse o contrato pelo link:\n${url}\n\nCódigo: *${reservation.code}*\n\nQualquer dúvida estamos à disposição!`
                );
                const phone = reservation.guestPhone!.replace(/\D/g, "");
                window.open(`https://wa.me/55${phone}?text=${msg}`, "_blank");
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 px-3 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold rounded-xl transition"
            >
              <MessageCircle size={14} /> WhatsApp
            </button>
          )}
        </div>
      </motion.div>

      <p className="text-center text-xs text-slate-300 mb-6">
        Criada em {formatDateTime(reservation.createdAt)}
      </p>
    </div>
  );
}
