"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Search, MapPin, Users, Bed, Bath, DollarSign,
  Star, Calendar, ChevronDown, Filter,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

export default function PropertiesPublicPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [city, setCity] = useState("");
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    loadProperties();
  }, []);

  async function loadProperties(filters?: { checkIn?: string; checkOut?: string; city?: string }) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters?.checkIn) params.set("checkIn", filters.checkIn);
      if (filters?.checkOut) params.set("checkOut", filters.checkOut);
      if (filters?.city) params.set("city", filters.city);
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
    loadProperties({ checkIn, checkOut, city });
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-3xl p-8 mb-8 text-white text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-3xl font-bold mb-2">Encontre seu imóvel ideal</h1>
          <p className="text-brand-200 mb-6">Temporadas inesquecíveis com conforto e praticidade</p>

          {/* Search form */}
          <form onSubmit={handleSearch} className="bg-white rounded-2xl p-4 flex flex-col md:flex-row gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1 text-left">Destino</label>
              <div className="relative">
                <MapPin size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cidade..."
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1 text-left">Check-in</label>
              <input
                type="date"
                min={today}
                value={checkIn}
                onChange={(e) => setCheckIn(e.target.value)}
                className="w-full px-3 py-2 text-sm text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-500 mb-1 text-left">Check-out</label>
              <input
                type="date"
                min={checkIn || today}
                value={checkOut}
                onChange={(e) => setCheckOut(e.target.value)}
                className="w-full px-3 py-2 text-sm text-slate-800 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-400"
              />
            </div>
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors md:self-end"
            >
              <Search size={16} /> Buscar
            </button>
          </form>
        </motion.div>
      </div>

      {/* Results */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">
          {searched ? `${properties.length} imóvel(eis) disponível(eis)` : "Todos os imóveis"}
        </h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-card">
              <div className="skeleton h-48 rounded-none" />
              <div className="p-4 space-y-2">
                <div className="skeleton h-5 w-3/4 rounded" />
                <div className="skeleton h-4 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : properties.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-400 text-lg">Nenhum imóvel disponível para as datas selecionadas.</p>
          <button onClick={() => { setSearched(false); loadProperties(); }} className="mt-4 text-brand-600 font-medium hover:underline">
            Ver todos os imóveis
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {properties.map((prop, i) => {
            const amenities = parseJSON(prop.amenities);
            const nights = checkIn && checkOut
              ? Math.ceil((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000)
              : null;

            return (
              <motion.div
                key={prop.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white rounded-2xl overflow-hidden shadow-card hover:shadow-card-hover transition-shadow"
              >
                {/* Foto capa ou placeholder */}
                <div className="relative h-48 bg-gradient-to-br from-brand-100 to-brand-200 overflow-hidden">
                  {prop.coverPhoto ? (
                    <img
                      src={prop.coverPhoto}
                      alt={prop.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <span className="text-5xl">🏠</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                  <div className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-xl px-2.5 py-1">
                    <span className="text-sm font-bold text-brand-700">{formatCurrency(prop.basePrice)}<span className="text-xs font-normal text-slate-500">/noite</span></span>
                  </div>
                </div>

                {/* Info */}
                <div className="p-4">
                  <h3 className="font-bold text-slate-900 text-base mb-1">{prop.name}</h3>
                  <div className="flex items-center gap-1 text-slate-500 text-sm mb-3">
                    <MapPin size={12} /> {prop.city}, {prop.state}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span className="flex items-center gap-1"><Users size={12} /> {prop.capacity} hósp.</span>
                    <span className="flex items-center gap-1"><Bed size={12} /> {prop.bedrooms} qts.</span>
                    <span className="flex items-center gap-1"><Bath size={12} /> {prop.bathrooms} ban.</span>
                  </div>

                  {amenities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-4">
                      {amenities.slice(0, 3).map((a) => (
                        <span key={a} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{a}</span>
                      ))}
                      {amenities.length > 3 && <span className="text-[10px] text-slate-400">+{amenities.length - 3}</span>}
                    </div>
                  )}

                  {nights && nights > 0 && (
                    <div className="bg-brand-50 rounded-xl p-3 mb-3 text-sm">
                      <p className="text-brand-600 font-medium">{nights} noite{nights > 1 ? "s" : ""}</p>
                      <p className="text-brand-800 font-bold text-base">{formatCurrency(prop.basePrice * nights + prop.cleaningFee)} total</p>
                      <p className="text-brand-400 text-xs">incl. taxa de limpeza</p>
                    </div>
                  )}

                  <Link
                    href={`/imoveis/${prop.slug}${checkIn ? `?checkIn=${checkIn}&checkOut=${checkOut}` : ""}`}
                    className="block w-full bg-brand-600 hover:bg-brand-700 text-white text-center font-semibold py-2.5 rounded-xl transition-colors text-sm"
                  >
                    Ver detalhes e reservar
                  </Link>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
