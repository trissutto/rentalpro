"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Loader2, CheckCircle2, XCircle, Clock, AlertTriangle,
  CreditCard, CalendarDays, ChevronDown, Info, Lock,
  Upload, FileCheck, Paperclip,
} from "lucide-react";

declare global {
  interface Window { MercadoPago: any; }
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR");
}
function fmtDateISO(iso: string) {
  // parse YYYY-MM-DD or full ISO
  const d = iso.length === 10 ? new Date(iso + "T12:00:00") : new Date(iso);
  return d.toLocaleDateString("pt-BR");
}
function addDays(date: string, days: number) {
  const d = new Date(date + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

interface InstallmentItem {
  seq: number;
  label: string;
  amount: number;
  dueDate: string;
  paid: boolean;
  paidAt?: string;
  mpPaymentId?: string;
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

const STATUS_CONFIG = {
  PENDING:  { label: "Aguardando Pagamento", color: "text-amber-600 bg-amber-50 border-amber-200",  Icon: Clock },
  PARTIAL:  { label: "Pago Parcialmente",    color: "text-blue-600 bg-blue-50 border-blue-200",     Icon: CalendarDays },
  PAID:     { label: "Pago ✓",              color: "text-green-600 bg-green-50 border-green-200",   Icon: CheckCircle2 },
  FAILED:   { label: "Pagamento Recusado",  color: "text-red-600 bg-red-50 border-red-200",         Icon: XCircle },
  REFUNDED: { label: "Reembolsado",         color: "text-slate-600 bg-slate-50 border-slate-200",   Icon: XCircle },
};

type PayMode = "full" | "installment";

export default function PagarPage() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const returnStatus = searchParams.get("status");

  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);

  // Payment mode
  const [payMode, setPayMode] = useState<PayMode>("full");

  // Installment selector
  const [maxInstallments, setMaxInstallments] = useState(0);
  const [selectedInstallments, setSelectedInstallments] = useState(2);
  const [installmentPreview, setInstallmentPreview] = useState<InstallmentItem[]>([]);
  const [creatingPlan, setCreatingPlan] = useState(false);
  const [planCreated, setPlanCreated] = useState(false);

  // Active installment being paid (seq number)
  const [activeSeq, setActiveSeq] = useState<number | null>(null);

  // Receipt upload state
  const [uploadingSeq, setUploadingSeq] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<number | null>(null);

  // MP Brick state
  const [brickReady, setBrickReady] = useState(false);
  const [brickError, setBrickError] = useState("");
  const brickInstanceRef = useRef<unknown>(null);
  const brickMountedRef = useRef(false);
  const brickAmountRef = useRef<number>(0);

  // PIX state
  const [pixData, setPixData] = useState<{ qrCode: string; qrCodeBase64?: string; expiresAt?: string } | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const loadReservation = useCallback(() => {
    fetch(`/api/public/reservation/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setReservation(d.reservation);
        // If plan already exists, switch to installment view
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
    fetch("/api/public/mp-config")
      .then(r => r.json())
      .then(d => { if (d.publicKey) setPublicKey(d.publicKey); });
  }, []);

  // ── Compute max installments whenever reservation loads ───────────────────
  useEffect(() => {
    if (!reservation) return;
    const checkIn = new Date(reservation.checkIn);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const deadline = new Date(checkIn);
    deadline.setDate(deadline.getDate() - 7);
    const firstInstallment = new Date(today);
    firstInstallment.setDate(firstInstallment.getDate() + 30);
    const max = Math.max(
      0,
      Math.floor((deadline.getTime() - firstInstallment.getTime()) / (30 * 86400_000)) + 1
    );
    setMaxInstallments(max);
    // Default to max available so the user sees the full range immediately
    setSelectedInstallments(Math.max(1, max));
  }, [reservation]);

  // ── Compute installment preview whenever selector changes ─────────────────
  useEffect(() => {
    if (!reservation || !selectedInstallments) return;
    const total = Number(reservation.totalAmount);
    const entry = Math.round(total * 0.30 * 100) / 100;
    const remaining = total - entry;
    const monthlyAmount = Math.round((remaining / selectedInstallments) * 100) / 100;
    const today = new Date().toISOString().slice(0, 10);

    const items: InstallmentItem[] = [
      { seq: 1, label: "Entrada (30%)", amount: entry, dueDate: today, paid: false },
    ];
    for (let i = 1; i <= selectedInstallments; i++) {
      const dueDate = addDays(today, 30 * i);
      const amount = i === selectedInstallments
        ? Math.round((total - entry - monthlyAmount * (selectedInstallments - 1)) * 100) / 100
        : monthlyAmount;
      items.push({
        seq: i + 1,
        label: selectedInstallments === 1 ? "Saldo restante" : `Parcela ${i}/${selectedInstallments}`,
        amount,
        dueDate,
        paid: false,
      });
    }
    setInstallmentPreview(items);
  }, [reservation, selectedInstallments]);

  // ── MP Brick mount/unmount ─────────────────────────────────────────────────
  function unmountBrick() {
    if (brickInstanceRef.current) {
      try { (brickInstanceRef.current as any).unmount(); } catch {}
      brickInstanceRef.current = null;
    }
    brickMountedRef.current = false;
    setBrickReady(false);
    setBrickError("");
  }

  function mountBrick(amount: number, onSubmitFn: (formData: unknown) => Promise<unknown>) {
    if (!publicKey) return;
    unmountBrick();
    brickAmountRef.current = amount;
    brickMountedRef.current = true;
    setBrickError("");
    setBrickReady(false);
    setPixData(null);

    async function doMount() {
      if (!reservation) return;
      try {
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const builder = mp.bricks();
        const instance = await builder.create("payment", "mp-payment-brick", {
          initialization: {
            amount,
            payer: {
              firstName: reservation.guestName.split(" ")[0] || "",
              lastName: reservation.guestName.split(" ").slice(1).join(" ") || "",
              email: reservation.guestEmail || "",
            },
          },
          customization: {
            paymentMethods: { bankTransfer: "all", creditCard: "all" },
            visual: {
              style: {
                theme: "default",
                customVariables: {
                  baseColor: "#0362c5",
                  baseColorFirstVariant: "#044ea0",
                  baseColorSecondVariant: "#084284",
                },
              },
              hideFormTitle: true,
            },
          },
          callbacks: {
            onReady: () => setBrickReady(true),
            onSubmit: async ({ formData }: { formData: unknown }) => {
              const result = await onSubmitFn(formData);
              return result;
            },
            onError: (err: unknown) => {
              const msg = (err as any)?.message || JSON.stringify(err);
              setBrickError(`Erro: ${msg}`);
            },
          },
        });
        brickInstanceRef.current = instance;
      } catch (e) {
        setBrickError("Não foi possível carregar o formulário. Recarregue a página.");
        brickMountedRef.current = false;
      }
    }

    if (window.MercadoPago) {
      doMount();
    } else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = doMount;
      script.onerror = () => {
        setBrickError("Erro ao carregar SDK do Mercado Pago.");
        brickMountedRef.current = false;
      };
      document.head.appendChild(script);
    }
  }

  // Mount brick for full payment (original behavior)
  useEffect(() => {
    if (!reservation || !publicKey) return;
    if (reservation.paymentStatus === "PAID") return;
    if (payMode !== "full") return;
    if (reservation.installmentPlan) return;
    if (brickMountedRef.current) return;

    const container = document.getElementById("mp-payment-brick");
    if (!container) return;

    mountBrick(Number(reservation.totalAmount), async (formData) => {
      const res = await fetch("/api/public/payments/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: reservation!.code, formData }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao processar pagamento");
      const txData = data?.point_of_interaction?.transaction_data;
      if (txData?.qr_code) {
        setPixData({ qrCode: txData.qr_code, qrCodeBase64: txData.qr_code_base64, expiresAt: data.date_of_expiration });
      }
      setTimeout(loadReservation, 2000);
      return data;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation, publicKey, payMode]);

  // ── Upload comprovante de parcela ────────────────────────────────────────
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
    } catch { /* ignore */ } finally {
      setUploadingSeq(null);
    }
  }

  // ── Create installment plan ───────────────────────────────────────────────
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

  // ── Pay a specific installment ────────────────────────────────────────────
  function handlePayInstallment(item: InstallmentItem) {
    if (!reservation) return;
    setActiveSeq(item.seq);
    unmountBrick();

    // Wait for DOM
    setTimeout(() => {
      mountBrick(item.amount, async (formData) => {
        const res = await fetch("/api/public/payments/pay-installment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: reservation!.code, seq: item.seq, formData }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erro ao processar pagamento");
        const txData = data?.point_of_interaction?.transaction_data;
        if (txData?.qr_code) {
          setPixData({ qrCode: txData.qr_code, qrCodeBase64: txData.qr_code_base64, expiresAt: data.date_of_expiration });
        }
        if (data.installmentPaid) {
          setTimeout(() => { loadReservation(); setActiveSeq(null); }, 1500);
        }
        return data;
      });
    }, 100);
  }

  // ── Mode switch reset ─────────────────────────────────────────────────────
  function handleModeSwitch(mode: PayMode) {
    if (planCreated) return; // can't switch after plan created
    setPayMode(mode);
    unmountBrick();
    setPixData(null);

    if (mode === "full") {
      // Re-mount full brick
      setTimeout(() => {
        brickMountedRef.current = false;
        if (!reservation || !publicKey) return;
        const container = document.getElementById("mp-payment-brick");
        if (!container) return;
        mountBrick(Number(reservation.totalAmount), async (formData) => {
          const res = await fetch("/api/public/payments/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: reservation.code, formData }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Erro ao processar pagamento");
          const txData = data?.point_of_interaction?.transaction_data;
          if (txData?.qr_code) {
            setPixData({ qrCode: txData.qr_code, qrCodeBase64: txData.qr_code_base64, expiresAt: data.date_of_expiration });
          }
          setTimeout(loadReservation, 2000);
          return data;
        });
      }, 100);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
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

  // Compute which installment is next to pay
  const nextUnpaid = plan?.items.find(i => !i.paid) ?? null;

  // Stats for partial payment display
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
            <p className="text-xs text-green-700 mt-0.5">Confirmando com o Mercado Pago...</p>
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
        <>
          {!publicKey ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center mb-6">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-amber-700">Gateway de pagamento não configurado</p>
              <p className="text-xs text-amber-600 mt-1">Entre em contato com a administração.</p>
            </div>
          ) : (

            /* ── Tabs: À vista / Parcelado ───────────────────────── */
            <div className="mb-6">

              {/* Tab selector (only if no plan yet) */}
              {!planCreated && maxInstallments >= 1 && (
                <div className="flex bg-slate-100 rounded-2xl p-1 mb-5">
                  <button
                    onClick={() => handleModeSwitch("full")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      payMode === "full"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <CreditCard size={15} /> À vista
                  </button>
                  <button
                    onClick={() => handleModeSwitch("installment")}
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                      payMode === "installment"
                        ? "bg-white shadow text-slate-900"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <CalendarDays size={15} /> Parcelado
                  </button>
                </div>
              )}

              {/* ── À VISTA ──────────────────────────────────────── */}
              {payMode === "full" && !planCreated && (
                <div>
                  {!brickReady && !brickError && (
                    <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
                      <Loader2 size={18} className="animate-spin" />
                      Carregando formas de pagamento...
                    </div>
                  )}
                  {brickError && <BrickError msg={brickError} onRetry={() => {
                    unmountBrick();
                    setTimeout(() => {
                      if (!reservation || !publicKey) return;
                      mountBrick(Number(reservation.totalAmount), async (formData) => {
                        const res = await fetch("/api/public/payments/process", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ code: reservation.code, formData }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error || "Erro");
                        const txData = data?.point_of_interaction?.transaction_data;
                        if (txData?.qr_code) setPixData({ qrCode: txData.qr_code, qrCodeBase64: txData.qr_code_base64, expiresAt: data.date_of_expiration });
                        setTimeout(loadReservation, 2000);
                        return data;
                      });
                    }, 100);
                  }} />}
                  <div id="mp-payment-brick" className={brickReady ? "opacity-100" : "opacity-0"} />
                </div>
              )}

              {/* ── PARCELADO — Configuração do plano ─────────────── */}
              {payMode === "installment" && !planCreated && (
                <div>
                  {maxInstallments < 1 ? (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                      <Info className="w-8 h-8 text-amber-400 mx-auto mb-2" />
                      <p className="text-sm font-semibold text-amber-700">Parcelamento indisponível</p>
                      <p className="text-xs text-amber-600 mt-1">
                        O check-in está próximo demais. Pague à vista para garantir sua reserva.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Selector */}
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
                                {n === 1
                                  ? `Entrada + 1 parcela`
                                  : `Entrada + ${n}x mensais`
                                }
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={16} className="absolute right-3 top-3.5 text-brand-500 pointer-events-none" />
                        </div>

                        {/* Deadline info */}
                        <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3">
                          <Info size={13} className="mt-0.5 flex-shrink-0 text-brand-400" />
                          <p>
                            Último pagamento vence até <strong>{fmtDateISO(addDays(new Date(reservation.checkIn).toISOString().slice(0, 10), -7))}</strong> (7 dias antes do check-in).
                          </p>
                        </div>
                      </div>

                      {/* Schedule preview */}
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
                                <p className={`font-bold text-sm ${idx === 0 ? "text-brand-700" : "text-slate-900"}`}>
                                  {fmt(item.amount)}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between text-sm">
                            <span className="text-slate-500 font-medium">Total</span>
                            <span className="font-bold text-slate-900">{fmt(Number(reservation.totalAmount))}</span>
                          </div>
                        </div>
                      )}

                      {/* CTA */}
                      <button
                        onClick={handleCreatePlan}
                        disabled={creatingPlan}
                        className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-bold py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-colors shadow-lg shadow-brand-500/20"
                      >
                        {creatingPlan ? <Loader2 size={18} className="animate-spin" /> : <Lock size={18} />}
                        {creatingPlan ? "Criando plano..." : "Confirmar plano e pagar entrada"}
                      </button>
                      <p className="text-center text-xs text-slate-400 mt-2">
                        Após confirmar, você pagará a entrada de {fmt(Math.round(Number(reservation.totalAmount) * 0.30 * 100) / 100)} agora.
                      </p>
                    </>
                  )}
                </div>
              )}

              {/* ── PARCELADO — Plano ativo ───────────────────────── */}
              {(planCreated || plan) && plan && !isPaid && (
                <div>
                  {/* Summary bar */}
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

                  {/* Installment list */}
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
                                : <div className="w-4.5 h-4.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                              }
                              <div>
                                <p className={`text-sm font-semibold ${item.paid ? "text-green-700" : "text-slate-800"}`}>
                                  {item.label}
                                </p>
                                <p className="text-xs text-slate-400">
                                  {item.paid
                                    ? `Pago em ${fmtDateISO(item.paidAt!)}`
                                    : `Vence em ${fmtDateISO(item.dueDate)}`
                                  }
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold text-sm ${item.paid ? "text-green-700" : "text-slate-900"}`}>
                                {fmt(item.amount)}
                              </p>
                            </div>
                          </div>

                          {/* Pay button for the NEXT unpaid installment */}
                          {!item.paid && item.seq === nextUnpaid?.seq && (
                            <div className="mt-3">
                              {activeSeq !== item.seq ? (
                                <button
                                  onClick={() => handlePayInstallment(item)}
                                  className="w-full bg-brand-600 hover:bg-brand-700 text-white text-sm font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2"
                                >
                                  <CreditCard size={14} /> Pagar {fmt(item.amount)} agora
                                </button>
                              ) : (
                                <div className="mt-2">
                                  {!brickReady && !brickError && (
                                    <div className="flex items-center justify-center gap-2 py-8 text-slate-400 text-sm">
                                      <Loader2 size={16} className="animate-spin" />
                                      Carregando pagamento...
                                    </div>
                                  )}
                                  {brickError && <BrickError msg={brickError} onRetry={() => {
                                    unmountBrick();
                                    setTimeout(() => handlePayInstallment(item), 100);
                                  }} />}
                                  <div id="mp-payment-brick" className={brickReady ? "opacity-100" : "opacity-0"} />
                                  <button
                                    onClick={() => { unmountBrick(); setActiveSeq(null); }}
                                    className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Future installments: show locked */}
                          {!item.paid && item.seq !== nextUnpaid?.seq && (
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                              <Lock size={11} />
                              Disponível após pagar a parcela anterior
                            </div>
                          )}

                          {/* Comprovante */}
                          <div className="mt-2">
                            {(item as any).receiptUrl ? (
                              <a
                                href={(item as any).receiptUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-green-600 bg-green-50 rounded-lg px-2.5 py-1 hover:bg-green-100 transition-colors"
                              >
                                <FileCheck size={12} /> Comprovante enviado — ver
                              </a>
                            ) : (
                              <label className={`inline-flex items-center gap-1.5 text-xs cursor-pointer rounded-lg px-2.5 py-1 transition-colors ${
                                uploadSuccess === item.seq
                                  ? "text-green-600 bg-green-50"
                                  : "text-slate-500 bg-slate-50 hover:bg-slate-100"
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
                                  onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) handleUploadReceipt(item.seq, f);
                                  }}
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
        </>
      )}

      {/* PIX QR Code */}
      {pixData && !isPaid && (
        <div className="mb-6 bg-white rounded-2xl border border-brand-200 shadow-sm overflow-hidden">
          <div className="bg-brand-600 px-5 py-3 flex items-center gap-2">
            <span className="text-white text-lg">⬡</span>
            <p className="font-bold text-white text-sm">Pague com PIX</p>
          </div>
          <div className="p-5">
            <p className="text-sm text-slate-600 mb-4 text-center">
              Escaneie o QR Code ou copie o código no app do seu banco
            </p>
            {pixData.qrCodeBase64 && (
              <div className="flex justify-center mb-4">
                <img src={`data:image/png;base64,${pixData.qrCodeBase64}`} alt="QR Code PIX" width={200} height={200} className="rounded-xl border-2 border-slate-100" />
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 mb-2">Código PIX (copia e cola):</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 break-all font-mono text-xs text-slate-600 select-all">
              {pixData.qrCode}
            </div>
            <button
              onClick={() => { navigator.clipboard.writeText(pixData.qrCode); setCopied(true); setTimeout(() => setCopied(false), 3000); }}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${copied ? "bg-green-100 text-green-700 border border-green-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
            >
              {copied ? "✓ Código copiado!" : "📋 Copiar código PIX"}
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
        <Lock size={10} /> Pagamentos processados com segurança via Mercado Pago
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

function BrickError({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-red-700">Erro ao carregar pagamento</p>
        <p className="text-xs text-red-600 mt-1">{msg}</p>
        <button onClick={onRetry} className="mt-2 text-xs text-red-600 underline">Tentar novamente</button>
      </div>
    </div>
  );
}
