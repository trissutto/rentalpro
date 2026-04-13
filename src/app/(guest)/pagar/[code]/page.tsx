"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MercadoPago: any;
  }
}

function fmt(val: number) {
  return val.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

interface ReservationData {
  code: string;
  guestName: string;
  guestEmail?: string;
  guestPhone?: string;
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
}

const STATUS_CONFIG = {
  PENDING:  { label: "Aguardando Pagamento", color: "text-amber-600 bg-amber-50 border-amber-200",  Icon: Clock },
  PAID:     { label: "Pago ✓",               color: "text-green-600 bg-green-50 border-green-200",   Icon: CheckCircle2 },
  FAILED:   { label: "Pagamento Recusado",   color: "text-red-600 bg-red-50 border-red-200",         Icon: XCircle },
  REFUNDED: { label: "Reembolsado",          color: "text-slate-600 bg-slate-50 border-slate-200",   Icon: XCircle },
};

export default function PagarPage() {
  const { code } = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const returnStatus = searchParams.get("status");

  const [reservation, setReservation] = useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [brickReady, setBrickReady] = useState(false);
  const [brickError, setBrickError] = useState("");
  const brickInstanceRef = useRef<unknown>(null);
  const brickMountedRef = useRef(false);
  const [copied, setCopied] = useState(false);

  // PIX QR code state — set when onSubmit returns PIX payment data
  const [pixData, setPixData] = useState<{
    qrCode: string;
    qrCodeBase64?: string;
    expiresAt?: string;
  } | null>(null);

  // Load reservation data
  const loadReservation = useCallback(() => {
    fetch(`/api/public/reservation/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return; }
        setReservation(d.reservation);
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

  // Load MP public key
  useEffect(() => {
    fetch("/api/public/mp-config")
      .then(r => r.json())
      .then(d => { if (d.publicKey) setPublicKey(d.publicKey); });
  }, []);

  // Mount MP Payment Brick once we have reservation + publicKey and payment is pending
  useEffect(() => {
    if (!reservation || !publicKey) return;
    if (reservation.paymentStatus === "PAID") return;
    if (brickMountedRef.current) return;

    // Wait for container div to be in the DOM
    const container = document.getElementById("mp-payment-brick");
    if (!container) return;

    brickMountedRef.current = true;

    async function mountBrick() {
      if (!reservation) return;
      try {
        const mp = new window.MercadoPago(publicKey, { locale: "pt-BR" });
        const builder = mp.bricks();

        const instance = await builder.create("payment", "mp-payment-brick", {
          initialization: {
            amount: Number(reservation.totalAmount),
            payer: {
              firstName: reservation.guestName.split(" ")[0] || "",
              lastName: reservation.guestName.split(" ").slice(1).join(" ") || "",
              email: reservation.guestEmail || "",
            },
          },
          customization: {
            paymentMethods: {
              bankTransfer: "all",  // PIX
              creditCard: "all",
              // omitting debitCard, ticket, mercadoPago hides them
            },
            visual: {
              style: {
                theme: "default",
                customVariables: {
                  baseColor: "#4f46e5",
                  baseColorFirstVariant: "#4338ca",
                  baseColorSecondVariant: "#3730a3",
                },
              },
              hideFormTitle: true,
            },
          },
          callbacks: {
            onReady: () => setBrickReady(true),
            onSubmit: async ({ formData }: { formData: unknown }) => {
              const res = await fetch("/api/public/payments/process", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ code: reservation!.code, formData }),
              });
              const data = await res.json();
              if (!res.ok) {
                throw new Error(data.error || "Erro ao processar pagamento");
              }
              // If PIX — extract QR code and show in our own UI
              const txData = data?.point_of_interaction?.transaction_data;
              if (txData?.qr_code) {
                setPixData({
                  qrCode: txData.qr_code,
                  qrCodeBase64: txData.qr_code_base64,
                  expiresAt: data.date_of_expiration,
                });
              }
              setTimeout(loadReservation, 2000);
              return data;
            },
            onError: (err: unknown) => {
              console.error("Brick error:", JSON.stringify(err));
              const msg = (err as { message?: string })?.message || JSON.stringify(err);
              setBrickError(`Erro MP: ${msg}. Tente recarregar a página.`);
            },
          },
        });
        brickInstanceRef.current = instance;
      } catch (e) {
        console.error("Mount brick failed:", e);
        setBrickError("Não foi possível carregar o formulário de pagamento. Tente recarregar.");
        brickMountedRef.current = false;
      }
    }

    // Load MP SDK if not loaded yet
    if (window.MercadoPago) {
      mountBrick();
    } else {
      const script = document.createElement("script");
      script.src = "https://sdk.mercadopago.com/js/v2";
      script.async = true;
      script.onload = mountBrick;
      script.onerror = () => {
        setBrickError("Erro ao carregar SDK do Mercado Pago. Verifique sua conexão.");
        brickMountedRef.current = false;
      };
      document.head.appendChild(script);
    }
  }, [reservation, publicKey, loadReservation]);

  // ─── Loading ──────────────────────────────────────────────────────────────
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
  const baseAmount = Number(reservation.totalAmount) - Number(reservation.cleaningFee);

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
        <div>
          <p className="font-semibold text-sm">{statusCfg.label}</p>
          {isPaid && reservation.paymentMethod && (
            <p className="text-xs mt-0.5 opacity-75">via {reservation.paymentMethod}</p>
          )}
          {isPaid && reservation.paidAt && (
            <p className="text-xs mt-0.5 opacity-75">
              {new Date(reservation.paidAt).toLocaleString("pt-BR")}
            </p>
          )}
        </div>
      </div>

      {/* Reservation summary */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm mb-6 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-50 bg-slate-50/50">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Resumo da Reserva</p>
        </div>
        <div className="px-5 py-4 space-y-2.5">
          <Row label="Hóspede"   value={reservation.guestName} />
          <Row label="Imóvel"    value={reservation.property.name} />
          <Row label="Check-in"  value={fmtDate(reservation.checkIn)} />
          <Row label="Check-out" value={fmtDate(reservation.checkOut)} />
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

      {/* Payment Brick (shown when PENDING) */}
      {!isPaid && (
        <div className="mb-6">
          {!publicKey ? (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
              <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-amber-700">Gateway de pagamento não configurado</p>
              <p className="text-xs text-amber-600 mt-1">
                Entre em contato com a administração para finalizar o pagamento.
              </p>
            </div>
          ) : (
            <>
              {/* Brick loading skeleton */}
              {!brickReady && !brickError && (
                <div className="flex items-center justify-center gap-2 py-12 text-slate-400 text-sm">
                  <Loader2 size={18} className="animate-spin" />
                  Carregando formas de pagamento...
                </div>
              )}

              {/* Brick error */}
              {brickError && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700">Erro ao carregar pagamento</p>
                    <p className="text-xs text-red-600 mt-1">{brickError}</p>
                    <button
                      onClick={async () => {
                        // Destroy existing brick instance before retry
                        if (brickInstanceRef.current) {
                          try { await (brickInstanceRef.current as { unmount: () => void }).unmount(); } catch {}
                          brickInstanceRef.current = null;
                        }
                        brickMountedRef.current = false;
                        setBrickError("");
                        setBrickReady(false);
                      }}
                      className="mt-2 text-xs text-red-600 underline"
                    >
                      Tentar novamente
                    </button>
                  </div>
                </div>
              )}

              {/* The brick container must always be in the DOM */}
              <div id="mp-payment-brick" className={brickReady ? "opacity-100 transition-opacity duration-300" : "opacity-0"} />
            </>
          )}
        </div>
      )}

      {/* PIX QR Code — shown after onSubmit returns PIX payment */}
      {pixData && !isPaid && (
        <div className="mb-6 bg-white rounded-2xl border border-brand-200 shadow-sm overflow-hidden">
          <div className="bg-brand-600 px-5 py-3 flex items-center gap-2">
            <span className="text-white text-lg">⬡</span>
            <p className="font-bold text-white text-sm">Pague com PIX</p>
          </div>
          <div className="p-5">
            <p className="text-sm text-slate-600 mb-4 text-center">
              Escaneie o QR Code ou copie o código abaixo no app do seu banco
            </p>
            {pixData.qrCodeBase64 && (
              <div className="flex justify-center mb-4">
                <img
                  src={`data:image/png;base64,${pixData.qrCodeBase64}`}
                  alt="QR Code PIX"
                  width={200}
                  height={200}
                  className="rounded-xl border-2 border-slate-100"
                />
              </div>
            )}
            <p className="text-xs font-semibold text-slate-500 mb-2">Código PIX (copia e cola):</p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-3 break-all font-mono text-xs text-slate-600 leading-relaxed select-all">
              {pixData.qrCode}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(pixData.qrCode);
                setCopied(true);
                setTimeout(() => setCopied(false), 3000);
              }}
              className={`w-full py-3 rounded-xl text-sm font-semibold transition-colors ${
                copied
                  ? "bg-green-100 text-green-700 border border-green-300"
                  : "bg-slate-100 hover:bg-slate-200 text-slate-700"
              }`}
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

      {/* Paid confirmation */}
      {isPaid && (
        <div className="text-center py-6 bg-green-50 rounded-2xl border border-green-200">
          <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
          <p className="font-bold text-slate-800 text-lg">Reserva Confirmada!</p>
          <p className="text-sm text-slate-500 mt-1">
            Obrigado, {reservation.guestName}. Nos vemos em{" "}
            {fmtDate(reservation.checkIn)} 🎉
          </p>
        </div>
      )}

      <p className="text-center text-xs text-slate-300 mt-8">
        Pagamentos processados com segurança via Mercado Pago
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
