"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

interface Props {
  checkIn: string;
  checkOut: string;
  onChangeCheckIn: (v: string) => void;
  onChangeCheckOut: (v: string) => void;
}

const MONTHS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseDate(s: string) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatShort(s: string) {
  const d = parseDate(s);
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function DateRangePicker({ checkIn, checkOut, onChangeCheckIn, onChangeCheckOut }: Props) {
  const [open, setOpen] = useState(false);
  const [selecting, setSelecting] = useState<"checkIn" | "checkOut">("checkIn");
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [viewYear, setViewYear] = useState(today.getFullYear());

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  function handleDayClick(dateStr: string) {
    if (dateStr < todayStr) return; // can't select past dates

    if (selecting === "checkIn") {
      onChangeCheckIn(dateStr);
      if (checkOut && dateStr >= checkOut) onChangeCheckOut("");
      setSelecting("checkOut");
    } else {
      if (dateStr <= checkIn) {
        // If selected before checkIn, restart
        onChangeCheckIn(dateStr);
        onChangeCheckOut("");
        setSelecting("checkOut");
      } else {
        onChangeCheckOut(dateStr);
        setSelecting("checkIn");
        setTimeout(() => setOpen(false), 300);
      }
    }
  }

  function getDayStyle(dateStr: string) {
    const isPast = dateStr < todayStr;
    const isCheckIn = dateStr === checkIn;
    const isCheckOut = dateStr === checkOut;
    const isSelected = isCheckIn || isCheckOut;

    // Range highlight
    let inRange = false;
    const endDate = checkOut || (selecting === "checkOut" && hoveredDate && hoveredDate > checkIn ? hoveredDate : null);
    if (checkIn && endDate && dateStr > checkIn && dateStr < endDate) {
      inRange = true;
    }

    if (isPast) return { bg: "transparent", text: "rgba(255,255,255,0.15)", cursor: "default", ring: false, inRange: false };
    if (isSelected) return { bg: "#c9a84c", text: "#0a0a0a", cursor: "pointer", ring: true, inRange: false };
    if (inRange) return { bg: "rgba(201,168,76,0.15)", text: "#fff", cursor: "pointer", ring: false, inRange: true };
    return { bg: "transparent", text: "rgba(255,255,255,0.7)", cursor: "pointer", ring: false, inRange: false };
  }

  // Second month
  const nextMonthIdx = viewMonth === 11 ? 0 : viewMonth + 1;
  const nextMonthYear = viewMonth === 11 ? viewYear + 1 : viewYear;
  const firstDay2 = new Date(nextMonthYear, nextMonthIdx, 1).getDay();
  const daysInMonth2 = new Date(nextMonthYear, nextMonthIdx + 1, 0).getDate();

  function renderMonth(year: number, month: number, fd: number, dim: number) {
    const cells: React.ReactNode[] = [];
    // Empty cells before first day
    for (let i = 0; i < fd; i++) cells.push(<div key={`e${i}`} />);
    for (let d = 1; d <= dim; d++) {
      const ds = toDateStr(year, month, d);
      const st = getDayStyle(ds);
      cells.push(
        <button
          key={d}
          type="button"
          onClick={() => handleDayClick(ds)}
          onMouseEnter={() => setHoveredDate(ds)}
          onMouseLeave={() => setHoveredDate(null)}
          className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all duration-150"
          style={{
            background: st.bg,
            color: st.text,
            cursor: st.cursor,
            fontWeight: st.ring ? 700 : 400,
          }}
        >
          {d}
        </button>
      );
    }
    return cells;
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-4 w-full text-left"
      >
        <div className="flex-1">
          <label className="block text-xs mb-1" style={{ color: "#c9a84c" }}>ENTRADA</label>
          <span className="text-sm text-white">{checkIn ? formatShort(checkIn) : "Selecionar"}</span>
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>→</div>
        <div className="flex-1">
          <label className="block text-xs mb-1" style={{ color: "#c9a84c" }}>SAÍDA</label>
          <span className="text-sm text-white">{checkOut ? formatShort(checkOut) : "Selecionar"}</span>
        </div>
        <Calendar size={16} style={{ color: "#c9a84c", flexShrink: 0 }} />
      </button>

      {/* Calendar dropdown */}
      {open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 top-full mt-3 z-50 rounded-2xl p-4 shadow-2xl"
          style={{
            background: "rgba(20,20,30,0.97)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(201,168,76,0.2)",
            minWidth: 300,
          }}
        >
          {/* Selection hint */}
          <div className="text-center text-xs mb-3 font-medium" style={{ color: "#c9a84c" }}>
            {selecting === "checkIn" ? "Selecione a data de entrada" : "Selecione a data de saída"}
          </div>

          {/* Desktop: two months side by side, Mobile: one month */}
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Month 1 */}
            <div className="flex-1" style={{ minWidth: 260 }}>
              <div className="flex items-center justify-between mb-3 px-1">
                <button type="button" onClick={prevMonth} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronLeft size={16} style={{ color: "#c9a84c" }} />
                </button>
                <span className="text-sm font-semibold text-white">
                  {MONTHS[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={nextMonth} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors sm:invisible">
                  <ChevronRight size={16} style={{ color: "#c9a84c" }} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {DAYS.map(d => <div key={d} className="text-[10px] font-semibold py-1" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 place-items-center">
                {renderMonth(viewYear, viewMonth, firstDay, daysInMonth)}
              </div>
            </div>

            {/* Month 2 (hidden on small mobile) */}
            <div className="hidden sm:block flex-1" style={{ minWidth: 260 }}>
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="w-7" />
                <span className="text-sm font-semibold text-white">
                  {MONTHS[nextMonthIdx]} {nextMonthYear}
                </span>
                <button type="button" onClick={nextMonth} className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors">
                  <ChevronRight size={16} style={{ color: "#c9a84c" }} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-1 text-center mb-1">
                {DAYS.map(d => <div key={d} className="text-[10px] font-semibold py-1" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 place-items-center">
                {renderMonth(nextMonthYear, nextMonthIdx, firstDay2, daysInMonth2)}
              </div>
            </div>
          </div>

          {/* Quick summary */}
          {checkIn && checkOut && (
            <div className="mt-3 pt-3 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>
              {formatShort(checkIn)} → {formatShort(checkOut)} · {Math.round((parseDate(checkOut)!.getTime() - parseDate(checkIn)!.getTime()) / 86400000)} noites
            </div>
          )}
        </div>
      )}
    </div>
  );
}
