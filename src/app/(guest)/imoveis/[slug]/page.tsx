"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin, Users, Bed, Bath, Calendar,
  ChevronLeft, CheckCircle2, Loader2,
  ChevronRight, X, AlertTriangle,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  state: string;
  description: string;
  capacity: number;
  bedrooms: number;
  bathrooms: number;
  basePrice: number;
  cleaningFee: number;
  amenities: string | string[];
  photos: string | string[];
  coverPhoto?: string | null;
  rules: string;
  idealGuests?: number;
  maxGuests?: number;
  extraGuestFee?: number;
}

interface MinNightsRule {
  name: string;
  type: string;
  daysOfWeek: number[] | null;
  startDate: string | null;
  endDate: string | null;
  minNights: number;
}

// ─── Galeria de fotos ─────────────────────────────────────────────────────────
function PhotoGallery({ photos, coverPhoto, name }: { photos: string[]; coverPhoto?: string | null; name: string }) {
  const [current, setCurrent] = useState(0);
  const [lightbox, setLightbox] = useState(false);

  const sorted = coverPhoto
    ? [coverPhoto, ...photos.filter(p => p !== coverPhoto)]
    : photos;

  if (sorted.length === 0) {
    return (
      <div className="h-72 bg-gradient-to-br from-brand-100 to-brand-300 rounded-3xl flex items-center justify-center mb-6">
        <span className="text-7xl">🏠</span>
      </div>
    );
  }

  const prev = () => setCurrent(i => (i - 1 + sorted.length) % sorted.length);
  const next = () => setCurrent(i => (i + 1) % sorted.length);

  return (
    <>
      <div className="relative mb-3 rounded-3xl overflow-hidden group cursor-pointer" onClick={() => setLightbox(true)}>
        <img src={sorted[current]} alt={`${name} - foto ${current + 1}`}
          className="w-full h-72 object-cover transition-transform duration-300 group-hover:scale-105" />
        <div className="absolute inset-0 bg-black/10 group-hover:bg-black/20 transition" />
        <div className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur">
          {current + 1} / {sorted.length}
        </div>
        {sorted.length > 1 && (
          <>
            <button onClick={(e) => { e.stopPropagation(); prev(); }}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center hover:bg-white transition opacity-0 group-hover:opacity-100 shadow">
              <ChevronLeft size={18} className="text-slate-700" />
            </button>
            <button onClick={(e) => { e.stopPropagation(); next(); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 bg-white/80 backdrop-blur rounded-full flex items-center justify-center hover:bg-white transition opacity-0 group-hover:opacity-100 shadow">
              <ChevronRight size={18} className="text-slate-700" />
            </button>
          </>
        )}
      </div>
      {sorted.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide">
          {sorted.map((url, i) => (
            <button key={url} onClick={() => setCurrent(i)}
              className={`flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition ${
                i === current ? "border-brand-500 shadow-sm" : "border-transparent opacity-70 hover:opacity-100"
              }`}>
              <img src={url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {lightbox && (
        <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <button onClick={() => setLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X size={28} />
          </button>
          {sorted.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); prev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/40 transition text-white">
                <ChevronLeft size={20} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); next(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/40 transition text-white">
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <img src={sorted[current]} alt="" className="max-w-full max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {current + 1} / {sorted.length}
          </p>
        </div>
      )}
    </>
  );
}

function parseJSON(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

// ── Feriados nacionais Brasil 2025-2027 ────────────────────────────────────
const KNOWN_HOLIDAYS_CLIENT = new Set([
  "2025-01-01","2025-02-28","2025-03-01","2025-03-02",
  "2025-04-18","2025-04-20","2025-04-21","2025-05-01",
  "2025-06-19","2025-09-07","2025-10-12","2025-11-02",
  "2025-11-15","2025-11-20","2025-12-25",
  "2026-01-01","2026-02-13","2026-02-16","2026-02-17",
  "2026-04-03","2026-04-05","2026-04-21","2026-05-01",
  "2026-06-04","2026-09-07","2026-10-12","2026-11-02",
  "2026-11-15","2026-11-20","2026-12-25",
  "2027-01-01","2027-02-26","2027-03-01","2027-03-02",
  "2027-03-26","2027-03-28","2027-04-21","2027-05-01",
  "2027-06-24","2027-09-07","2027-10-12","2027-11-02",
  "2027-11-15","2027-11-20","2027-12-25",
]);

interface DynamicGroup { label: string; count: number; unitPrice: number; subtotal: number }

function calcDynamicTotal(
  checkIn: string, checkOut: string, basePrice: number,
  holidayCoeff = 1.3, weekendCoeff = 1.2,
): { total: number; hasVariation: boolean; groups: DynamicGroup[] } {
  const days: { date: string; finalPrice: number; label: string }[] = [];
  const cur = new Date(checkIn + "T12:00:00Z");
  const end = new Date(checkOut + "T12:00:00Z");
  while (cur <= end && days.length < 60) {
    const ds  = cur.toISOString().slice(0, 10);
    const dow = cur.getUTCDay();
    let coeff = 1.0; let label = "Diária padrão";
    if (KNOWN_HOLIDAYS_CLIENT.has(ds))      { coeff = holidayCoeff;  label = "Feriado"; }
    else if ([0, 5, 6].includes(dow))       { coeff = weekendCoeff;  label = "Fim de semana"; }
    days.push({ date: ds, finalPrice: Math.round(basePrice * coeff * 100) / 100, label });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  const total    = Math.round(days.reduce((s, d) => s + d.finalPrice, 0) * 100) / 100;
  const flatTotal = Math.round(basePrice * days.length * 100) / 100;
  const hasVariation = Math.abs(total - flatTotal) > 0.01;
  const groups: DynamicGroup[] = [];
  for (const day of days) {
    const last = groups[groups.length - 1];
    if (last && last.label === day.label && Math.abs(last.unitPrice - day.finalPrice) < 0.01) {
      last.count++; last.subtotal = Math.round((last.subtotal + day.finalPrice) * 100) / 100;
    } else {
      groups.push({ label: day.label, count: 1, unitPrice: day.finalPrice, subtotal: day.finalPrice });
    }
  }
  return { total, hasVariation, groups };
}

// ── Availability Calendar ──────────────────────────────────────────────────
const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DAY_INITIALS = ["D","S","T","Q","Q","S","S"]; // Dom→Sáb

function getMinNightsForDate(dateStr: string, rules: MinNightsRule[]): number {
  let max = 1;
  const d = new Date(dateStr + "T12:00:00Z");
  const dow = d.getUTCDay();
  for (const rule of rules) {
    if (rule.type === "PACKAGE" && rule.startDate && rule.endDate) {
      if (dateStr >= rule.startDate && dateStr <= rule.endDate)
        max = Math.max(max, rule.minNights);
    } else if (rule.type === "WEEKEND" && rule.daysOfWeek) {
      if (rule.daysOfWeek.includes(dow))
        max = Math.max(max, rule.minNights);
    }
  }
  return max;
}

interface CalendarProps {
  occupiedDates: Set<string>;
  minNightsRules: MinNightsRule[];
  checkIn: string;
  checkOut: string;
  onSelectCheckIn: (d: string) => void;
  onSelectCheckOut: (d: string) => void;
}

function AvailabilityCalendar({
  occupiedDates, minNightsRules,
  checkIn, checkOut,
  onSelectCheckIn, onSelectCheckOut,
}: CalendarProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [viewYear,  setViewYear]  = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  // true = aguardando click do check-out
  const [pickingOut, setPickingOut] = useState(false);

  const goPrev = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  // Build array: null = blank cell, string = YYYY-MM-DD
  function buildGrid(year: number, month: number): (string | null)[] {
    const firstDow   = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: (string | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(`${year}-${String(month + 1).padStart(2,"0")}-${String(d).padStart(2,"0")}`);
    }
    return cells;
  }

  function hasOccupiedInRange(from: string, to: string): boolean {
    const cur = new Date(from + "T12:00:00Z");
    const end = new Date(to   + "T12:00:00Z");
    cur.setUTCDate(cur.getUTCDate() + 1);
    while (cur < end) {
      if (occupiedDates.has(cur.toISOString().slice(0, 10))) return true;
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
    return false;
  }

  function handleDayClick(ds: string) {
    if (ds < todayStr || occupiedDates.has(ds)) return;

    if (!checkIn || !pickingOut) {
      // Primeiro clique: define check-in
      onSelectCheckIn(ds);
      onSelectCheckOut("");
      setPickingOut(true);
    } else {
      // Segundo clique: define check-out
      if (ds <= checkIn) {
        // clicou antes do check-in → reinicia
        onSelectCheckIn(ds);
        onSelectCheckOut("");
        setPickingOut(true);
        return;
      }
      if (hasOccupiedInRange(checkIn, ds)) {
        toast.error("Há datas indisponíveis nesse intervalo");
        return;
      }
      onSelectCheckOut(ds);
      setPickingOut(false);
    }
  }

  const grid = buildGrid(viewYear, viewMonth);
  const step = pickingOut ? 2 : 1;

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm">

      {/* ── Step indicator ── */}
      <div className="grid grid-cols-2 text-center text-[11px] font-semibold border-b border-slate-200">
        <div className={`py-2.5 flex items-center justify-center gap-1.5 transition ${
          step === 1 ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-500"
        }`}>
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
            step === 1 ? "bg-white text-brand-600 border-white" : "border-slate-300 text-slate-400"
          }`}>1</span>
          Check-in
        </div>
        <div className={`py-2.5 flex items-center justify-center gap-1.5 transition border-l border-slate-200 ${
          step === 2 ? "bg-brand-600 text-white" : "bg-slate-50 text-slate-500"
        }`}>
          <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold border ${
            step === 2 ? "bg-white text-brand-600 border-white" : "border-slate-300 text-slate-400"
          }`}>2</span>
          Check-out
        </div>
      </div>

      {/* ── Navigation ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100">
        <button type="button" onClick={goPrev}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-bold text-slate-800 tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button type="button" onClick={goNext}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Grid ── */}
      <div className="bg-white px-3 pt-2 pb-3">
        {/* Day-of-week headers */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_INITIALS.map((d, i) => (
            <div key={i} className={`text-center text-[11px] font-bold py-1 ${
              i === 0 || i === 6 ? "text-brand-400" : "text-slate-400"
            }`}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7">
          {grid.map((ds, idx) => {
            if (!ds) return <div key={`b${idx}`} />;

            const isPast     = ds < todayStr;
            const isOccupied = occupiedDates.has(ds);
            const isCI       = ds === checkIn;
            const isCO       = ds === checkOut;
            const inRange    = !!(checkIn && checkOut && ds > checkIn && ds < checkOut);
            const isToday    = ds === todayStr;
            const dayNum     = parseInt(ds.slice(-2));
            const dow        = new Date(ds + "T12:00:00Z").getUTCDay();
            const isWeekend  = dow === 0 || dow === 6;

            // Rounded corners only on edge of range
            const isRangeStart = isCI  && checkOut;
            const isRangeEnd   = isCO  && checkIn;

            let cellCls = "relative flex items-center justify-center h-9 text-sm transition-all select-none focus:outline-none ";

            if (isCI || isCO) {
              cellCls += "bg-brand-600 text-white font-bold z-10 shadow-sm ";
              cellCls += isCI ? "rounded-l-full" : "";
              cellCls += isCO ? "rounded-r-full" : "";
              if (isCI && !checkOut) cellCls += " rounded-full";
            } else if (inRange) {
              cellCls += "bg-brand-100 text-brand-800 font-medium ";
              if (isRangeStart) cellCls += "rounded-l-full ";
              if (isRangeEnd)   cellCls += "rounded-r-full ";
            } else if (isPast) {
              cellCls += "text-slate-300 cursor-default ";
            } else if (isOccupied) {
              cellCls += "bg-red-50 rounded-full cursor-not-allowed ";
            } else if (isToday) {
              cellCls += "font-bold text-brand-600 cursor-pointer hover:bg-brand-50 rounded-full ";
            } else {
              cellCls += `cursor-pointer rounded-full hover:bg-brand-50 ${isWeekend ? "text-brand-500 font-medium" : "text-slate-700"} `;
            }

            return (
              <button key={ds} type="button"
                className={cellCls}
                disabled={isPast || isOccupied}
                onClick={() => handleDayClick(ds)}
                title={isOccupied ? "Indisponível" : undefined}
              >
                {/* Today dot */}
                {isToday && !isCI && !isCO && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 bg-brand-500 rounded-full" />
                )}
                {isOccupied
                  ? <span className="text-red-300 text-sm line-through">{dayNum}</span>
                  : dayNum
                }
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Legend ── */}
      <div className="flex items-center gap-4 px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-brand-600" />
          <span className="text-[10px] text-slate-500">Selecionado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded bg-brand-100" />
          <span className="text-[10px] text-slate-500">Período</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-4 rounded-full bg-red-50 flex items-center justify-center">
            <span className="text-[9px] text-red-300 line-through font-medium leading-none">8</span>
          </div>
          <span className="text-[10px] text-slate-500">Ocupado</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-brand-500 font-bold">7</span>
          <span className="text-[10px] text-slate-500">Fim de semana</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────
export default function PropertyDetailPage() {
  const { slug } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const [property, setProperty] = useState<Property | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);

  // Availability data
  const [occupiedDates, setOccupiedDates] = useState<Set<string>>(new Set());
  const [minNightsRules, setMinNightsRules] = useState<MinNightsRule[]>([]);
  const [pricingCoeffs, setPricingCoeffs] = useState({ holiday: 1.3, weekend: 1.2, weekday: 1.0 });
  const [availLoading, setAvailLoading] = useState(false);

  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCount: 2,
    checkIn: searchParams.get("checkIn") || "",
    checkOut: searchParams.get("checkOut") || "",
    notes: "",
  });
  const [successGuestCount, setSuccessGuestCount] = useState(0);
  const [showPriceDetail, setShowPriceDetail] = useState(false);

  useEffect(() => {
    fetch(`/api/public/properties/${slug}`)
      .then((r) => r.json())
      .then((d) => { setProperty(d.property); setLoading(false); })
      .catch(() => setLoading(false));
  }, [slug]);

  // Load availability once we have the property id
  useEffect(() => {
    if (!property?.id) return;
    setAvailLoading(true);
    fetch(`/api/public/availability?propertyId=${property.id}&months=6`)
      .then(r => r.json())
      .then(data => {
        setOccupiedDates(new Set(data.occupiedDates ?? []));
        setMinNightsRules(data.minNightsRules ?? []);
        if (data.pricingCoeffs) setPricingCoeffs(data.pricingCoeffs);
      })
      .catch(() => {})
      .finally(() => setAvailLoading(false));
  }, [property?.id]);

  const nights = form.checkIn && form.checkOut
    ? Math.ceil((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86400000) + 1
    : 0;

  const idealGuests   = (property as unknown as Record<string, number>)?.idealGuests ?? 2;
  const maxGuestsLimit = (property as unknown as Record<string, number>)?.maxGuests ?? property?.capacity ?? 30;
  const extraGuestFee = property?.extraGuestFee ?? 0;
  const extraGuests   = Math.max(0, form.guestCount - idealGuests);
  const extraTotal    = extraGuests * extraGuestFee * nights;

  const dynamicCalc = property && form.checkIn && form.checkOut
    ? calcDynamicTotal(form.checkIn, form.checkOut, property.basePrice, pricingCoeffs.holiday, pricingCoeffs.weekend)
    : null;

  const accommodationTotal = dynamicCalc?.total ?? (property ? nights * property.basePrice : 0);
  const total = property ? accommodationTotal + property.cleaningFee + extraTotal : 0;
  const today = new Date().toISOString().split("T")[0];

  // Minimum nights validation
  const minNightsRequired = form.checkIn
    ? getMinNightsForDate(form.checkIn, minNightsRules)
    : 1;
  const minNightsViolated = nights > 0 && nights < minNightsRequired;

  // Min nights label for the violated period
  const minNightsRuleName = minNightsRules.find(r => {
    if (!form.checkIn) return false;
    const d = new Date(form.checkIn + "T12:00:00Z");
    const dow = d.getUTCDay();
    if (r.type === "PACKAGE" && r.startDate && r.endDate)
      return form.checkIn >= r.startDate && form.checkIn <= r.endDate;
    if (r.type === "WEEKEND" && r.daysOfWeek)
      return r.daysOfWeek.includes(dow);
    return false;
  })?.name ?? "";

  async function handleReserve(e: React.FormEvent) {
    e.preventDefault();
    if (!property) return;
    if (nights <= 0) { toast.error("Selecione datas válidas"); return; }
    if (minNightsViolated) {
      toast.error(`Estadia mínima: ${minNightsRequired} noites${minNightsRuleName ? ` (${minNightsRuleName})` : ""}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertyId: property.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessGuestCount(form.guestCount);
      setSuccess(data.reservation.code);
      toast.success("Reserva criada! Finalize o pagamento para confirmar.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao reservar");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="skeleton h-64 rounded-2xl" />
      <div className="skeleton h-8 w-1/2 rounded" />
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  );

  if (!property) return (
    <div className="text-center py-16">
      <p className="text-slate-400 text-lg">Imóvel não encontrado.</p>
      <button onClick={() => router.back()} className="mt-4 text-brand-600 hover:underline">← Voltar</button>
    </div>
  );

  if (success) return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="max-w-md mx-auto text-center py-12">
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <span className="text-4xl">🎉</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-900 mb-2">Reserva Solicitada!</h2>
      <p className="text-slate-500 mb-1">Seu pedido foi registrado com sucesso.</p>
      <p className="text-sm text-amber-600 font-medium mb-6">⏳ Finalize o pagamento para <strong>confirmar e garantir as datas</strong>.</p>
      <div className="bg-brand-50 rounded-2xl p-6 mb-3">
        <p className="text-sm text-brand-500 font-medium mb-1">CÓDIGO DA RESERVA</p>
        <p className="text-3xl font-bold text-brand-700 font-mono tracking-widest">{success}</p>
        <p className="text-xs text-brand-400 mt-2">Guarde este código — você precisará dele para pagar e acompanhar</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-left">
        <p className="text-xs text-amber-700 font-semibold mb-0.5">⚠️ As datas ainda não estão confirmadas</p>
        <p className="text-xs text-amber-600">Outro hóspede pode reservar as mesmas datas enquanto o pagamento não for finalizado.</p>
      </div>
      <div className="flex flex-col gap-3">
        <a href={`/pagar/${success}`}
          className="block bg-brand-600 text-white font-bold py-4 rounded-xl hover:bg-brand-700 transition-colors text-base shadow-sm">
          💳 Pagar agora e confirmar →
        </a>
        <a href={`/reserva/${success}/hospedes`}
          className="block bg-slate-100 text-slate-700 font-semibold py-3 rounded-xl hover:bg-slate-200 transition-colors text-sm">
          Cadastrar dados dos hóspedes
        </a>
        <button onClick={() => router.push("/imoveis")} className="text-slate-400 hover:text-slate-600 text-sm">
          Voltar à listagem
        </button>
      </div>
    </motion.div>
  );

  const amenities = parseJSON(property.amenities);

  return (
    <div className="max-w-5xl mx-auto">
      <button onClick={() => router.back()}
        className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 mb-5 text-sm">
        <ChevronLeft size={16} /> Voltar
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: property details */}
        <div className="lg:col-span-2">
          <PhotoGallery
            photos={parseJSON((property as any).photos ?? "[]")}
            coverPhoto={(property as any).coverPhoto}
            name={property.name}
          />

          <h1 className="text-2xl font-bold text-slate-900 mb-1">{property.name}</h1>
          <div className="flex items-center gap-1.5 text-slate-500 mb-5">
            <MapPin size={14} /> {property.address}, {property.city} — {property.state}
          </div>

          <div className="flex gap-4 mb-6">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-700">
              <Users size={15} className="text-slate-500" /> {property.capacity} hóspedes
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-700">
              <Bed size={15} className="text-slate-500" /> {property.bedrooms} quartos
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 rounded-xl text-sm font-medium text-slate-700">
              <Bath size={15} className="text-slate-500" /> {property.bathrooms} banheiros
            </div>
          </div>

          {property.description && (
            <div className="mb-6">
              <h2 className="font-bold text-slate-900 mb-2">Sobre o imóvel</h2>
              <p className="text-slate-600 leading-relaxed">{property.description}</p>
            </div>
          )}

          {amenities.length > 0 && (
            <div className="mb-6">
              <h2 className="font-bold text-slate-900 mb-3">Comodidades</h2>
              <div className="grid grid-cols-2 gap-2">
                {amenities.map((a) => (
                  <div key={a} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" /> {a}
                  </div>
                ))}
              </div>
            </div>
          )}

          {property.rules && (
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
              <h2 className="font-bold text-amber-800 mb-2">📋 Regras da casa</h2>
              <p className="text-sm text-amber-700 leading-relaxed">{property.rules}</p>
            </div>
          )}
        </div>

        {/* Right: booking form */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-3xl shadow-card-hover border border-slate-100 p-5 sticky top-24">
            {/* Preço base */}
            <div className="flex items-baseline gap-1 mb-4">
              <span className="text-xs text-slate-400 mr-0.5">a partir de</span>
              <span className="text-2xl font-bold text-slate-900">{formatCurrency(property.basePrice)}</span>
              <span className="text-slate-400 text-sm">/diária</span>
            </div>

            <form onSubmit={handleReserve} className="space-y-4">

              {/* ── Calendário de disponibilidade ── */}
              <div className="space-y-2">
                {/* Calendário */}
                {availLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                    <Loader2 size={14} className="animate-spin" /> Carregando disponibilidade…
                  </div>
                ) : (
                  <AvailabilityCalendar
                    occupiedDates={occupiedDates}
                    minNightsRules={minNightsRules}
                    checkIn={form.checkIn}
                    checkOut={form.checkOut}
                    onSelectCheckIn={(d) => setForm(p => ({ ...p, checkIn: d, checkOut: "" }))}
                    onSelectCheckOut={(d) => setForm(p => ({ ...p, checkOut: d }))}
                  />
                )}

                {/* Resumo de datas + limpar */}
                {(form.checkIn || form.checkOut) && (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-1.5 px-3 py-2 bg-brand-50 rounded-xl">
                      <Calendar size={12} className="text-brand-400 flex-shrink-0" />
                      <div className="text-xs">
                        <span className="font-semibold text-brand-700">
                          {form.checkIn
                            ? new Date(form.checkIn + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                            : "—"}
                        </span>
                        <span className="text-brand-300 mx-1.5">→</span>
                        <span className="font-semibold text-brand-700">
                          {form.checkOut
                            ? new Date(form.checkOut + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                            : "…"}
                        </span>
                        {nights > 0 && (
                          <span className="ml-2 text-brand-500 font-bold">
                            · {nights} diária{nights > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    </div>
                    <button type="button"
                      onClick={() => setForm(p => ({ ...p, checkIn: "", checkOut: "" }))}
                      className="w-8 h-8 flex items-center justify-center rounded-xl border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 transition">
                      <X size={13} />
                    </button>
                  </div>
                )}

                {/* Aviso de estadia mínima */}
                {minNightsViolated && (
                  <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700">
                      <p className="font-bold mb-0.5">Estadia mínima não atingida</p>
                      <p>
                        {minNightsRuleName ? <><strong>{minNightsRuleName}</strong> exige </> : "Este período exige "}
                        mínimo de <strong>{minNightsRequired} noites</strong>.
                        Você selecionou {nights}.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Seu nome *</label>
                <input type="text" placeholder="Nome completo" value={form.guestName}
                  onChange={(e) => setForm(p => ({ ...p, guestName: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">WhatsApp *</label>
                <input type="tel" placeholder="(11) 99999-9999" value={form.guestPhone}
                  onChange={(e) => setForm(p => ({ ...p, guestPhone: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                  required />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">E-mail</label>
                <input type="email" placeholder="seu@email.com" value={form.guestEmail}
                  onChange={(e) => setForm(p => ({ ...p, guestEmail: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>

              {/* Hóspedes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-600">Hóspedes *</label>
                  {extraGuestFee > 0 && (
                    <span className="text-[10px] text-slate-400">
                      base para {idealGuests} · <span className="text-red-400">+{formatCurrency(extraGuestFee)}/hósp./diária acima</span>
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: maxGuestsLimit }, (_, i) => i + 1).map((n) => {
                    const isAbove = n > idealGuests;
                    const isSel = form.guestCount === n;
                    return (
                      <button key={n} type="button"
                        onClick={() => setForm(p => ({ ...p, guestCount: n }))}
                        className={
                          isSel
                            ? isAbove
                              ? "w-9 h-9 rounded-xl text-sm font-bold border-2 bg-red-500 border-red-500 text-white"
                              : "w-9 h-9 rounded-xl text-sm font-bold border-2 bg-brand-600 border-brand-600 text-white"
                            : isAbove
                            ? "w-9 h-9 rounded-xl text-sm font-bold border-2 border-red-200 text-red-500 hover:bg-red-50"
                            : "w-9 h-9 rounded-xl text-sm font-bold border-2 border-slate-200 text-slate-600 hover:border-brand-300 hover:bg-brand-50"
                        }
                      >{n}</button>
                    );
                  })}
                </div>
                {form.guestCount > idealGuests && extraGuestFee > 0 && (
                  <p className="text-xs text-red-500 mt-1.5 font-medium">
                    ⚠ {form.guestCount - idealGuests} hósp. acima do ideal —
                    +{formatCurrency(extraGuestFee * (form.guestCount - idealGuests))}/diária
                  </p>
                )}
              </div>

              {/* ── Resumo de preço ── */}
              {nights > 0 && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden text-sm">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Resumo</p>
                      <p className="font-semibold text-slate-700">
                        {nights} diária{nights > 1 ? "s" : ""}
                        {dynamicCalc?.hasVariation && (
                          <span className="ml-1.5 text-[10px] font-normal bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            tarifas aplicadas
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-900 text-base">{formatCurrency(total)}</p>
                      <button type="button" onClick={() => setShowPriceDetail(v => !v)}
                        className="text-[10px] text-brand-500 hover:text-brand-700 underline underline-offset-2">
                        {showPriceDetail ? "ocultar detalhes" : "ver detalhes"}
                      </button>
                    </div>
                  </div>

                  {showPriceDetail && (
                    <div className="border-t border-slate-200 px-4 py-3 space-y-1.5">
                      {dynamicCalc?.hasVariation && dynamicCalc.groups.length > 0 ? (
                        dynamicCalc.groups.map((g, i) => (
                          <div key={i} className="flex justify-between text-slate-600 text-xs">
                            <span>
                              {formatCurrency(g.unitPrice)} × {g.count} diária{g.count > 1 ? "s" : ""}
                              <span className="text-slate-400 ml-1">({g.label})</span>
                            </span>
                            <span className="font-medium">{formatCurrency(g.subtotal)}</span>
                          </div>
                        ))
                      ) : (
                        <div className="flex justify-between text-slate-600 text-xs">
                          <span>{formatCurrency(property.basePrice)} × {nights} diária{nights > 1 ? "s" : ""}</span>
                          <span className="font-medium">{formatCurrency(accommodationTotal)}</span>
                        </div>
                      )}
                      {extraTotal > 0 && (
                        <div className="flex justify-between text-red-500 text-xs font-medium">
                          <span>+{extraGuests} hósp. extra × {nights} diária{nights > 1 ? "s" : ""}
                            <span className="text-red-400 ml-1">({formatCurrency(extraGuestFee)}/hósp.)</span>
                          </span>
                          <span>+{formatCurrency(extraTotal)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-600 text-xs">
                        <span>Taxa de limpeza</span>
                        <span className="font-medium">{formatCurrency(property.cleaningFee)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900 pt-1.5 border-t border-slate-200 text-sm">
                        <span>Total</span>
                        <span className={extraTotal > 0 ? "text-red-600" : ""}>{formatCurrency(total)}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Pedidos especiais</label>
                <textarea rows={2} placeholder="Berço, chegada tarde, animais..." value={form.notes}
                  onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none" />
              </div>

              <button type="submit"
                disabled={submitting || nights <= 0 || minNightsViolated}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Criando reserva...</>
                  : "Solicitar Reserva →"
                }
              </button>

              <p className="text-[10px] text-slate-400 text-center">
                Você receberá um código para finalizar o pagamento e confirmar a reserva
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
