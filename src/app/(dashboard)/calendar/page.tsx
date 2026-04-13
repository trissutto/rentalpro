"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  addDays, format, startOfWeek, eachDayOfInterval, isSameDay, isToday,
  startOfMonth, endOfMonth, addMonths, subMonths, getYear, getMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft, ChevronRight, X, User, Calendar,
  Moon, DollarSign, FileText, ChevronDown,
  Lock, Unlock, Link, RefreshCw, Trash2,
} from "lucide-react";
import { apiRequest } from "@/hooks/useAuth";
import { cn, formatCurrency, formatDate, getStatusColor, getStatusLabel } from "@/lib/utils";
import toast from "react-hot-toast";

// Brazilian national holidays (same list as pricing system)
const HOLIDAY_LIST: { date: string; name: string }[] = [
  { date: "2026-01-01", name: "Confraternização Universal" },
  { date: "2026-02-16", name: "Carnaval" },
  { date: "2026-02-17", name: "Carnaval" },
  { date: "2026-04-03", name: "Sexta-feira Santa" },
  { date: "2026-04-05", name: "Páscoa" },
  { date: "2026-04-21", name: "Tiradentes" },
  { date: "2026-05-01", name: "Dia do Trabalhador" },
  { date: "2026-06-04", name: "Corpus Christi" },
  { date: "2026-09-07", name: "Independência do Brasil" },
  { date: "2026-10-12", name: "Nossa Sra. Aparecida" },
  { date: "2026-11-02", name: "Finados" },
  { date: "2026-11-15", name: "Proclamação da República" },
  { date: "2026-12-25", name: "Natal" },
  { date: "2027-01-01", name: "Confraternização Universal" },
  { date: "2027-02-08", name: "Carnaval" },
  { date: "2027-02-09", name: "Carnaval" },
  { date: "2027-03-26", name: "Sexta-feira Santa" },
  { date: "2027-03-28", name: "Páscoa" },
  { date: "2027-04-21", name: "Tiradentes" },
  { date: "2027-05-01", name: "Dia do Trabalhador" },
  { date: "2027-05-27", name: "Corpus Christi" },
  { date: "2027-09-07", name: "Independência do Brasil" },
  { date: "2027-10-12", name: "Nossa Sra. Aparecida" },
  { date: "2027-11-02", name: "Finados" },
  { date: "2027-11-15", name: "Proclamação da República" },
  { date: "2027-12-25", name: "Natal" },
];

// Build a quick lookup map: "YYYY-MM-DD" → holiday name
const HOLIDAY_MAP = new Map(HOLIDAY_LIST.map(h => [h.date, h.name]));

function getHolidayInfo(day: Date): string | null {
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  return HOLIDAY_MAP.get(key) ?? null;
}

// A day is a "package" date if it falls within a holiday long-weekend window
// (Fri holiday → Fri/Sat/Sun; Mon holiday → Sat/Sun/Mon)
function getPackageDates(): Set<string> {
  const packageDays = new Set<string>();
  for (const { date } of HOLIDAY_LIST) {
    const d = new Date(date + "T12:00:00");
    const dow = d.getDay(); // 0=Sun, 5=Fri, 1=Mon
    if (dow === 5) {
      // Friday holiday → Fri + Sat + Sun
      for (let i = 0; i <= 2; i++) {
        const nd = new Date(d);
        nd.setDate(d.getDate() + i);
        packageDays.add(nd.toISOString().split("T")[0]);
      }
    } else if (dow === 1) {
      // Monday holiday → Sat + Sun + Mon
      for (let i = -2; i <= 0; i++) {
        const nd = new Date(d);
        nd.setDate(d.getDate() + i);
        packageDays.add(nd.toISOString().split("T")[0]);
      }
    }
  }
  return packageDays;
}

const PACKAGE_DATES = getPackageDates();

interface Property {
  id: string;
  name: string;
  city: string;
  capacity: number;
}

interface Reservation {
  id: string;
  code: string;
  propertyId: string;
  guestName: string;
  guestCount: number;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalAmount: number;
  status: string;
  source: string;
  notes?: string;
}

interface Cleaning {
  id: string;
  propertyId: string;
  scheduledDate: string;
  status: string;
}

interface DateBlock {
  id: string;
  propertyId: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: string;
  source?: string;
}

const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: "bg-blue-500",
  CHECKED_IN: "bg-green-500",
  CHECKED_OUT: "bg-slate-400",
  PENDING: "bg-yellow-400",
  CANCELLED: "bg-red-400",
};

const MONTHS_PT = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];

export default function CalendarPage() {
  // Month-based navigation: we track year + month
  const today = new Date();
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth()); // 0-indexed
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [weekStart, setWeekStart] = useState(startOfWeek(today, { weekStartsOn: 1 }));

  const [properties, setProperties] = useState<Property[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [cleanings, setCleanings] = useState<Cleaning[]>([]);
  const [dateBlocks, setDateBlocks] = useState<DateBlock[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [cityFilter, setCityFilter] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(today.getFullYear());
  const pickerRef = useRef<HTMLDivElement>(null);

  // ── Block mode ─────────────────────────────────────────────────────────
  const [blockMode, setBlockMode]           = useState(false);
  const [blockStart, setBlockStart]         = useState<{ propertyId: string; date: string } | null>(null);
  const [blockModal, setBlockModal]         = useState<{
    propertyId: string; startDate: string; endDate: string
  } | null>(null);
  const [blockReason, setBlockReason]       = useState("Bloqueio");
  const [blockType, setBlockType]           = useState("MANUAL");
  const [savingBlock, setSavingBlock]       = useState(false);
  const [selectedBlock, setSelectedBlock]   = useState<DateBlock | null>(null);

  // ── iCal modal ─────────────────────────────────────────────────────────
  const [icalModal, setIcalModal]           = useState(false);
  const [icalPropertyId, setIcalPropertyId] = useState("");
  const [icalUrl, setIcalUrl]               = useState("");
  const [icalLabel, setIcalLabel]           = useState("Airbnb");
  const [syncingIcal, setSyncingIcal]       = useState(false);

  // Compute days range based on view mode
  const { startDate, endDate, days } = (() => {
    if (viewMode === "month") {
      const s = startOfMonth(new Date(viewYear, viewMonth, 1));
      const e = endOfMonth(s);
      return { startDate: s, endDate: e, days: eachDayOfInterval({ start: s, end: e }) };
    } else {
      const s = weekStart;
      const e = addDays(s, 13);
      return { startDate: s, endDate: e, days: eachDayOfInterval({ start: s, end: e }) };
    }
  })();

  // Close picker on outside click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    loadCalendar();
    // Scroll today into view
    setTimeout(() => {
      document.getElementById("today-col")?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }, 400);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewYear, viewMonth, viewMode, weekStart, cityFilter]);

  async function loadCalendar() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        from: startDate.toISOString(),
        to: endDate.toISOString(),
        ...(cityFilter ? { city: cityFilter } : {}),
      });
      const [calRes, blocksRes] = await Promise.all([
        apiRequest(`/api/reservations/calendar?${params}`),
        apiRequest(`/api/date-blocks?from=${startDate.toISOString()}&to=${endDate.toISOString()}`).catch(() => null),
      ]);
      const calData    = await calRes.json();
      const blocksData = blocksRes ? await blocksRes.json().catch(() => ({ blocks: [] })) : { blocks: [] };
      setProperties(calData.properties);
      setReservations(calData.reservations);
      setCleanings(calData.cleanings);
      setDateBlocks(blocksData.blocks ?? []);
    } catch {
      toast.error("Erro ao carregar calendário");
    } finally {
      setLoading(false);
    }
  }

  // ── Block helpers ────────────────────────────────────────────────────────
  function getBlockForCell(propertyId: string, day: Date): DateBlock | null {
    const ds = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
    return dateBlocks.find(b => {
      if (b.propertyId !== propertyId) return false;
      const s = b.startDate.slice(0, 10);
      const e = b.endDate.slice(0, 10);
      return ds >= s && ds <= e;
    }) ?? null;
  }

  function handleBlockCellClick(propertyId: string, day: Date) {
    if (!blockMode) return;
    const ds = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;

    if (!blockStart || blockStart.propertyId !== propertyId) {
      setBlockStart({ propertyId, date: ds });
      toast("Agora clique na data de fim do bloqueio", { icon: "🔒" });
    } else {
      const start = blockStart.date <= ds ? blockStart.date : ds;
      const end   = blockStart.date <= ds ? ds : blockStart.date;
      setBlockStart(null);
      setBlockReason("Bloqueio");
      setBlockType("MANUAL");
      setBlockModal({ propertyId, startDate: start, endDate: end });
    }
  }

  async function confirmBlock() {
    if (!blockModal) return;
    setSavingBlock(true);
    try {
      const res = await apiRequest("/api/date-blocks", {
        method: "POST",
        body: JSON.stringify({
          propertyId: blockModal.propertyId,
          startDate: blockModal.startDate,
          endDate: blockModal.endDate,
          reason: blockReason,
          type: blockType,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Erro ${res.status}`);
      }
      toast.success("Datas bloqueadas!");
      setBlockModal(null);
      setBlockMode(false);
      loadCalendar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao bloquear datas");
    } finally {
      setSavingBlock(false);
    }
  }

  async function deleteBlock(blockId: string) {
    if (!confirm("Remover este bloqueio?")) return;
    await apiRequest(`/api/date-blocks/${blockId}`, { method: "DELETE" });
    toast.success("Bloqueio removido");
    setSelectedBlock(null);
    loadCalendar();
  }

  async function syncIcal() {
    if (!icalPropertyId || !icalUrl) return;
    setSyncingIcal(true);
    try {
      const res = await apiRequest("/api/ical-sync", {
        method: "POST",
        body: JSON.stringify({ propertyId: icalPropertyId, url: icalUrl, label: icalLabel }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(`✅ ${data.created} bloqueios importados do ${icalLabel}`);
      setIcalModal(false);
      setIcalUrl("");
      loadCalendar();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao sincronizar iCal");
    } finally {
      setSyncingIcal(false);
    }
  }

  function prevPeriod() {
    if (viewMode === "month") {
      const prev = subMonths(new Date(viewYear, viewMonth, 1), 1);
      setViewYear(prev.getFullYear());
      setViewMonth(prev.getMonth());
    } else {
      setWeekStart(d => addDays(d, -14));
    }
  }

  function nextPeriod() {
    if (viewMode === "month") {
      const next = addMonths(new Date(viewYear, viewMonth, 1), 1);
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
    } else {
      setWeekStart(d => addDays(d, 14));
    }
  }

  function goToToday() {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
    setWeekStart(startOfWeek(t, { weekStartsOn: 1 }));
  }

  function selectMonth(m: number) {
    setViewMonth(m);
    setViewYear(pickerYear);
    setPickerOpen(false);
    setViewMode("month");
  }

  function getCellState(propertyId: string, day: Date) {
    const res = reservations.find((r) => {
      if (r.propertyId !== propertyId) return false;
      const ci = new Date(r.checkIn);
      const co = new Date(r.checkOut);
      return day >= ci && day < co;
    });
    const cleaning = cleanings.find(
      (c) => c.propertyId === propertyId && isSameDay(new Date(c.scheduledDate), day)
    );
    return { reservation: res, cleaning };
  }

  function getReservationSpan(res: Reservation, day: Date) {
    const ci = new Date(res.checkIn);
    const co = new Date(res.checkOut);
    const isStart = isSameDay(ci, day);
    const isEnd = isSameDay(addDays(co, -1), day);
    return { isStart, isEnd };
  }

  const cities = [...new Set(properties.map((p) => p.city))];
  const filteredProperties = cityFilter ? properties.filter((p) => p.city === cityFilter) : properties;

  const periodLabel = viewMode === "month"
    ? `${MONTHS_PT[viewMonth]} ${viewYear}`
    : `${format(startDate, "dd MMM", { locale: ptBR })} — ${format(endDate, "dd MMM yyyy", { locale: ptBR })}`;

  return (
    <div className="max-w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pt-1">
        <h1 className="text-2xl font-bold text-slate-900">Calendário</h1>
        {/* View toggle */}
        <div className="flex bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => { setViewMode("week"); setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 })); }}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", viewMode === "week" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700")}
          >2 sem</button>
          <button
            onClick={() => setViewMode("month")}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", viewMode === "month" ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700")}
          >Mês</button>
        </div>
      </div>

      {/* City filters */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setCityFilter("")}
          className={cn("px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all", !cityFilter ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300")}>
          Todas as cidades
        </button>
        {cities.map((city) => (
          <button key={city} onClick={() => setCityFilter(city)}
            className={cn("px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-all", cityFilter === city ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-slate-300")}>
            {city}
          </button>
        ))}
      </div>

      {/* Navigation bar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={prevPeriod}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition flex-shrink-0">
          <ChevronLeft size={16} className="text-slate-600" />
        </button>

        {/* Month/period label — clickable to open picker */}
        <div className="relative flex-1 flex justify-center" ref={pickerRef}>
          <button
            onClick={() => { setPickerYear(viewYear); setPickerOpen(p => !p); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:border-brand-300 hover:bg-brand-50 transition font-semibold text-slate-800 text-sm"
          >
            {periodLabel}
            <ChevronDown size={14} className={cn("text-slate-400 transition-transform", pickerOpen && "rotate-180")} />
          </button>

          {/* Month picker dropdown */}
          <AnimatePresence>
            {pickerOpen && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full mt-2 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 z-50 w-72"
              >
                {/* Year selector */}
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => setPickerYear(y => y - 1)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <ChevronLeft size={14} className="text-slate-600" />
                  </button>
                  <span className="text-sm font-bold text-slate-800">{pickerYear}</span>
                  <button onClick={() => setPickerYear(y => y + 1)}
                    className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center">
                    <ChevronRight size={14} className="text-slate-600" />
                  </button>
                </div>

                {/* Month grid */}
                <div className="grid grid-cols-3 gap-2">
                  {MONTHS_PT.map((name, i) => {
                    const isSelected = pickerYear === viewYear && i === viewMonth;
                    const isCurrent = pickerYear === today.getFullYear() && i === today.getMonth();
                    return (
                      <button
                        key={name}
                        onClick={() => selectMonth(i)}
                        className={cn(
                          "py-2 rounded-xl text-xs font-semibold transition-all",
                          isSelected
                            ? "bg-brand-600 text-white"
                            : isCurrent
                            ? "bg-brand-50 text-brand-700 border border-brand-200"
                            : "hover:bg-slate-100 text-slate-700"
                        )}
                      >
                        {name.substring(0, 3)}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button onClick={goToToday}
          className="px-3 py-2 rounded-xl bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition flex-shrink-0">
          Hoje
        </button>

        <button onClick={nextPeriod}
          className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition flex-shrink-0">
          <ChevronRight size={16} className="text-slate-600" />
        </button>
      </div>

      {/* Legend + action buttons */}
      <div className="flex items-center gap-3 mb-4 flex-wrap justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { color: "bg-blue-500", label: "Confirmada" },
            { color: "bg-green-500", label: "Hospedado" },
            { color: "bg-slate-400", label: "Check-out" },
            { color: "bg-yellow-400", label: "Limpeza" },
            { color: "bg-orange-400", label: "Feriado" },
            { color: "bg-red-200",    label: "Bloqueado" },
          ].map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setBlockMode(m => !m); setBlockStart(null); }}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition",
              blockMode
                ? "bg-red-500 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-600 hover:border-red-300 hover:text-red-600"
            )}
          >
            {blockMode ? <Unlock size={13} /> : <Lock size={13} />}
            {blockMode ? "Cancelar bloqueio" : "Bloquear datas"}
          </button>

          <button
            onClick={() => { setIcalModal(true); setIcalPropertyId(properties[0]?.id ?? ""); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600 transition"
          >
            <Link size={13} /> Importar iCal
          </button>
        </div>
      </div>

      {/* Block mode banner */}
      {blockMode && (
        <div className="mb-3 flex items-center gap-2 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <Lock size={14} className="flex-shrink-0" />
          <p>
            <strong>Modo bloqueio ativo.</strong>{" "}
            {blockStart
              ? `Data de início: ${blockStart.date} — clique na data de fim.`
              : "Clique na data de início do bloqueio no calendário abaixo."}
          </p>
        </div>
      )}

      {/* Calendar grid */}
      <div className="bg-white rounded-2xl shadow-card border border-slate-100 overflow-hidden">
        <div className="overflow-auto" style={{ maxHeight: "62vh" }}>
          <table
            className="border-collapse"
            style={{ minWidth: `${180 + days.length * 45}px` }}
          >
            {/* Header */}
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                <th className="sticky left-0 z-20 bg-white min-w-[150px] w-[150px] p-3 text-left border-b border-r border-slate-100">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Imóvel</span>
                </th>
                {days.map((day) => {
                  const dayKey = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                  const holidayName = getHolidayInfo(day);
                  const isPackage = PACKAGE_DATES.has(dayKey);
                  const isHolidayDay = !!holidayName;
                  const isHighlighted = isHolidayDay || isPackage;

                  return (
                    <th
                      key={day.toISOString()}
                      id={isToday(day) ? "today-col" : undefined}
                      title={holidayName ?? (isPackage ? "Pacote de feriado" : undefined)}
                      className={cn(
                        "min-w-[41px] w-[41px] p-1.5 text-center border-b border-r border-slate-100 last:border-r-0",
                        isToday(day) && "bg-brand-50",
                        isHighlighted && !isToday(day) && "bg-orange-50"
                      )}
                    >
                      <p className={cn(
                        "text-[9px] font-semibold uppercase tracking-wide",
                        isToday(day) ? "text-brand-500" : isHighlighted ? "text-orange-500" : "text-slate-400"
                      )}>
                        {format(day, "EEE", { locale: ptBR }).substring(0, 3)}
                      </p>
                      <p className={cn(
                        "text-xs font-bold mt-0.5 leading-none",
                        isToday(day)
                          ? "text-white bg-brand-600 rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                          : isHolidayDay
                          ? "text-white bg-orange-400 rounded-full w-6 h-6 flex items-center justify-center mx-auto"
                          : isPackage
                          ? "text-orange-600"
                          : day.getDay() === 0 || day.getDay() === 6
                          ? "text-slate-400"
                          : "text-slate-700"
                      )}>
                        {format(day, "d")}
                      </p>
                      {isHolidayDay && (
                        <div className="mt-0.5 w-1 h-1 rounded-full bg-orange-400 mx-auto" />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={days.length + 1} className="p-8 text-center text-slate-400 text-sm">
                    Carregando calendário...
                  </td>
                </tr>
              ) : filteredProperties.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 1} className="p-8 text-center text-slate-400 text-sm">
                    Nenhum imóvel encontrado
                  </td>
                </tr>
              ) : (
                filteredProperties.map((property, pIdx) => (
                  <tr key={property.id} className={cn(pIdx % 2 === 0 ? "bg-white" : "bg-slate-50/40")}>
                    {/* Property label */}
                    <td className="sticky left-0 z-10 bg-inherit p-2.5 border-r border-slate-100 border-b border-slate-50">
                      <p className="text-xs font-semibold text-slate-800 truncate max-w-[138px]">{property.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{property.city}</p>
                    </td>

                    {/* Day cells */}
                    {days.map((day) => {
                      const { reservation, cleaning } = getCellState(property.id, day);
                      const block = getBlockForCell(property.id, day);
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const dayKey2 = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
                      const isHolidayCell = !!getHolidayInfo(day);
                      const isPackageCell = PACKAGE_DATES.has(dayKey2);
                      const isBlockStart  = block && block.startDate.slice(0,10) === dayKey2;

                      // Block mode highlight
                      const isBlockTarget = blockMode && blockStart?.propertyId === property.id && blockStart.date === dayKey2;

                      if (block && !reservation) {
                        const isBlockEnd = block.endDate.slice(0, 10) === dayKey2;
                        return (
                          <td key={day.toISOString()}
                            className={cn(
                              "h-9 p-0 border-b border-slate-50 last:border-r-0 cursor-pointer select-none",
                              "w-[41px] min-w-[41px] max-w-[41px] overflow-hidden",
                              isToday(day) && "ring-inset ring-1 ring-red-400"
                            )}
                            onClick={() => blockMode ? handleBlockCellClick(property.id, day) : setSelectedBlock(block)}
                          >
                            <div className={cn(
                              "h-full flex items-center bg-red-500 hover:bg-red-600 transition-all overflow-hidden",
                              isBlockStart && "rounded-l-md ml-px border-l-2 border-red-700 pl-1",
                              isBlockEnd   && "rounded-r-md mr-px",
                              !isBlockStart && "justify-center",
                            )}>
                              {isBlockStart && (
                                <span className="flex items-center gap-0.5 text-white text-[10px] font-bold leading-none overflow-hidden w-full">
                                  <Lock size={9} className="flex-shrink-0" />
                                  <span className="truncate overflow-hidden">{block.reason}</span>
                                </span>
                              )}
                              {!isBlockStart && (
                                <Lock size={8} className="text-white opacity-40 flex-shrink-0" />
                              )}
                            </div>
                          </td>
                        );
                      }

                      if (reservation) {
                        const { isStart, isEnd } = getReservationSpan(reservation, day);
                        const bgColor = STATUS_COLORS[reservation.status] || "bg-blue-500";
                        return (
                          <td key={day.toISOString()}
                            className={cn(
                              "h-9 p-0 border-r border-b border-slate-50 last:border-r-0 select-none",
                              "w-[41px] min-w-[41px] max-w-[41px] overflow-hidden",
                              "cursor-pointer",
                              isToday(day) && "ring-inset ring-1 ring-brand-300"
                            )}
                            onClick={() => blockMode ? handleBlockCellClick(property.id, day) : setSelectedReservation(reservation)}
                          >
                            <div className={cn(
                              "h-full flex items-center px-1 hover:brightness-110 transition-all",
                              bgColor,
                              isStart && "rounded-l-md ml-px",
                              isEnd && "rounded-r-md mr-px",
                            )}>
                              {isStart && (
                                <span className="text-white text-[10px] font-bold truncate leading-none pl-0.5">
                                  {reservation.guestName.split(" ")[0]}
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td key={day.toISOString()}
                          className={cn(
                            "h-9 p-0.5 border-r border-b border-slate-50 last:border-r-0",
                            blockMode && "cursor-crosshair hover:bg-red-50",
                            isBlockTarget && "bg-red-100",
                            !blockMode && isToday(day) && "bg-brand-50/60",
                            !blockMode && isHolidayCell && !isToday(day) && "bg-orange-50",
                            !blockMode && isPackageCell && !isHolidayCell && !isToday(day) && "bg-orange-50/50",
                            !blockMode && isWeekend && !isToday(day) && !isHolidayCell && !isPackageCell && "bg-slate-50/70"
                          )}
                          onClick={() => blockMode && handleBlockCellClick(property.id, day)}
                        >
                          {cleaning && !blockMode && (
                            <div className={cn(
                              "h-full rounded flex items-center justify-center text-[11px]",
                              cleaning.status === "DONE" ? "bg-green-100" :
                              cleaning.status === "LATE" ? "bg-red-100" : "bg-yellow-100"
                            )}>🧹</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Days count badge */}
      <p className="text-xs text-slate-400 text-right mt-2">
        {viewMode === "month"
          ? `${days.length} dias · ${MONTHS_PT[viewMonth]} ${viewYear}`
          : `${days.length} dias`}
      </p>

      {/* ── Block confirmation modal ─────────────────────────────────────── */}
      <AnimatePresence>
        {blockModal && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setBlockModal(null); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Bloquear datas</h3>
                  <span className="text-xs text-slate-400">
                    {blockModal.startDate === blockModal.endDate
                      ? blockModal.startDate
                      : `${blockModal.startDate} → ${blockModal.endDate}`}
                  </span>
                </div>
                <button onClick={() => setBlockModal(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Type selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Tipo de bloqueio</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "MANUAL",       label: "Outro",         emoji: "🔒" },
                      { value: "MAINTENANCE",  label: "Manutenção",    emoji: "🔧" },
                      { value: "OWNER_USE",    label: "Uso próprio",   emoji: "🏠" },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setBlockType(opt.value)}
                        className={cn(
                          "py-3 rounded-xl text-xs font-semibold flex flex-col items-center gap-1 transition border",
                          blockType === opt.value
                            ? "bg-red-500 text-white border-red-500 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-red-300"
                        )}
                      >
                        <span className="text-lg">{opt.emoji}</span>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Reason input */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={blockReason}
                    onChange={e => setBlockReason(e.target.value)}
                    placeholder="Ex: Reforma na cozinha"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setBlockModal(null)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={confirmBlock}
                    disabled={savingBlock}
                    className="flex-1 btn-primary flex items-center justify-center gap-2"
                  >
                    {savingBlock ? (
                      <span className="animate-spin text-white">⟳</span>
                    ) : (
                      <Lock size={14} />
                    )}
                    Confirmar bloqueio
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Selected block detail modal ──────────────────────────────────── */}
      <AnimatePresence>
        {selectedBlock && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedBlock(null); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Bloqueio de datas</h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedBlock.id.slice(0, 12)}…</span>
                </div>
                <button onClick={() => setSelectedBlock(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                {/* Type badge */}
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold",
                    selectedBlock.type === "ICAL"        ? "bg-purple-100 text-purple-700" :
                    selectedBlock.type === "MAINTENANCE" ? "bg-amber-100 text-amber-700" :
                    selectedBlock.type === "OWNER_USE"   ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-600"
                  )}>
                    {selectedBlock.type === "ICAL"        ? "🔗 iCal" :
                     selectedBlock.type === "MAINTENANCE" ? "🔧 Manutenção" :
                     selectedBlock.type === "OWNER_USE"   ? "🏠 Uso próprio" :
                     "🔒 Manual"}
                  </span>
                  {selectedBlock.source && (
                    <span className="text-xs text-slate-400">via {selectedBlock.source}</span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={Calendar} label="Início" value={selectedBlock.startDate.slice(0, 10)} />
                  <InfoRow icon={Calendar} label="Fim"    value={selectedBlock.endDate.slice(0, 10)} />
                </div>

                <div className="p-3 bg-slate-50 rounded-xl">
                  <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">Motivo</p>
                  <p className="text-sm font-semibold text-slate-700">{selectedBlock.reason}</p>
                </div>

                {selectedBlock.type !== "ICAL" && (
                  <button
                    onClick={() => deleteBlock(selectedBlock.id)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-semibold transition border border-red-200"
                  >
                    <Trash2 size={14} /> Remover bloqueio
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── iCal import modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {icalModal && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setIcalModal(false); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Importar iCal</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Sincronize com Airbnb, Booking.com, VRBO e outros</p>
                </div>
                <button onClick={() => setIcalModal(false)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Property selector */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Imóvel</label>
                  <select
                    value={icalPropertyId}
                    onChange={e => setIcalPropertyId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 bg-white"
                  >
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>{p.name} — {p.city}</option>
                    ))}
                  </select>
                </div>

                {/* Source label */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">Plataforma</label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {["Airbnb", "Booking", "VRBO"].map(src => (
                      <button
                        key={src}
                        onClick={() => setIcalLabel(src)}
                        className={cn(
                          "py-2 rounded-xl text-xs font-semibold border transition",
                          icalLabel === src
                            ? "bg-brand-600 text-white border-brand-600"
                            : "bg-white text-slate-600 border-slate-200 hover:border-brand-300"
                        )}
                      >
                        {src}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={icalLabel}
                    onChange={e => setIcalLabel(e.target.value)}
                    placeholder="Ou digite a plataforma"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                </div>

                {/* Export link — copy to paste into Airbnb */}
                {icalPropertyId && (
                  <div className="p-3 bg-brand-50 rounded-xl border border-brand-100">
                    <p className="text-xs font-semibold text-brand-700 mb-1.5">
                      🔄 Link para exportar o RentalPro → Airbnb
                    </p>
                    <p className="text-[10px] text-brand-600 mb-2">
                      Cole esta URL no Airbnb em: Calendário → Importar calendário
                    </p>
                    <div className="flex gap-2">
                      <code className="flex-1 text-[10px] bg-white border border-brand-200 rounded-lg px-2 py-1.5 text-slate-600 truncate block">
                        {`${typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"}/api/ical-export/${icalPropertyId}`}
                      </code>
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}/api/ical-export/${icalPropertyId}`;
                          navigator.clipboard.writeText(url);
                          toast.success("Link copiado!");
                        }}
                        className="px-3 py-1.5 rounded-lg bg-brand-600 text-white text-xs font-semibold hover:bg-brand-700 transition flex-shrink-0"
                      >
                        Copiar
                      </button>
                    </div>
                  </div>
                )}

                {/* iCal URL */}
                <div>
                  <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-2">URL do iCal do Airbnb → RentalPro</label>
                  <input
                    type="url"
                    value={icalUrl}
                    onChange={e => setIcalUrl(e.target.value)}
                    placeholder="https://www.airbnb.com/calendar/ical/..."
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    No Airbnb: Calendário → Disponibilidade → Exportar calendário (.ics)
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setIcalModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={syncIcal}
                    disabled={syncingIcal || !icalUrl || !icalPropertyId}
                    className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {syncingIcal ? (
                      <RefreshCw size={14} className="animate-spin" />
                    ) : (
                      <Link size={14} />
                    )}
                    {syncingIcal ? "Importando..." : "Importar"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Reservation detail modal */}
      <AnimatePresence>
        {selectedReservation && (
          <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedReservation(null); }}>
            <motion.div
              className="modal-content"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Detalhes da Reserva</h3>
                  <span className="text-xs text-slate-400 font-mono">{selectedReservation.code}</span>
                </div>
                <button onClick={() => setSelectedReservation(null)} className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition">
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <div className={cn("inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border", getStatusColor(selectedReservation.status))}>
                  {getStatusLabel(selectedReservation.status)}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <InfoRow icon={User} label="Hóspede" value={selectedReservation.guestName} />
                  <InfoRow icon={User} label="Pessoas" value={`${selectedReservation.guestCount} hóspedes`} />
                  <InfoRow icon={Calendar} label="Check-in" value={formatDate(selectedReservation.checkIn)} />
                  <InfoRow icon={Calendar} label="Check-out" value={formatDate(selectedReservation.checkOut)} />
                  <InfoRow icon={Moon} label="Diárias" value={`${selectedReservation.nights} diária${selectedReservation.nights !== 1 ? "s" : ""}`} />
                  <InfoRow icon={DollarSign} label="Total" value={formatCurrency(selectedReservation.totalAmount)} />
                </div>

                {selectedReservation.notes && (
                  <div className="p-3 bg-slate-50 rounded-xl">
                    <div className="flex items-start gap-2">
                      <FileText size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-slate-600">{selectedReservation.notes}</p>
                    </div>
                  </div>
                )}

                <button
                  onClick={() => { window.location.href = `/reservations/${selectedReservation.id}`; }}
                  className="btn-primary w-full"
                >
                  Ver reserva completa →
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5 p-3 bg-slate-50 rounded-xl">
      <Icon size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
      <div>
        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-slate-800 mt-0.5">{value}</p>
      </div>
    </div>
  );
}
