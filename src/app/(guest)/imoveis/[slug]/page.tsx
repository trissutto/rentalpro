"use client";

import { withGuestAccess } from "@/hooks/useGuestAccess";

import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  MapPin, Users, Bed, Bath, Calendar,
  ChevronLeft, CheckCircle2, Loader2,
  ChevronRight, X, AlertTriangle, LayoutGrid, Star,
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

// ─── Galeria de fotos (estilo Airbnb) ─────────────────────────────────────────
function PhotoGallery({ photos, coverPhoto, name }: { photos: string[]; coverPhoto?: string | null; name: string }) {
  const [showAll, setShowAll] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);

  const sorted = coverPhoto
    ? [coverPhoto, ...photos.filter(p => p !== coverPhoto)]
    : photos;

  if (sorted.length === 0) {
    return (
      <div className="aspect-[2/1] bg-gradient-to-br from-brand-100 to-brand-300 rounded-3xl flex items-center justify-center mb-6">
        <span className="text-7xl">🏠</span>
      </div>
    );
  }

  const prev = () => setCurrent(i => (i - 1 + sorted.length) % sorted.length);
  const next = () => setCurrent(i => (i + 1) % sorted.length);
  const lbPrev = () => setLightbox(i => i === null ? null : (i - 1 + sorted.length) % sorted.length);
  const lbNext = () => setLightbox(i => i === null ? null : (i + 1) % sorted.length);

  return (
    <>
      {/* ── Mobile: carrossel ── */}
      <div className="relative sm:hidden -mx-4 mb-5">
        <div className="relative aspect-[4/3] overflow-hidden bg-slate-100" onClick={() => setShowAll(true)}>
          <img src={sorted[current]} alt={`${name} - foto ${current + 1}`} className="w-full h-full object-cover" />
          <div className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full backdrop-blur">
            {current + 1} / {sorted.length}
          </div>
        </div>
        {sorted.length > 1 && (
          <>
            <button onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
              <ChevronLeft size={16} className="text-slate-700" />
            </button>
            <button onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow">
              <ChevronRight size={16} className="text-slate-700" />
            </button>
          </>
        )}
      </div>

      {/* ── Desktop: mosaico estilo Airbnb (1 grande + 4 pequenas) ── */}
      <div className="hidden sm:block relative mb-6">
        <div className="grid grid-cols-4 grid-rows-2 gap-2 rounded-3xl overflow-hidden aspect-[2/1]">
          <div className="col-span-2 row-span-2 relative cursor-pointer group overflow-hidden" onClick={() => setShowAll(true)}>
            <img src={sorted[0]} alt={`${name} - foto principal`}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
          </div>
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="relative cursor-pointer group overflow-hidden" onClick={() => setShowAll(true)}>
              {sorted[i] ? (
                <>
                  <img src={sorted[i]} alt={`${name} - foto ${i + 1}`}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition" />
                </>
              ) : (
                <div className="w-full h-full bg-slate-100" />
              )}
            </div>
          ))}
        </div>
        <button onClick={() => setShowAll(true)}
          className="absolute bottom-4 right-4 flex items-center gap-2 bg-white border border-slate-900 text-slate-900 text-sm font-semibold px-4 py-2 rounded-lg shadow hover:bg-slate-50 transition">
          <LayoutGrid size={15} />
          Mostrar todas as fotos
        </button>
      </div>

      {/* ── Modal: todas as fotos (grade rolável, estilo Airbnb) ── */}
      {showAll && (
        <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
          <div className="sticky top-0 bg-white/95 backdrop-blur z-10 flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <button onClick={() => setShowAll(false)}
              className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 text-sm font-medium">
              <ChevronLeft size={18} /> Voltar
            </button>
            <span className="text-sm text-slate-500">{sorted.length} fotos</span>
          </div>
          <div className="max-w-3xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-2 gap-2">
            {sorted.map((url, i) => (
              <img key={url + i} src={url} alt={`${name} - foto ${i + 1}`}
                onClick={() => setLightbox(i)}
                className={`w-full object-cover rounded-xl cursor-pointer hover:opacity-95 transition ${i % 3 === 0 ? "md:col-span-2 aspect-[2/1]" : "aspect-[4/3]"}`}
                loading="lazy" />
            ))}
          </div>
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightbox !== null && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X size={28} />
          </button>
          {sorted.length > 1 && (
            <>
              <button onClick={(e) => { e.stopPropagation(); lbPrev(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/40 transition text-white">
                <ChevronLeft size={20} />
              </button>
              <button onClick={(e) => { e.stopPropagation(); lbNext(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/40 transition text-white">
                <ChevronRight size={20} />
              </button>
            </>
          )}
          <img src={sorted[lightbox]} alt="" className="max-w-full max-h-[85vh] object-contain rounded-xl"
            onClick={e => e.stopPropagation()} />
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
            {lightbox + 1} / {sorted.length}
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

interface DynamicGroup { label: string; count: number; unitPrice: number; subtotal: number }
interface ServerQuote { requestKey: string; totalAmount: number; accommodationTotal: number; cleaningFee: number; extraGuestTotal: number; diarias: number; nightCount: number; groups: DynamicGroup[] }

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
  rangeStart: string;
  rangeEnd: string;
  occupiedDates: Set<string>;
  minNightsRules: MinNightsRule[];
  checkIn: string;
  checkOut: string;
  onSelectCheckIn: (d: string) => void;
  onSelectCheckOut: (d: string) => void;
}

function AvailabilityCalendar({
  occupiedDates, minNightsRules, rangeStart, rangeEnd,
  checkIn, checkOut,
  onSelectCheckIn, onSelectCheckOut,
}: CalendarProps) {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [viewYear,  setViewYear]  = useState(() => {
    if (checkIn) return Number(checkIn.split("-")[0]);
    return new Date().getFullYear();
  });
  const [viewMonth, setViewMonth] = useState(() => {
    if (checkIn) return Number(checkIn.split("-")[1]) - 1;
    return new Date().getMonth();
  });
  // true = aguardando click do check-out
  const [pickingOut, setPickingOut] = useState(() => !!(checkIn && !checkOut));

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
    if (ds < todayStr || ds < rangeStart || ds > rangeEnd || occupiedDates.has(ds)) return;

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
        <button type="button" aria-label="Mês anterior" onClick={goPrev}
          className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-500 transition">
          <ChevronLeft size={18} />
        </button>
        <p className="text-sm font-bold text-slate-800 tracking-wide">
          {MONTH_NAMES[viewMonth]} {viewYear}
        </p>
        <button type="button" aria-label="Próximo mês" onClick={goNext}
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

            const isPast     = ds < todayStr || ds < rangeStart || ds > rangeEnd;
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

            let cellCls = "relative flex items-center justify-center h-9 text-sm transition-all select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-700 ";

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
                aria-label={new Date(ds + "T12:00:00Z").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                aria-pressed={isCI || isCO}
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
  const [availError, setAvailError] = useState("");
  const [availReady, setAvailReady] = useState(false);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [coverage, setCoverage] = useState({ start: "", end: "" });
  const [quote, setQuote] = useState<ServerQuote | null>(null);
  const [quoteError, setQuoteError] = useState("");
  const [quoteVersion, setQuoteVersion] = useState(0);
  const [successToken, setSuccessToken] = useState("");
  const [availLoading, setAvailLoading] = useState(false);

  const [form, setForm] = useState({
    guestName: "",
    guestEmail: "",
    guestPhone: "",
    guestCount: Number(searchParams.get("guests")) || 2,
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

  // Unknown availability must never be presented as free dates.
  useEffect(() => {
    if (!property?.id) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    setAvailLoading(true); setAvailReady(false); setAvailError("");
    fetch(`/api/public/availability?propertyId=${property.id}&months=24`, { signal: controller.signal, cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error("Disponibilidade indisponível"); return r.json(); })
      .then(data => {
        if (!Array.isArray(data.occupiedDates) || !data.rangeStart || !data.rangeEnd) throw new Error("Resposta inválida");
        if (!active) return;
        setOccupiedDates(new Set(data.occupiedDates));
        setMinNightsRules(data.minNightsRules ?? []);
        setCoverage({ start: data.rangeStart, end: data.rangeEnd });
        setAvailReady(true);
      })
      .catch(() => { if (active) setAvailError("Não foi possível consultar as datas. Tente novamente antes de reservar."); })
      .finally(() => { clearTimeout(timeout); if (active) setAvailLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [property?.id, availabilityVersion]);

  const quoteKey = JSON.stringify([property?.id, form.checkIn, form.checkOut, form.guestCount]);
  useEffect(() => {
    setQuote(null); setQuoteError("");
    if (!property?.id || !form.checkIn || !form.checkOut || form.checkOut < form.checkIn) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    const query = new URLSearchParams({ propertyId: property.id, checkIn: form.checkIn, checkOut: form.checkOut, guestCount: String(form.guestCount) });
    fetch("/api/public/pricing-preview?" + query, { signal: controller.signal, cache: "no-store" })
      .then(async r => { const data = await r.json(); if (!r.ok) throw new Error(data.error || "Não foi possível calcular o valor"); return data.quote; })
      .then(data => { if (!data || !Number.isFinite(data.totalAmount)) throw new Error("Cotação inválida"); if (active) setQuote({ ...data, requestKey: quoteKey }); })
      .catch(e => { if (active) setQuoteError(e.name === "AbortError" ? "A consulta do valor demorou demais. Tente novamente." : e.message); })
      .finally(() => clearTimeout(timeout));
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [property?.id, form.checkIn, form.checkOut, form.guestCount, quoteKey, quoteVersion]);
  const quoteReady = quote?.requestKey === quoteKey;

  const nights = form.checkIn && form.checkOut
    ? Math.ceil((new Date(form.checkOut).getTime() - new Date(form.checkIn).getTime()) / 86400000) + 1
    : 0;

  const idealGuests   = (property as unknown as Record<string, number>)?.idealGuests ?? 2;
  const maxGuestsLimit = (property as unknown as Record<string, number>)?.maxGuests ?? property?.capacity ?? 30;
  const extraGuestFee = property?.extraGuestFee ?? 0;
  const extraGuests   = Math.max(0, form.guestCount - idealGuests);
  const extraTotal    = quoteReady ? quote!.extraGuestTotal : 0;

  const dynamicCalc = quoteReady ? { total: quote!.accommodationTotal, groups: quote!.groups, hasVariation: true } : null;
  const accommodationTotal = quoteReady ? quote!.accommodationTotal : 0;
  const total = quoteReady ? quote!.totalAmount : 0;
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
    if (!availReady || availError || !quoteReady) { toast.error("Aguarde a consulta das datas e do valor antes de reservar."); return; }
    if (form.checkIn < coverage.start || form.checkOut > coverage.end) { toast.error("Datas fora do período de disponibilidade consultado."); return; }
    if (nights <= 0) { toast.error("Selecione datas válidas"); return; }
    if (minNightsViolated) {
      toast.error(`Estadia mínima: ${minNightsRequired} diárias${minNightsRuleName ? ` (${minNightsRuleName})` : ""}`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/reservation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, propertyId: property.id, expectedTotal: quote!.totalAmount }),
      });
      const data = await res.json();
      if (!res.ok) { if (data.code === "PRICE_CHANGED") setQuoteVersion(v => v + 1); throw new Error(data.error); }
      setSuccessGuestCount(form.guestCount);
      setSuccess(data.reservation.code);
      setSuccessToken(data.reservation.accessToken);
      toast.success("Reserva criada! Finalize o pagamento para confirmar.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Erro ao reservar");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="space-y-4">
      <div className="skeleton aspect-square rounded-2xl" />
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
        <p className="text-xs text-brand-400 mt-2">Guarde o link de pagamento abaixo para acessar sua reserva com segurança</p>
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5 text-left">
        <p className="text-xs text-amber-700 font-semibold mb-0.5">⚠️ As datas ainda não estão confirmadas</p>
        <p className="text-xs text-amber-600">As datas ficam reservadas temporariamente por até 2 horas. Conclua o pagamento dentro desse prazo.</p>
      </div>
      <div className="flex flex-col gap-3">
        <a href={withGuestAccess(`/pagar/${success}`, successToken)}
          className="block bg-brand-600 text-white font-bold py-4 rounded-xl hover:bg-brand-700 transition-colors text-base shadow-sm">
          💳 Pagar agora e confirmar →
        </a>
        <a href={withGuestAccess(`/reserva/${success}/hospedes`, successToken)}
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

      {/* ── Cabeçalho estilo Airbnb: título acima da galeria ── */}
      <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-1">{property.name}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-600 mb-4 text-sm">
        <span className="flex items-center gap-1 font-medium text-slate-900">
          <Star size={13} fill="currentColor" /> 5,0
        </span>
        <span className="text-slate-300">·</span>
        <span className="underline">Avaliações no Airbnb</span>
        <span className="text-slate-300">·</span>
        <span className="flex items-center gap-1"><MapPin size={13} /> {property.address}, {property.city} — {property.state}</span>
      </div>

      <PhotoGallery
        photos={parseJSON((property as any).photos ?? "[]")}
        coverPhoto={(property as any).coverPhoto}
        name={property.name}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: property details */}
        <div className="lg:col-span-2">

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

              {/* ── Resumo de datas selecionadas ── */}
              {(form.checkIn || form.checkOut) && (
                <div className="flex items-center gap-2 p-3 bg-brand-50 border border-brand-200 rounded-xl">
                  <Calendar size={16} className="text-brand-600 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                    <span className="font-bold text-brand-700">
                      {form.checkIn
                        ? new Date(form.checkIn + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                        : "—"}
                    </span>
                    <span className="text-brand-400 mx-2">→</span>
                    <span className="font-bold text-brand-700">
                      {form.checkOut
                        ? new Date(form.checkOut + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
                        : "…"}
                    </span>
                    {nights > 0 && quoteReady && (
                      <span className="ml-2 text-brand-600 font-bold">· {Math.max(0, nights - 1)} noites · {nights} diárias</span>
                    )}
                    {nights > 0 && dynamicCalc && (
                      <span className="ml-2 font-bold text-brand-800">
                        · {formatCurrency(dynamicCalc.total + Number(property.cleaningFee))}
                      </span>
                    )}
                  </div>
                  <button type="button" aria-label="Limpar datas selecionadas"
                    onClick={() => setForm(p => ({ ...p, checkIn: "", checkOut: "" }))}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-brand-400 hover:text-red-500 hover:bg-red-50 transition">
                    <X size={14} />
                  </button>
                </div>
              )}

              {/* ── Calendário de disponibilidade ── */}
              <div className="space-y-2">
                {/* Calendário */}
                {availLoading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-slate-400 text-sm">
                    <Loader2 size={14} className="animate-spin" /> Carregando disponibilidade…
                  </div>
                ) : availError || !availReady ? (
                  <div role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                    <p>{availError || "Consultando disponibilidade..."}</p>
                    <button type="button" onClick={() => setAvailabilityVersion(v => v + 1)} className="underline font-semibold mt-2">Tentar novamente</button>
                  </div>
                ) : (
                  <AvailabilityCalendar
                      rangeStart={coverage.start}
                      rangeEnd={coverage.end}
                    occupiedDates={occupiedDates}
                    minNightsRules={minNightsRules}
                    checkIn={form.checkIn}
                    checkOut={form.checkOut}
                    onSelectCheckIn={(d) => setForm(p => ({ ...p, checkIn: d, checkOut: "" }))}
                    onSelectCheckOut={(d) => setForm(p => ({ ...p, checkOut: d }))}
                  />
                )}

                {/* Aviso de estadia mínima */}
                {minNightsViolated && (
                  <div className="flex gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                    <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-red-700">
                      <p className="font-bold mb-0.5">Estadia mínima não atingida</p>
                      <p>
                        {minNightsRuleName ? <><strong>{minNightsRuleName}</strong> exige </> : "Este período exige "}
                        mínimo de <strong>{minNightsRequired} diárias</strong>.
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
              {nights > 0 && quoteReady && (
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
                        <span className="font-medium">{formatCurrency(quote?.cleaningFee ?? property.cleaningFee)}</span>
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

              {nights > 0 && !quoteReady && (
                <div role="status" className="text-sm text-amber-800">
                  {quoteError || "Calculando o valor da hospedagem..."}
                  {quoteError && <button type="button" className="ml-2 underline" onClick={() => setQuoteVersion(v => v + 1)}>Tentar novamente</button>}
                </div>
              )}
              <button type="submit"
                disabled={submitting || nights <= 0 || minNightsViolated || !availReady || !quoteReady || form.checkIn < coverage.start || form.checkOut > coverage.end}
                className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition-colors flex items-center justify-center gap-2">
                {submitting
                  ? <><Loader2 size={16} className="animate-spin" /> Criando reserva...</>
                  : "Solicitar Reserva →"
                }
              </button>

              <p className="text-[10px] text-slate-400 text-center">
                Você receberá um link seguro para finalizar o pagamento e acompanhar a reserva
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
