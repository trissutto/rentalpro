"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";

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
const DAYS = ["D", "S", "T", "Q", "Q", "S", "S"];

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

  // Close on outside click (desktop only)
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  function handleDayClick(dateStr: string) {
    if (dateStr < todayStr) return;
    if (selecting === "checkIn") {
      onChangeCheckIn(dateStr);
      if (checkOut && dateStr >= checkOut) onChangeCheckOut("");
      setSelecting("checkOut");
    } else {
      if (dateStr <= checkIn) {
        onChangeCheckIn(dateStr);
        onChangeCheckOut("");
        setSelecting("checkOut");
      } else {
        onChangeCheckOut(dateStr);
        setSelecting("checkIn");
        setTimeout(() => setOpen(false), 200);
      }
    }
  }

  function getDayStyle(dateStr: string) {
    const isPast = dateStr < todayStr;
    const isCheckIn = dateStr === checkIn;
    const isCheckOut = dateStr === checkOut;
    const isSelected = isCheckIn || isCheckOut;
    let inRange = false;
    const endDate = checkOut || (selecting === "checkOut" && hoveredDate && hoveredDate > checkIn ? hoveredDate : null);
    if (checkIn && endDate && dateStr > checkIn && dateStr < endDate) inRange = true;

    if (isPast) return { bg: "transparent", text: "rgba(255,255,255,0.15)", cursor: "default" as const, selected: false, inRange: false };
    if (isSelected) return { bg: "#c9a84c", text: "#0a0a0a", cursor: "pointer" as const, selected: true, inRange: false };
    if (inRange) return { bg: "rgba(201,168,76,0.15)", text: "#fff", cursor: "pointer" as const, selected: false, inRange: true };
    return { bg: "transparent", text: "rgba(255,255,255,0.7)", cursor: "pointer" as const, selected: false, inRange: false };
  }

  // Second month
  const m2 = viewMonth === 11 ? 0 : viewMonth + 1;
  const y2 = viewMonth === 11 ? viewYear + 1 : viewYear;
  const fd2 = new Date(y2, m2, 1).getDay();
  const dim2 = new Date(y2, m2 + 1, 0).getDate();

  function renderMonth(year: number, month: number, fd: number, dim: number) {
    const cells: React.ReactNode[] = [];
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
          className="aspect-square rounded-full flex items-center justify-center text-sm transition-all duration-100"
          style={{
            background: st.bg,
            color: st.text,
            cursor: st.cursor,
            fontWeight: st.selected ? 700 : 400,
          }}
        >
          {d}
        </button>
      );
    }
    return cells;
  }

  const nights = checkIn && checkOut ? Math.round((parseDate(checkOut)!.getTime() - parseDate(checkIn)!.getTime()) / 86400000) : 0;

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button type="button" onClick={() => setOpen(!open)} className="flex items-center gap-3 w-full text-left">
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] mb-0.5 uppercase tracking-wider" style={{ color: "#c9a84c" }}>Entrada</label>
          <span className="text-sm text-white font-medium">{checkIn ? formatShort(checkIn) : "Selecionar"}</span>
        </div>
        <div className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>→</div>
        <div className="flex-1 min-w-0">
          <label className="block text-[10px] mb-0.5 uppercase tracking-wider" style={{ color: "#c9a84c" }}>Saída</label>
          <span className="text-sm text-white font-medium">{checkOut ? formatShort(checkOut) : "Selecionar"}</span>
        </div>
        <Calendar size={16} style={{ color: "#c9a84c", flexShrink: 0 }} />
      </button>

      {/* Calendar modal */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/70 z-[100]" onClick={() => setOpen(false)} />

          {/* Calendar panel — fullscreen on mobile, floating on desktop */}
          <div
            className="fixed inset-0 z-[101] flex items-end sm:items-center justify-center sm:p-4"
          >
            <div
              className="w-full sm:max-w-[580px] sm:rounded-2xl rounded-t-2xl overflow-hidden"
              style={{
                background: "#14141e",
                border: "1px solid rgba(201,168,76,0.2)",
                maxHeight: "85vh",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <div>
                  <p className="text-sm font-semibold text-white">
                    {selecting === "checkIn" ? "Selecione a entrada" : "Selecione a saída"}
                  </p>
                  {checkIn && (
                    <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {formatShort(checkIn)}{checkOut ? ` → ${formatShort(checkOut)} · ${nights} noite${nights !== 1 ? "s" : ""}` : ""}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setOpen(false)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
                  <X size={16} className="text-white" />
                </button>
              </div>

              {/* Calendar body */}
              <div className="p-4 overflow-y-auto" style={{ maxHeight: "calc(85vh - 70px)" }}>
                <div className="flex flex-col sm:flex-row gap-6">
                  {/* Month 1 */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <button type="button" onClick={prevMonth} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <ChevronLeft size={16} style={{ color: "#c9a84c" }} />
                      </button>
                      <span className="text-sm font-semibold text-white">{MONTHS[viewMonth]} {viewYear}</span>
                      <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center sm:invisible" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <ChevronRight size={16} style={{ color: "#c9a84c" }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {DAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-semibold py-1" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {renderMonth(viewYear, viewMonth, firstDay, daysInMonth)}
                    </div>
                  </div>

                  {/* Month 2 */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="w-8" />
                      <span className="text-sm font-semibold text-white">{MONTHS[m2]} {y2}</span>
                      <button type="button" onClick={nextMonth} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <ChevronRight size={16} style={{ color: "#c9a84c" }} />
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {DAYS.map((d, i) => <div key={i} className="text-center text-[11px] font-semibold py-1" style={{ color: "rgba(255,255,255,0.3)" }}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1">
                      {renderMonth(y2, m2, fd2, dim2)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer with confirm */}
              {checkIn && checkOut && (
                <div className="px-5 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
                    style={{ background: "#c9a84c", color: "#0a0a0a" }}
                  >
                    Confirmar · {formatShort(checkIn)} → {formatShort(checkOut)} ({nights} noite{nights !== 1 ? "s" : ""})
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
