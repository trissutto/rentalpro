"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
  CreditCard, CalendarDays, ChevronDown, Info, Lock,
  Upload, FileCheck, Paperclip, Copy, Check, QrCode,
} from "lucide-react";

declare global {
  interface Window { PagSeguro: any; }
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateISO(iso: string) {
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function maskCard(v: string) {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}
function maskExpiry(v: string) {
  return v.replace(/\D/g, "").slice(0, 4).replace(/^(\d{2})(\d)/, "$1/$2");
}
function maskCpf(v: string) {
  return v.replace(/\D/g, "").slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

interface InstallmentItem {
  seq: number;
  label: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  mpPaymentId?: string;
  receiptUrl?: string;
}
interface InstallmentPlan {
  numInstallments: number;
  entryAmount: number;
  installmentAmount: number;
  deadline: string;
  items: InstallmentItem[];
  createdAt: string;
}
interface ReservationData {
  code: string;
  guestName: string;
  guestEmail?: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  cleaningFee: number;
  paymentStatus: string;
  paymentMethod?: string;
  paidAt?: string;
  property: { name: string; city: string; state: string };
  installmentPlan?: InstallmentPlan | null;
}
interface PixData {
  chargeId: string;
  pixText: string;
  pixImageLink?: string | null;
  expiresAt?: string | null;
}

const STATUS_CONFIG = {
  PENDING:  { label: "Aguardando Pagamento", color: "text-amber-600 bg-amber-50 border-amber-200",  Icon: Clock },
  PARTIAL:  { label: "Pago Parcialmente",    color: "text-blue-600 bg-blue-50 border-blue-200",     Icon: CalendarDays },
  PAID:     { label: "Pago ✓",              color: "text-green-600 bg-green-50 border-green-200",   Icon: CheckCircle2 },
  FAILED:   { label: "Pagamento Recusado",  color: "text-red-600 bg-red-50 border-red-200",         Icon: XCircle },
  REFUNDED: { label: "Reembolsado",         color: "text-slate-600 bg-slate-50 border-slate-200",   Icon: XCircle },
};

type FullMethod = "pix" | "card";
type PayMode = "full" | "installment";

// ── Card Form Component ────────────────────────────────────────────────────
function CardForm({
  amount,
  onSuccess,
  publicKey,
  label = "Pagar",
}: {
  amount: number;
  onSuccess: (data: { encryptedCard: string; holderName: string; holderCpf: string; installments: number }) => void;
  publicKey: string | null;
  label?: string;
}) {
  const [cardNumber, setCardNumber] = useState("");
  const [cardName, setCardName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cpf, setCpf] = useState("");
  const [installments, setInstallments] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadSdk(): Promise<boolean> {
    if (window.PagSeguro) return true;
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://assets.pagseguro.com.br/checkout-sdk/js/direct-checkout.min.js";
      s.async = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!publicKey) {
      setError("Chave pública não configurada.");
      return;
    }
    const [em, ey] = expiry.split("/");
    if (!em || !ey || em.length !== 2 || ey.length !== 2) {
      setError("Data de validade inválida. Use MM/AA.");
      return;
    }
    setLoading(true);
    try {
      const ok = await loadSdk();
      if (!ok) { setError("Erro ao carregar SDK de pagamento."); setLoading(false); return; }

      let encrypted: string;
      try {
        const result = window.PagSeguro.encryptCard({
          publicKey,
          holder: cardName.trim(),
          number: cardNumber.replace(/\s/g, ""),
          expMonth: em.trim(),
          expYear: `20${ey.trim()}`,
          securityCode: cvv.trim(),
        });
        encrypted = result.encryptedCard;
        if (!encrypted) throw new Error("Erro na criptografia do cartão");
      } catch (encErr: any) {
        const msg = encErr?.message || "Dados do cartão inválidos";
        setError(msg);
        setLoading(false);
        return;
      }

      onSuccess({
        encryptedCard: encrypted,
        holderName: cardName.trim(),
        holderCpf: cpf.replace(/\D/g, ""),
        installments,
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 flex items-start gap-2">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Card number */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Número do cartão</label>
        <input
          required
          inputMode="numeric"
          value={cardNumber}
          onChange={e => setCardNumber(maskCard(e.target.value))}
          placeholder="0000 0000 0000 0000"
          maxLength={19}
          className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Cardholder name */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nome no cartão</label>
        <input
          required
          value={cardName}
          onChange={e => setCardName(e.target.value.toUpperCase())}
          placeholder="NOME COMO NO CARTÃO"
          className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Expiry + CVV */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Validade (MM/AA)</label>
          <input
            required
            inputMode="numeric"
            value={expiry}
            onChange={e => setExpiry(maskExpiry(e.target.value))}
            placeholder="MM/AA"
            maxLength={5}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">CVV</label>
          <input
            required
            inputMode="numeric"
            value={cvv}
            onChange={e => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
            placeholder="000"
            maxLength={4}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
        </div>
      </div>

      {/* CPF */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">CPF do titular</label>
        <input
          required
          inputMode="numeric"
          value={cpf}
          onChange={e => setCpf(maskCpf(e.target.value))}
          placeholder="000.000.000-00"
          maxLength={14}
          className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Installments */}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Parcelas</label>
        <div className="relative">
          <select
            value={installments}
            onChange={e => setInstallments(Number(e.target.value))}
            className="w-full appearance-none border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 pr-8"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>
                {n === 1
                  ? `1x de ${fmt(amount)} (sem juros)`
                  : `${n}x de ${fmt(amount / n)}`
                }
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-3.5 text-slate-400 pointer-events-none" />
        </div>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20 mt-2"
      >
        {loading ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
        {loading ? "Processando..." : label}
      </button>
      <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1 mt-1">
        <Lock size={9} /> Pagamento criptografado via PagBank
      </p>
    </form>
  );
}

// ── PIX Display ─────────────────────────────────────────────────────────
function PixDisplay({ pixData, onClose }: { pixData: PixData; onClose?: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="bg-white rounded-2xl border border-brand-200 shadow-sm overflow-hidden">
      <div className="bg-brand-600 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode size={18} className="text-white" />
          <p className="font-bold text-white text-sm">Pague com PIX</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/70 hover:text-white text-xs">✕ Cancelar</button>
        )}
      </div>
      <div className="p-5">
        <p className="text-sm text-slate-600 mb-4 text-center">
          Escaneie o QR Code ou copie o código no app do seu banco
        </p>
        {pixData.pixImageLink && (
          <div className="flex justify-center mb-4">
            <img src={pixData.pixImageLink} alt="QR Code PIX" width={200} height={200} className="rounded-xl border-2 border-slate-100" />
          </div>
        )}
        <p className="text-xs font-semibold text-slate-500 mb-2">Código PIX (copia e cola):</p>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 break-all font-mono text-xs text-slate-600 select-all">
          {pixData.pixText}
        </div>
        <button
          onClick={() => { navigator.clipboard.writeText(pixData.pixText); setCopied(true); setTimeout(() => setCopied(false), 3000); }}
          className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 ${
            copied ? "bg-green-100 text-green-700 border border-green-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
          }`}
        >
          {copied ? <><Check size={15} /> Código copiado!</> : <><Copy size={15} /> Copiar código PIX</>}
        </button>
        {pixData.expiresAt && (
          <p className="text-center text-xs text-amber-600 mt-3">
            ⏳ Expira em: {new Date(pixData.expiresAt).toLocaleString("pt-BR")}
          </p>
        )}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <p className="text-xs text-amber-700 text-center">
            Após pagar, sua reserva será confirmada automaticamente em até 1 minuto.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────
export default function PagarPage() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const returnStatus = searchParams.get("status");

  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  const [payMode, setPayMode] = useState<PayMode>("full");
  const [fullMethod, setFullMethod] = useState<FullMethod>("pix");

  // PIX state
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [generatingPix, setGeneratingPix] = useState(false);
  const [pixError, setPixError] = useState("");

  // Card submit state
  const [cardSubmitting, setCardSubmitting] = useState(false);
  const [cardError, setCardError] = useState("");
  const [cardSuccess, setCardSuccess] = useState("");

  // Installment selector
  const [maxInstallments, setMaxInstallments] = useState(0);
  const [selectedInstallments, setSelectedInstallments] = useState(2);
  const [installmentPreview, setInstallmentPreview] = useState<InstallmentItem[]>([]);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planCreated, setPlanCreated] = useState(false);

  // Active installment being paid
  const [activeSeq, setActiveSeq] = useState<number | null>(null);
  const [installPixData, setInstallPixData] = useState<PixData | null>(null);
  const [installPayMethod, setInstallPayMethod] = useState<FullMethod>("pix");

  // Receipt upload
  const [uploadingSeq, setUploadingSeq] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null);

  // ── Load data ────────────────────────────────────────────────────────
  const loadReservation = useCallback(() => {
    fetch(`/api/public/reservation/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setReservation(d.reservation);
        if (d.reservation.installmentPlan) {
          setPayMode("installment");
          setPlanCreated(true);
        }
      })
      .catch(() => setError("Reserva não encontrada"))
      .finally(() => setLoading(false));
  }, [code]);

  useEffect(() => {
    loadReservation();
    if (returnStatus === "success" || returnStatus === "pending") {
      const t1 = setTimeout(loadReservation, 3000);
      const t2 = setTimeout(loadReservation, 8000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [loadReservation, returnStatus]);

  useEffect(() => {
    fetch("/api/public/pagbank-config")
      .then(r => r.json())
      .then(d => { if (d.publicKey) setPublicKey(d.publicKey); });
  }, []);

  // ── Compute max installments ─────────────────────────────────────────
  // Sempre mostra pelo menos 1 opção (Entrada + Saldo) independente do prazo.
  // Para check-ins distantes, calcula quantas parcelas mensais cabem.
  useEffect(() => {
    if (!reservation) return;
    const checkIn = new Date(reservation.checkIn);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const deadline = new Date(checkIn); deadline.setDate(deadline.getDate() - 2); // 2 dias antes do check-in
    const firstInstallment = new Date(today); firstInstallment.setDate(firstInstallment.getDate() + 30);
    const daysCalc = Math.max(0, Math.floor((deadline.getTime() - firstInstallment.getTime()) / (30 * 86400_000)) + 1);
    // Mínimo 1: sempre mostra "Entrada + Saldo" mesmo para check-ins próximos
    const max = Math.max(1, daysCalc);
    setMaxInstallments(max);
    setSelectedInstallments(Math.max(1, daysCalc));
  }, [reservation]);

  // ── Compute installment preview ───────────────────────────────────────
  useEffect(() => {
    if (!reservation || !selectedInstallments) return;
    const total = Number(reservation.totalAmount);
    const entry = Math.round(total * 0.30 * 100) / 100;
    const remaining = total - entry;
    const monthly = Math.round((remaining / selectedInstallments) * 100) / 100;
    const today = new Date().toISOString().slice(0, 10);
    // Vencimento do saldo: 2 dias antes do check-in (para check-ins próximos)
    // ou 30 dias após hoje (para parcelamentos normais)
    const checkInDate = new Date(reservation.checkIn);
    const twoDaysBefore = new Date(checkInDate); twoDaysBefore.setDate(twoDaysBefore.getDate() - 2);
    const thirtyDaysOut = new Date(); thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30);
    const balanceDue = twoDaysBefore < thirtyDaysOut
      ? twoDaysBefore.toISOString().slice(0, 10)
      : addDays(today, 30);
    const items: InstallmentItem[] = [
      { seq: 1, label: "Entrada (30%)", amount: entry, dueDate: today, paid: false },
    ];
    for (let i = 1; i <= selectedInstallments; i++) {
      const dueDate = selectedInstallments === 1 ? balanceDue : addDays(today, 30 * i);
      const amount = i === selectedInstallments
        ? Math.round((total - entry - monthly * (selectedInstallments - 1)) * 100) / 100
        : monthly;
      items.push({ seq: i + 1, label: selectedInstallments === 1 ? "Saldo restante" : `Parcela ${i}/${selectedInstallments}`, amount, dueDate, paid: false });
    }
    setInstallmentPreview(items);
  }, [reservation, selectedInstallments]);

  // ── Handlers ──────────────────────────────────────────────────────────

  async function handleGeneratePix() {
    if (!reservation) return;
    setGeneratingPix(true);
    setPixError("");
    try {
      const res = await fetch("/api/public/payments/pagbank-pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation.code }),
      });
      const data = await res.json();
      if (!res.ok) { setPixError(data.error || "Erro ao gerar PIX"); return; }
      setPixData({ chargeId: data.chargeId, pixText: data.pixText, pixImageLink: data.pixImageLink, expiresAt: data.expiresAt });
    } finally {
      setGeneratingPix(false);
    }
  }

  async function handleCardSubmit(cardData: { encryptedCard: string; holderName: string; holderCpf: string; installments: number }) {
    if (!reservation) return;
    setCardSubmitting(true);
    setCardError("");
    try {
      const res = await fetch("/api/public/payments/pagbank-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation.code, ...cardData }),
      });
      const data = await res.json();
      if (!res.ok) { setCardError(data.error || "Pagamento recusado"); return; }
      setCardSuccess(data.message || "Pagamento processado!");
      setTimeout(() => loadReservation(), 1500);
    } finally {
      setCardSubmitting(false);
    }
  }

  async function handleInstallmentPix(item: InstallmentItem) {
    if (!reservation) return;
    setActiveSeq(item.seq);
    setInstallPayMethod("pix");
    setInstallPixData(null);
  }

  async function handleInstallmentPixGenerate(item: InstallmentItem) {
    if (!reservation) return;
    setGeneratingPix(true);
    setPixError("");
    try {
      const res = await fetch("/api/public/payments/pay-installment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation.code, seq: item.seq, method: "pix" }),
      });
      const data = await res.json();
      if (!res.ok) { setPixError(data.error || "Erro ao gerar PIX"); return; }
      if (data.pixText) {
        setInstallPixData({ chargeId: data.chargeId, pixText: data.pixText, pixImageLink: data.pixImageLink, expiresAt: data.pixExpiresAt });
      }
      if (data.installmentPaid) {
        setTimeout(() => { loadReservation(); setActiveSeq(null); setInstallPixData(null); }, 2000);
      }
    } finally {
      setGeneratingPix(false);
    }
  }

  async function handleInstallmentCard(item: InstallmentItem, cardData: { encryptedCard: string; holderName: string; holderCpf: string; installments: number }) {
    if (!reservation) return;
    setCardSubmitting(true);
    setCardError("");
    try {
      const res = await fetch("/api/public/payments/pay-installment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation.code, seq: item.seq, method: "card", ...cardData }),
      });
      const data = await res.json();
      if (!res.ok) { setCardError(data.error || "Pagamento recusado"); return; }
      if (data.installmentPaid) {
        setTimeout(() => { loadReservation(); setActiveSeq(null); }, 1500);
      }
    } finally {
      setCardSubmitting(false);
    }
  }

  async function handleUploadReceipt(seq: number, file: File) {
    if (!reservation) return;
    setUploadingSeq(seq);
    try {
      const fd = new FormData();
      fd.append("code", reservation.code);
      fd.append("seq", String(seq));
      fd.append("file", file);
      const res = await fetch("/api/public/payments/upload-receipt", { method: "POST", body: fd });
      const data = await res.json();
      if (res.ok && data.ok) {
        setUploadSuccess(seq);
        setTimeout(() => { setUploadSuccess(null); loadReservation(); }, 2000);
      }
    } catch { } finally {
      setUploadingSeq(null);
    }
  }

  async function handleCreatePlan() {
    if (!reservation) return;
    setCreatingPlan(true);
    try {
      const res = await fetch("/api/public/payments/installment-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation.code, numInstallments: selectedInstallments }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Erro ao criar plano"); return; }
      setPlanCreated(true);
      await loadReservation();
    } finally {
      setCreatingPlan(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
    </div>
  );

  if (error || !reservation) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
        <p className="text-slate-700 font-semibold">{error || "Reserva não encontrada"}</p>
      </div>
    </div>
  );

  const statusCfg = STATUS_CONFIG[reservation.paymentStatus as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.PENDING;
  const { Icon: StatusIcon } = statusCfg;
  const isPaid = reservation.paymentStatus === "PAID";
  const isPartial = reservation.paymentStatus === "PARTIAL";
  const baseAmount = Number(reservation.totalAmount) - Number(reservation.cleaningFee);
  const plan = reservation.installmentPlan;
  const nextUnpaid = plan?.items.find(i => !i.paid) ?? null;
  const paidTotal = plan?.items.filter(i => i.paid).reduce((s, i) => s + i.amount, 0) ?? 0;
  const pendingTotal = plan?.items.filter(i => !i.paid).reduce((s, i) => s + i.amount, 0) ?? 0;

  return (
    <div className="max-w-lg mx-auto px-4 py-8">

      {/* Return banners */}
      {returnStatus === "success" && !isPaid && (
        <div className="mb-5 p-4 bg-green-50 border border-green-200 rounded-2xl flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800 text-sm">Pagamento em processamento!</p>
            <p className="text-xs text-green-700 mt-0.5">Confirmando com PagBank...</p>
          </div>
        </div>
      )}
      {returnStatus === "failure" && (
        <div className="mb-5 p-4 bg-red-50 border border-red-200 rounded-2xl flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 font-medium">Pagamento não aprovado. Tente novamente abaixo.</p>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-6">
        <p className="text-xs font-bold text-brand-500 uppercase tracking-widest mb-1">
          {reservation.property.name}
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Pagamento da Reserva</h1>
        <p className="font-mono text-slate-400 text-sm mt-1 tracking-widest">{code}</p>
      </div>

      {/* Status badge */}
      <div className={`flex items-center gap-3 p-4 rounded-2xl border mb-5 ${statusCfg.color}`}>
        <StatusIcon className="w-5 h-5 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-sm">{statusCfg.label}</p>
          {(isPaid || isPartial) && reservation.paymentMethod && (
            <p className="text-xs mt-0.5 opacity-75">via {reservation.paymentMethod}</p>
          )}
          {isPartial && plan && (
            <p className="text-xs mt-0.5 opacity-75">
              {fmt(paidTotal)} pago · {fmt(pendingTotal)} restante
            </p>
          )}
        </div>
        {isPartial && plan && (
          <div className="text-right">
            <p className="text-xs font-bold">
              {plan.items.filter(i => i.paid).length}/{plan.items.length} parcelas
            </p>
          </div>
        )}
      </div>

      {/* Reservation summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumo da Reserva</p>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <Row label="Hóspede"   value={reservation.guestName} />
          <Row label="Imóvel"    value={reservation.property.name} />
          <Row label="Check-in"  value={fmtDateISO(reservation.checkIn)} />
          <Row label="Check-out" value={fmtDateISO(reservation.checkOut)} />
          <Row label="Hóspedes"  value={String(reservation.guestCount)} />
        </div>
        <div className="px-5 py-4 border-t border-slate-50 space-y-2">
          <Row
            label={`Hospedagem (${reservation.nights} noite${reservation.nights > 1 ? "s" : ""})`}
            value={fmt(baseAmount)}
          />
          {Number(reservation.cleaningFee) > 0 && (
            <Row label="Taxa de limpeza" value={fmt(Number(reservation.cleaningFee))} />
          )}
          <div className="flex justify-between font-bold border-t border-slate-100 pt-2.5 mt-1">
            <span className="text-slate-900">Total</span>
            <span className="text-brand-600 text-lg">{fmt(Number(reservation.totalAmount))}</span>
          </div>
        </div>
      </div>

      {/* ── PAYMENT SECTION ─────────────────────────────────────────── */}
      {!isPaid && (
        <div className="mb-6">

          {/* Mode selector */}
          {!planCreated && maxInstallments >= 1 && (
            <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
              <button
                onClick={() => { setPayMode("full"); setPixData(null); setCardError(""); setCardSuccess(""); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  payMode === "full" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <CreditCard size={15} /> À vista
              </button>
              <button
                onClick={() => { setPayMode("installment"); setPixData(null); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  payMode === "installment" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <CalendarDays size={15} /> Parcelado
              </button>
            </div>
          )}

          {/* ── À VISTA ────────────────────────────────────────── */}
          {payMode === "full" && !planCreated && (
            <div>
              {/* PIX / Card method switch */}
              {!pixData && !cardSuccess && (
                <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                  <button
                    onClick={() => { setFullMethod("pix"); setCardError(""); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      fullMethod === "pix" ? "bg-white shadow text-slate-900" : "text-slate-500"
                    }`}
                  >
                    <QrCode size={13} /> PIX
                  </button>
                  <button
                    onClick={() => { setFullMethod("card"); setPixError(""); setPixData(null); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                      fullMethod === "card" ? "bg-white shadow text-slate-900" : "text-slate-500"
                    }`}
                  >
                    <CreditCard size={13} /> Cartão de Crédito
                  </button>
                </div>
              )}

              {/* PIX */}
              {fullMethod === "pix" && !pixData && !cardSuccess && (
                <div>
                  {pixError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 mb-3 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                      {pixError}
                    </div>
                  )}
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 text-center">
                    <QrCode size={40} className="text-brand-400 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-700 mb-1">Pague com PIX</p>
                    <p className="text-xs text-slate-400 mb-4">Geração instantânea · Confirmação em até 1 min</p>
                    <button
                      onClick={handleGeneratePix}
                      disabled={generatingPix}
                      className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
                    >
                      {generatingPix ? <Loader2 size={18} className="animate-spin" /> : <QrCode size={18} />}
                      {generatingPix ? "Gerando PIX..." : `Gerar PIX de ${fmt(Number(reservation.totalAmount))}`}
                    </button>
                  </div>
                </div>
              )}

              {/* PIX QR Code */}
              {fullMethod === "pix" && pixData && !cardSuccess && (
                <PixDisplay pixData={pixData} onClose={() => setPixData(null)} />
              )}

              {/* Credit Card */}
              {fullMethod === "card" && !cardSuccess && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5">
                  <p className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                    <CreditCard size={16} className="text-brand-500" /> Dados do cartão
                  </p>
                  {cardError && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 mb-3 flex items-start gap-2">
                      <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                      {cardError}
                    </div>
                  )}
                  {!publicKey ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center text-xs text-amber-700">
                      <AlertTriangle size={16} className="mx-auto mb-2 text-amber-500" />
                      Gateway de pagamento não configurado. Entre em contato com a administração.
                    </div>
                  ) : (
                    <CardForm
                      amount={Number(reservation.totalAmount)}
                      publicKey={publicKey}
                      onSuccess={handleCardSubmit}
                      label={`Pagar ${fmt(Number(reservation.totalAmount))}`}
                    />
                  )}
                </div>
              )}

              {/* Card success */}
              {cardSuccess && (
                <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
                  <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
                  <p className="font-bold text-green-800">{cardSuccess}</p>
                  <p className="text-xs text-green-600 mt-1">Recarregando sua reserva...</p>
                </div>
              )}
            </div>
          )}

          {/* ── PARCELADO — Configuração ────────────────────────── */}
          {payMode === "installment" && !planCreated && (
            <div>
              {maxInstallments < 1 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                  <Info className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-amber-700">Parcelamento indisponível</p>
                  <p className="text-xs text-amber-600 mt-1">O check-in está próximo. Pague à vista.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white border border-slate-200 rounded-2xl p-5 mb-4">
                    <p className="text-sm font-bold text-slate-700 mb-3">Número de parcelas mensais</p>
                    <div className="relative mb-4">
                      <select
                        value={selectedInstallments}
                        onChange={e => setSelectedInstallments(Number(e.target.value))}
                        className="w-full appearance-none bg-brand-50 border border-brand-200 text-brand-800 font-bold text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-400 pr-10"
                      >
                        {Array.from({ length: maxInstallments }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>
                            {n === 1 ? "Entrada + 1 parcela" : `Entrada + ${n}x mensais`}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-3.5 text-brand-500 pointer-events-none" />
                    </div>
                    <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                      <Info size={13} className="mt-0.5 flex-shrink-0 text-brand-400" />
                      <p>
                        Último pagamento vence até <strong>{fmtDateISO(addDays(new Date(reservation.checkIn).toISOString().slice(0, 10), -7))}</strong> (7 dias antes do check-in).
                      </p>
                    </div>
                  </div>

                  {installmentPreview.length > 0 && (
                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-4">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cronograma de pagamentos</p>
                      </div>
                      <div className="divide-y divide-slate-50">
                        {installmentPreview.map((item, idx) => (
                          <div key={item.seq} className={`flex items-center justify-between px-4 py-3 ${idx === 0 ? "bg-brand-50" : ""}`}>
                            <div>
                              <p className={`text-sm font-semibold ${idx === 0 ? "text-brand-700" : "text-slate-700"}`}>
                                {item.label}
                                {idx === 0 && <span className="ml-2 text-[10px] bg-brand-200 text-brand-700 px-1.5 py-0.5 rounded-full font-bold">HOJE</span>}
                              </p>
                              <p className="text-xs text-slate-400">Vencimento: {fmtDateISO(item.dueDate)}</p>
                            </div>
                            <p className={`font-bold text-sm ${idx === 0 ? "text-brand-700" : "text-slate-900"}`}>{fmt(item.amount)}</p>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between text-sm">
                        <span className="text-slate-500 font-medium">Total</span>
                        <span className="font-bold text-slate-900">{fmt(Number(reservation.totalAmount))}</span>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleCreatePlan}
                    disabled={creatingPlan}
                    className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
                  >
                    {creatingPlan ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                    {creatingPlan ? "Criando plano..." : "Confirmar plano de parcelamento"}
                  </button>
                  <p className="text-center text-xs text-slate-400 mt-2">
                    Cada parcela poderá ser paga com PIX ou Cartão de Crédito.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── PARCELADO — Plano ativo ─────────────────────────── */}
          {(planCreated || plan) && plan && !isPaid && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-green-50 border border-green-100 rounded-2xl p-3 text-center">
                  <p className="text-xs text-green-600 font-medium mb-0.5">Pago</p>
                  <p className="font-bold text-green-700 text-sm">{fmt(paidTotal)}</p>
                </div>
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3 text-center">
                  <p className="text-xs text-amber-600 font-medium mb-0.5">Restante</p>
                  <p className="font-bold text-amber-700 text-sm">{fmt(pendingTotal)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 text-center">
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Prazo</p>
                  <p className="font-bold text-slate-700 text-sm">{fmtDateISO(plan.deadline)}</p>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-5">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Suas parcelas</p>
                </div>
                <div className="divide-y divide-slate-50">
                  {plan.items.map((item) => (
                    <div key={item.seq} className={`px-4 py-3.5 ${item.paid ? "bg-green-50/40" : ""}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {item.paid
                            ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0" />
                            : <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex-shrink-0" />
                          }
                          <div>
                            <p className={`text-sm font-semibold ${item.paid ? "text-green-700" : "text-slate-800"}`}>
                              {item.label}
                            </p>
                            <p className="text-xs text-slate-400">
                              {item.paid ? `Pago em ${fmtDateISO(item.paidAt!)}` : `Vence em ${fmtDateISO(item.dueDate)}`}
                            </p>
                          </div>
                        </div>
                        <p className={`font-bold text-sm ${item.paid ? "text-green-700" : "text-slate-900"}`}>
                          {fmt(item.amount)}
                        </p>
                      </div>

                      {/* Pay button for next unpaid installment */}
                      {!item.paid && item.seq === nextUnpaid?.seq && activeSeq !== item.seq && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => { setActiveSeq(item.seq); setInstallPayMethod("pix"); setInstallPixData(null); setPixError(""); setCardError(""); }}
                            className="flex-1 bg-brand-50 hover:bg-brand-100 border border-brand-200 text-brand-700 text-xs font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                          >
                            <QrCode size={13} /> Pagar com PIX
                          </button>
                          <button
                            onClick={() => { setActiveSeq(item.seq); setInstallPayMethod("card"); setInstallPixData(null); setPixError(""); setCardError(""); }}
                            className="flex-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold py-2 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                          >
                            <CreditCard size={13} /> Cartão
                          </button>
                        </div>
                      )}

                      {/* Active payment for this installment */}
                      {!item.paid && item.seq === nextUnpaid?.seq && activeSeq === item.seq && (
                        <div className="mt-3 space-y-3">
                          {/* Method sub-tabs */}
                          <div className="flex bg-slate-100 rounded-xl p-1">
                            <button
                              onClick={() => { setInstallPayMethod("pix"); setInstallPixData(null); setCardError(""); }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${installPayMethod === "pix" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
                            >
                              <QrCode size={12} /> PIX
                            </button>
                            <button
                              onClick={() => { setInstallPayMethod("card"); setInstallPixData(null); setPixError(""); }}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${installPayMethod === "card" ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
                            >
                              <CreditCard size={12} /> Cartão
                            </button>
                          </div>

                          {installPayMethod === "pix" && !installPixData && (
                            <>
                              {pixError && <p className="text-xs text-red-600 bg-red-50 rounded-xl p-2">{pixError}</p>}
                              <button
                                onClick={() => handleInstallmentPixGenerate(item)}
                                disabled={generatingPix}
                                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white text-sm font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
                              >
                                {generatingPix ? <Loader2 size={15} className="animate-spin" /> : <QrCode size={15} />}
                                {generatingPix ? "Gerando PIX..." : `Gerar PIX de ${fmt(item.amount)}`}
                              </button>
                            </>
                          )}

                          {installPayMethod === "pix" && installPixData && (
                            <PixDisplay pixData={installPixData} onClose={() => setInstallPixData(null)} />
                          )}

                          {installPayMethod === "card" && (
                            <div className="bg-white border border-slate-100 rounded-xl p-4">
                              {cardError && (
                                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-700 mb-3 flex items-start gap-2">
                                  <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
                                  {cardError}
                                </div>
                              )}
                              <CardForm
                                amount={item.amount}
                                publicKey={publicKey}
                                onSuccess={(d) => handleInstallmentCard(item, d)}
                                label={`Pagar ${fmt(item.amount)}`}
                              />
                            </div>
                          )}

                          <button
                            onClick={() => { setActiveSeq(null); setInstallPixData(null); setPixError(""); setCardError(""); }}
                            className="w-full text-xs text-slate-400 hover:text-slate-600 py-1"
                          >
                            Cancelar
                          </button>
                        </div>
                      )}

                      {/* Future installments locked */}
                      {!item.paid && item.seq !== nextUnpaid?.seq && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                          <Lock size={11} /> Disponível após pagar a parcela anterior
                        </div>
                      )}

                      {/* Comprovante */}
                      <div className="mt-2">
                        {item.receiptUrl ? (
                          <a
                            href={item.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-lg px-2.5 py-1 hover:bg-green-100 transition-colors"
                          >
                            <FileCheck size={12} /> Comprovante enviado — ver
                          </a>
                        ) : (
                          <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer rounded-lg px-2.5 py-1 transition-colors ${
                            uploadSuccess === item.seq ? "text-green-600 bg-green-50" : "text-slate-500 bg-slate-50 hover:bg-slate-100"
                          }`}>
                            {uploadingSeq === item.seq
                              ? <><Loader2 size={11} className="animate-spin" /> Enviando...</>
                              : uploadSuccess === item.seq
                                ? <><CheckCircle2 size={11} /> Enviado!</>
                                : <><Paperclip size={11} /> Enviar comprovante</>
                            }
                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.webp,.pdf"
                              className="hidden"
                              disabled={uploadingSeq === item.seq}
                              onChange={e => { const f = e.target.files?.[0]; if (f) handleUploadReceipt(item.seq, f); }}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Fully paid */}
      {isPaid && (
        <div className="text-center py-8 bg-green-50 rounded-2xl border border-green-200">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
          <p className="font-bold text-slate-800 text-lg">Reserva Confirmada!</p>
          <p className="text-sm text-slate-500 mt-1">
            Obrigado, {reservation.guestName}. Nos vemos em {fmtDateISO(reservation.checkIn)} 🎉
          </p>
          {reservation.paymentMethod && (
            <p className="text-xs text-slate-400 mt-2">via {reservation.paymentMethod}</p>
          )}
        </div>
      )}

      <p className="text-center text-xs text-slate-300 mt-8 flex items-center justify-center gap-1">
        <Lock size={10} /> Pagamentos processados com segurança via PagBank
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-800">{value}</span>
    </div>
  );
}
