"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Search, MapPin, Users, Bed, Bath,
  Shield, Headphones, Zap, Star, ChevronRight,
  CheckCircle, ChevronLeft,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";

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
}

function parseJSON(val: string | string[]): string[] {
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

const TESTIMONIALS = [
  {
    name: "Ana Paula S.",
    location: "São Paulo, SP",
    rating: 5,
    text: "Experiência incrível! A casa era exatamente como nas fotos, limpíssima e com tudo que precisávamos. Com certeza voltaremos!",
    initials: "AP",
    color: "from-violet-400 to-purple-600",
  },
  {
    name: "Carlos M.",
    location: "Belo Horizonte, MG",
    rating: 5,
    text: "Processo de reserva super fácil e rápido. O atendimento foi excelente e a propriedade superou todas as expectativas.",
    initials: "CM",
    color: "from-blue-400 to-cyan-600",
  },
  {
    name: "Fernanda R.",
    location: "Rio de Janeiro, RJ",
    rating: 5,
    text: "Finalmente um aluguel de temporada sem burocracia. Reservamos online, pagamos facilmente e as chaves estavam nos esperando. Perfeito!",
    initials: "FR",
    color: "from-emerald-400 to-teal-600",
  },
];

const BENEFITS = [
  {
    icon: Shield,
    title: "Reserva segura",
    desc: "Pagamento protegido e confirmação imediata. Seus dados sempre seguros.",
    color: "bg-blue-50 text-blue-600",
  },
  {
    icon: Zap,
    title: "Check-in fácil",
    desc: "Processo 100% digital. Sem filas, sem burocracia, só aproveitar.",
    color: "bg-amber-50 text-amber-600",
  },
  {
    icon: Headphones,
    title: "Suporte 24h",
    desc: "Nossa equipe está disponível para garantir uma estadia perfeita.",
    color: "bg-emerald-50 text-emerald-600",
  },
  {
    icon: CheckCircle,
    title: "Imóveis verificados",
    desc: "Todas as propriedades são inspecionadas e mantidas com cuidado.",
    color: "bg-purple-50 text-purple-600",
  },
];

const HERO_SLIDES = [
  "/hero-1.jpg",
  "/hero-2.jpg",
  "/hero-3.jpg",
  "/hero-4.jpg",
  "/hero-5.jpg",
  "/hero-6.jpg",
];

export default function PropertiesPublicPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guestsMin, setGuestsMin] = useState<number | null>(null);
  const [guestsMax, setGuestsMax] = useState<number | null>(null);
  const [activeQuick, setActiveQuick] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [slideDir, setSlideDir] = useState<"next" | "prev">("next");

  const nextSlide = useCallback(() => {
    setSlideDir("next");
    setSlideIndex((i) => (i + 1) % HERO_SLIDES.length);
  }, []);

  const prevSlide = () => {
    setSlideDir("prev");
    setSlideIndex((i) => (i - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  };

  useEffect(() => {
    const timer = setInterval(nextSlide, 5000);
    return () => clearInterval(timer);
  }, [nextSlide]);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties(filters?: { checkIn?: string; checkOut?: string; minGuests?: number | null; maxGuests?: number | null }) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.checkIn) params.set("checkIn", filters.checkIn);
      if (filters?.checkOut) params.set("checkOut", filters.checkOut);
      if (filters?.minGuests) params.set("minGuests", String(filters.minGuests));
      if (filters?.maxGuests) params.set("maxGuests", String(filters.maxGuests));
      const res = await fetch(`/api/public/properties?${params}`);
      const data = await res.json();
      setProperties(data.properties || []);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearched(true);
    loadProperties({ checkIn, checkOut, minGuests: guestsMin, maxGuests: guestsMax });
    setTimeout(() => {
      document.getElementById("imoveis-section")?.scrollIntoView({ behavior: "smooth" });
    }, 200);
  }

  // Feriados brasileiros fixos (mês/dia) e variáveis
  function getNextHoliday(): { label: string; checkIn: string; checkOut: string } {
    const now = new Date();
    const year = now.getFullYear();

    // Calcula Páscoa pelo algoritmo de Gauss simplificado
    function easter(y: number): Date {
      const a = y % 19, b = Math.floor(y / 100), c = y % 100;
      const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
      const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
      const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
      const m = Math.floor((a + 11 * h + 22 * l) / 451);
      const month = Math.floor((h + l - 7 * m + 114) / 31);
      const day = ((h + l - 7 * m + 114) % 31) + 1;
      return new Date(y, month - 1, day);
    }

    const fmt = (d: Date) => d.toISOString().split("T")[0];

    function makeRange(base: Date, daysBack = 2, duration = 4) {
      const ci = new Date(base); ci.setDate(ci.getDate() - daysBack);
      const co = new Date(ci); co.setDate(co.getDate() + duration);
      return { checkIn: fmt(ci), checkOut: fmt(co) };
    }

    const fixed = [
      { label: "Tiradentes 🏛️",    date: new Date(year, 3, 21) },
      { label: "Dia do Trabalho 🔨", date: new Date(year, 4, 1) },
      { label: "Independência 🇧🇷",  date: new Date(year, 8, 7) },
      { label: "Aparecida 🙏",       date: new Date(year, 9, 12) },
      { label: "Finados 🕯️",         date: new Date(year, 10, 2) },
      { label: "República 📜",        date: new Date(year, 10, 15) },
      { label: "Natal 🎄",            date: new Date(year, 11, 25) },
      { label: "Ano Novo 🎆",         date: new Date(year + 1, 0, 1) },
    ];

    const e = easter(year);
    const corpusChristi = new Date(e); corpusChristi.setDate(e.getDate() + 60);
    const variable = [
      { label: "Carnaval 🎭",         date: new Date(e.getTime() - 47 * 86400000) },
      { label: "Páscoa 🐣",           date: e },
      { label: "Corpus Christi ✝️",   date: corpusChristi },
    ];

    const all = [...fixed, ...variable]
      .map(h => ({ ...h, ...makeRange(h.date) }))
      .filter(h => new Date(h.checkIn) > now)
      .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

    return all[0] ?? { label: "Próximo Feriado 🎉", checkIn: fmt(now), checkOut: fmt(new Date(now.getTime() + 4 * 86400000)) };
  }

  function applyQuickFilter(key: string) {
    const fmt = (d: Date) => d.toISOString().split("T")[0];
    const now = new Date();
    setActiveQuick(key);

    if (key.startsWith("guests-")) {
      const parts = key.split("-"); // ["guests", "1", "5"] ou ["guests", "16"]
      const min = Number(parts[1]);
      const max = parts[2] ? Number(parts[2]) : null;
      setGuestsMin(min);
      setGuestsMax(max);
      setSearched(true);
      loadProperties({ checkIn, checkOut, minGuests: min, maxGuests: max });
      document.getElementById("imoveis-section")?.scrollIntoView({ behavior: "smooth" });
      return;
    }

    let ci = "", co = "";
    if (key === "feriado") {
      const h = getNextHoliday();
      ci = h.checkIn; co = h.checkOut;
    } else if (key === "fds") {
      // Próxima sexta
      const d = new Date(now);
      const dow = d.getDay();
      const daysToFri = (5 - dow + 7) % 7 || 7;
      d.setDate(d.getDate() + daysToFri);
      ci = fmt(d);
      const dom = new Date(d); dom.setDate(dom.getDate() + 2);
      co = fmt(dom);
    } else if (key === "semana") {
      const d = new Date(now); d.setDate(d.getDate() + 1);
      ci = fmt(d);
      const d2 = new Date(d); d2.setDate(d2.getDate() + 7);
      co = fmt(d2);
    }

    setCheckIn(ci); setCheckOut(co);
    setSearched(true);
    loadProperties({ checkIn: ci, checkOut: co, guests });
    setTimeout(() => document.getElementById("imoveis-section")?.scrollIntoView({ behavior: "smooth" }), 200);
  }

  function clearFilters() {
    setSearched(false); setCheckIn(""); setCheckOut(""); setGuestsMin(null); setGuestsMax(null); setActiveQuick(null);
    loadProperties();
  }

  const today = new Date().toISOString().split("T")[0];
  const nights = checkIn && checkOut
    ? Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
    : null;

  return (
    <div className="-mx-4 -mt-6">

      {/* ── HERO: DESTINATION FIRST ────────────────────────────────────── */}
      {/* Foto ocupa 100vh. Sem texto no centro. Só logo + bolinhas + setas. */}
      <section className="relative h-screen min-h-[600px] max-h-[900px]">

        {/* Slides com fade */}
        {HERO_SLIDES.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000"
            style={{ backgroundImage: `url('${src}')`, opacity: i === slideIndex ? 1 : 0 }}
          />
        ))}

        {/* Overlay: leve no topo, mais escuro embaixo para o painel branco "emergir" */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60" />

        {/* Logo / marca no topo esquerdo */}
        <div className="absolute top-5 left-5 z-10">
          <span className="text-white font-extrabold text-xl tracking-tight drop-shadow-lg">
            🌴 Villa Mare
          </span>
        </div>

        {/* Contador de slide — canto inferior direito */}
        <div className="absolute bottom-48 right-6 z-10 text-white/70 text-xs font-medium tabular-nums">
          {String(slideIndex + 1).padStart(2, "0")} / {String(HERO_SLIDES.length).padStart(2, "0")}
        </div>

        {/* Setas laterais */}
        <button
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-black/25 hover:bg-black/45 backdrop-blur-sm text-white rounded-full p-2.5 transition-all border border-white/20"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-black/25 hover:bg-black/45 backdrop-blur-sm text-white rounded-full p-2.5 transition-all border border-white/20"
        >
          <ChevronRight size={18} />
        </button>

        {/* Bolinhas — centralizadas, acima do painel */}
        <div className="absolute bottom-44 left-1/2 -translate-x-1/2 z-10 flex gap-2">
          {HERO_SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => { setSlideDir(i > slideIndex ? "next" : "prev"); setSlideIndex(i); }}
              className={`rounded-full transition-all duration-300 ${
                i === slideIndex ? "w-6 h-2 bg-white" : "w-2 h-2 bg-white/40 hover:bg-white/70"
              }`}
            />
          ))}
        </div>

        {/* ── PAINEL BRANCO que "sobe" por cima da foto ── */}
        <motion.div
          initial={{ y: 60, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          className="absolute bottom-0 left-0 right-0 z-10 bg-white rounded-t-3xl px-5 pt-7 pb-6 shadow-2xl"
        >
          {/* Puxador visual */}
          <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-5" />

          {/* Texto + form numa linha horizontal no desktop */}
          <div className="max-w-5xl mx-auto">
            <div className="mb-4">
              <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">🌊 Itanhaém · Litoral Paulista</p>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 leading-tight">
                Sua temporada <span className="text-teal-600">à beira-mar</span> começa aqui.
              </h1>
            </div>

            {/* Formulário de busca */}
            <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-2 items-stretch">
              <div className="flex-1 flex flex-col text-left px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-teal-200 transition-colors">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Check-in</label>
                <input
                  type="date"
                  min={today}
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="text-sm text-slate-800 bg-transparent focus:outline-none"
                />
              </div>
              <div className="flex-1 flex flex-col text-left px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:border-teal-200 transition-colors">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-0.5">Check-out</label>
                <input
                  type="date"
                  min={checkIn || today}
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="text-sm text-slate-800 bg-transparent focus:outline-none"
                />
              </div>
              <button
                type="submit"
                className="bg-teal-600 hover:bg-teal-700 active:scale-95 text-white font-bold px-8 py-3 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-500/25 whitespace-nowrap"
              >
                <Search size={15} /> Ver disponibilidade
              </button>
            </form>

            {/* Stats em linha */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-400">
              <span className="flex items-center gap-1"><Star size={11} className="text-amber-400 fill-amber-400" /> 5.0 avaliação</span>
              <span>🏖️ A minutos da praia</span>
              <span>✅ Check-in digital</span>
              <span>🔒 Pagamento seguro</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FILTROS RÁPIDOS ───────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 mt-8 mb-2">

        {/* Linha 1: data rápida */}
        <div className="mb-3">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">📅 Quando você quer ir?</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "feriado", emoji: "🎉", label: `Próximo Feriado — ${getNextHoliday().label.split(" ").slice(0, 1).join(" ")}` },
              { key: "fds",     emoji: "🏖️", label: "Fim de Semana" },
              { key: "semana",  emoji: "🌴", label: "Semana Completa" },
            ].map(({ key, emoji, label }) => (
              <button
                key={key}
                onClick={() => applyQuickFilter(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border transition-all ${
                  activeQuick === key
                    ? "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-200"
                    : "bg-white text-slate-700 border-slate-200 hover:border-teal-400 hover:text-teal-700 shadow-sm"
                }`}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Linha 2: quantidade de pessoas */}
        <div className="mb-5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">👥 Quantas pessoas?</p>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "guests-1-5",  label: "1 a 5 pessoas",  emoji: "👫" },
              { key: "guests-6-10", label: "6 a 10 pessoas",  emoji: "👨‍👩‍👧‍👦" },
              { key: "guests-11-15",label: "11 a 15 pessoas", emoji: "🏡" },
              { key: "guests-16",   label: "16+ pessoas",     emoji: "🎊" },
            ].map(({ key, label, emoji }) => (
              <button
                key={key}
                onClick={() => applyQuickFilter(key)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold border transition-all ${
                  activeQuick === key
                    ? "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-200"
                    : "bg-white text-slate-700 border-slate-200 hover:border-teal-400 hover:text-teal-700 shadow-sm"
                }`}
              >
                <span>{emoji}</span> {label}
              </button>
            ))}
          </div>
        </div>

        {/* Chip de filtro ativo + limpar */}
        {(searched || guestsMin) && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {checkIn && checkOut && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-3 py-1 rounded-full">
                📅 {new Date(checkIn + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                {" → "}
                {new Date(checkOut + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
              </span>
            )}
            {guestsMin && (
              <span className="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 text-xs font-medium px-3 py-1 rounded-full">
                👥 {guestsMax ? `${guestsMin} a ${guestsMax} pessoas` : `${guestsMin}+ pessoas`}
              </span>
            )}
            <button onClick={clearFilters} className="text-xs text-slate-400 hover:text-rose-500 underline transition-colors ml-1">
              limpar filtros ✕
            </button>
          </div>
        )}
      </section>

      {/* ── IMÓVEIS ───────────────────────────────────────────────────── */}
      <section id="imoveis-section" className="max-w-5xl mx-auto px-4 mb-20">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {searched
                ? `${properties.length} imóvel${properties.length !== 1 ? "is" : ""} disponível${properties.length !== 1 ? "is" : ""}`
                : "Nossos imóveis em Itanhaém"}
            </h2>
            {!searched && (
              <p className="text-slate-500 text-sm mt-1">Escolha o imóvel perfeito para sua estadia</p>
            )}
          </div>
          {searched && (
            <button
              onClick={() => clearFilters()}
              className="text-sm text-brand-600 font-medium hover:underline flex items-center gap-1"
            >
              Ver todos <ChevronRight size={14} />
            </button>
          )}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <div className="animate-pulse bg-slate-200 h-52" />
                <div className="p-4 space-y-3">
                  <div className="animate-pulse bg-slate-200 h-5 w-3/4 rounded-lg" />
                  <div className="animate-pulse bg-slate-200 h-4 w-1/2 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm">
            <p className="text-4xl mb-4">🔍</p>
            <p className="text-slate-600 font-medium text-lg mb-1">Nenhum imóvel disponível</p>
            <p className="text-slate-400 text-sm mb-6">Tente outras datas ou deixe os campos em branco para ver todos.</p>
            <button
              onClick={() => clearFilters()}
              className="bg-brand-600 text-white font-semibold px-6 py-2.5 rounded-xl hover:bg-brand-700 transition-colors"
            >
              Ver todos os imóveis
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {properties.map((prop, i) => {
              const amenities = parseJSON(prop.amenities);
              const propNights = nights && nights > 0 ? nights : null;

              return (
                <motion.div
                  key={prop.id}
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.45 }}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100"
                >
                  {/* Foto */}
                  <div className="relative h-52 bg-gradient-to-br from-brand-100 to-brand-200 overflow-hidden">
                    {prop.coverPhoto ? (
                      <img
                        src={prop.coverPhoto}
                        alt={prop.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="text-6xl">🏠</span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

                    {/* Badge de preço */}
                    <div className="absolute bottom-3 left-3 bg-white/95 backdrop-blur rounded-xl px-3 py-1.5 shadow">
                      <span className="text-base font-bold text-slate-900">{formatCurrency(prop.basePrice)}</span>
                      <span className="text-xs text-slate-500 font-normal">/noite</span>
                    </div>

                    {/* Badge localização */}
                    <div className="absolute top-3 left-3 bg-black/40 backdrop-blur-sm text-white rounded-lg px-2.5 py-1 flex items-center gap-1 text-xs">
                      <MapPin size={10} /> {prop.city}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <h3 className="font-bold text-slate-900 text-base mb-3 leading-snug">{prop.name}</h3>

                    {/* Stats */}
                    <div className="flex items-center gap-3 mb-3">
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                        <Users size={11} /> {prop.capacity} hósp.
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                        <Bed size={11} /> {prop.bedrooms} qts.
                      </span>
                      <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-lg">
                        <Bath size={11} /> {prop.bathrooms} ban.
                      </span>
                    </div>

                    {/* Amenidades */}
                    {amenities.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-4">
                        {amenities.slice(0, 3).map((a) => (
                          <span key={a} className="text-[10px] bg-brand-50 text-brand-700 px-2 py-0.5 rounded-full font-medium">{a}</span>
                        ))}
                        {amenities.length > 3 && (
                          <span className="text-[10px] text-slate-400 px-1">+{amenities.length - 3}</span>
                        )}
                      </div>
                    )}

                    {/* Total se datas selecionadas */}
                    {propNights && (
                      <div className="bg-gradient-to-r from-brand-50 to-violet-50 border border-brand-100 rounded-xl p-3 mb-4 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">{propNights} noite{propNights > 1 ? "s" : ""}</span>
                          <span className="font-bold text-brand-700 text-base">{formatCurrency(prop.basePrice * propNights + prop.cleaningFee)}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-0.5">incl. taxa de limpeza</p>
                      </div>
                    )}

                    <Link
                      href={`/imoveis/${prop.slug}${checkIn ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ""}`}
                      className="block w-full bg-slate-900 hover:bg-brand-600 text-white text-center font-semibold py-2.5 rounded-xl transition-colors text-sm group-hover:bg-brand-600"
                    >
                      Ver detalhes e reservar →
                    </Link>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── POR QUE ESCOLHER ──────────────────────────────────────────── */}
      <section className="bg-slate-50 border-y border-slate-100 py-20 px-4 mb-20">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <span className="text-teal-600 font-semibold text-sm uppercase tracking-widest">🌴 Nossa diferença</span>
            <h2 className="text-3xl font-extrabold text-slate-900 mt-2">Por que escolher a Villa Mare?</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">Mais do que um lugar para ficar — uma experiência completa, do início ao fim.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {BENEFITS.map((b, i) => (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
              >
                <div className={`inline-flex items-center justify-center w-11 h-11 rounded-2xl mb-4 ${b.color}`}>
                  <b.icon size={22} />
                </div>
                <h3 className="font-bold text-slate-900 mb-2">{b.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{b.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTOS ───────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 mb-24">
        <div className="text-center mb-12">
          <span className="text-brand-600 font-semibold text-sm uppercase tracking-widest">Depoimentos</span>
          <h2 className="text-3xl font-extrabold text-slate-900 mt-2">O que dizem nossos hóspedes</h2>
          <div className="flex items-center justify-center gap-1 mt-3">
            {[...Array(5)].map((_, i) => (
              <Star key={i} size={18} className="text-amber-400 fill-amber-400" />
            ))}
            <span className="text-slate-500 text-sm ml-2">5.0 média de avaliação</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-shadow"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(t.rating)].map((_, j) => (
                  <Star key={j} size={14} className="text-amber-400 fill-amber-400" />
                ))}
              </div>

              <p className="text-slate-600 text-sm leading-relaxed mb-5 italic">"{t.text}"</p>

              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                  {t.initials}
                </div>
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{t.name}</p>
                  <p className="text-slate-400 text-xs">{t.location}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ─────────────────────────────────────────────────── */}
      <section className="mx-4 mb-12">
        <div className="max-w-5xl mx-auto bg-gradient-to-br from-teal-500 via-cyan-600 to-emerald-700 rounded-3xl p-10 text-center text-white overflow-hidden relative">
          <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
          <div className="relative">
            <h2 className="text-3xl font-extrabold mb-3">🌴 Pronto para reservar?</h2>
            <p className="text-teal-100 mb-8 max-w-md mx-auto">Escolha as datas e garanta seu imóvel em Itanhaém. Reserva rápida, pagamento seguro.</p>
            <button
              onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
              className="inline-flex items-center gap-2 bg-white text-teal-700 font-bold px-8 py-3.5 rounded-2xl hover:bg-teal-50 transition-colors shadow-lg"
            >
              <Search size={18} /> Verificar disponibilidade
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}
