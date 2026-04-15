"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Search, Calendar, Users, ChevronDown, Star, ArrowRight, MapPin } from "lucide-react";
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

const DEFAULT_HERO_IMAGES = [
  "/hero-1.jpg", "/hero-2.jpg", "/hero-3.jpg",
  "/hero-4.jpg", "/hero-5.jpg", "/hero-6.jpg",
];

export default function ImoveisPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [heroIndex, setHeroIndex]   = useState(0);
  const [heroImages, setHeroImages] = useState<string[]>(DEFAULT_HERO_IMAGES);
  const [searchOpen, setSearchOpen] = useState(true);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);

  useEffect(() => {
    fetch("/api/public/properties")
      .then((r) => r.json())
      .then((d) => setProperties(d.properties || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/admin/hero-images")
      .then(r => r.json())
      .then(d => { if (d.urls?.length) setHeroImages(d.urls); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroImages.length), 5000);
    return () => clearInterval(t);
  }, [heroImages.length]);

  const getPhotos = useCallback((p: Property): string[] => {
    try {
      const arr = typeof p.photos === "string" ? JSON.parse(p.photos) : p.photos;
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }, []);

  const getCover = useCallback((p: Property): string | null => {
    if (p.coverPhoto) return p.coverPhoto;
    const photos = getPhotos(p);
    return photos[0] || null;
  }, [getPhotos]);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff" }}>

      {/* ── HERO ── */}
      <section className="relative h-screen overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={heroIndex}
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0"
          >
            <img
              src={heroImages[heroIndex]}
              alt=""
              className="w-full h-full object-cover"
              style={{ filter: "brightness(0.35)" }}
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.2) 0%, rgba(10,10,10,0.7) 100%)" }} />

        <div className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-xs uppercase tracking-[0.3em] mb-4"
            style={{ color: "#c9a84c" }}
          >
            Temporadas exclusivas
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="font-bold leading-none mb-6"
            style={{ fontSize: "clamp(2.5rem, 8vw, 6rem)", letterSpacing: "-0.02em" }}
          >
            Onde cada detalhe<br />
            <span style={{ color: "#c9a84c" }}>é um luxo.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="text-lg mb-10 max-w-md"
            style={{ color: "rgba(255,255,255,0.6)" }}
          >
            Imóveis de alto padrão no Litoral Paulista. Reserve com segurança e exclusividade.
          </motion.p>

          <motion.button
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            onClick={() => {}}
            className="flex items-center gap-3 px-8 py-4 rounded-full font-semibold"
            style={{ background: "#c9a84c", color: "#0a0a0a", fontSize: "0.95rem", cursor: "default" }}
          >
            <Search size={18} />
            Verificar disponibilidade
          </motion.button>

          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ opacity: 0, y: -10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: "auto" }}
                exit={{ opacity: 0, y: -10, height: 0 }}
                className="mt-4 rounded-2xl overflow-hidden w-full max-w-2xl"
                style={{ background: "rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", border: "1px solid rgba(201,168,76,0.2)" }}
              >
                <div className="flex flex-col sm:flex-row gap-0">
                  <div className="flex-1 p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <label className="block text-xs mb-1" style={{ color: "#c9a84c" }}>CHECK-IN</label>
                    <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
                      className="w-full bg-transparent text-white outline-none text-sm" />
                  </div>
                  <div className="flex-1 p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <label className="block text-xs mb-1" style={{ color: "#c9a84c" }}>CHECK-OUT</label>
                    <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
                      className="w-full bg-transparent text-white outline-none text-sm" />
                  </div>
                  <div className="flex-1 p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <label className="block text-xs mb-1" style={{ color: "#c9a84c" }}>HÓSPEDES</label>
                    <select value={guests} onChange={e => setGuests(Number(e.target.value))}
                      className="w-full bg-transparent text-white outline-none text-sm">
                      {[
                        { value: 1,  label: "1 – 5 hóspedes" },
                        { value: 6,  label: "6 – 10 hóspedes" },
                        { value: 11, label: "11 – 15 hóspedes" },
                        { value: 16, label: "16 – 20 hóspedes" },
                        { value: 21, label: "21+ hóspedes" },
                      ].map(o => <option key={o.value} value={o.value} style={{ background: "#1a1a20" }}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="p-3 flex items-center justify-center">
                    <button className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                      style={{ background: "#c9a84c", color: "#0a0a0a" }}>
                      Buscar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40">
          <div className="w-px h-12 animate-pulse" style={{ background: "#c9a84c" }} />
          <span className="text-xs tracking-widest" style={{ color: "#c9a84c" }}>SCROLL</span>
        </div>
      </section>

      {/* ── PROPERTIES ── */}
      <section className="py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="mb-16">
            <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: "#c9a84c" }}>Nosso portfólio</p>
            <h2 className="text-4xl font-bold">Imóveis disponíveis</h2>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1,2,3].map(i => (
                <div key={i} className="rounded-2xl animate-pulse" style={{ background: "#1a1a20", height: 380 }} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {properties.map((p, i) => {
                const cover = getCover(p);
                return (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}>
                    <Link href={`/imoveis/${p.slug}`} className="block group">
                      <div className="rounded-2xl overflow-hidden transition-all duration-300"
                        style={{ background: "#1a1a20", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="relative h-56 overflow-hidden">
                          {cover ? (
                            <img src={cover} alt={p.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center" style={{ background: "#111" }}>
                              <span style={{ color: "#c9a84c", fontSize: "3rem" }}>🏖</span>
                            </div>
                          )}
                          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(10,10,10,0.8) 0%, transparent 60%)" }} />
                          <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                            style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)", color: "#c9a84c" }}>
                            <Star size={10} fill="#c9a84c" />
                            5.0
                          </div>
                        </div>
                        <div className="p-5">
                          <div className="flex items-start justify-between mb-2">
                            <h3 className="font-semibold text-lg leading-tight">{p.name}</h3>
                            <ArrowRight size={16} className="mt-1 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-1"
                              style={{ color: "#c9a84c", flexShrink: 0 }} />
                          </div>
                          <div className="flex items-center gap-1 mb-4 text-sm" style={{ color: "rgba(255,255,255,0.4)" }}>
                            <MapPin size={12} />
                            {p.city}, {p.state}
                          </div>
                          <div className="flex items-center justify-between pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                            <div>
                              <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>a partir de</span>
                              <div className="font-bold text-lg" style={{ color: "#c9a84c" }}>
                                {formatCurrency(p.basePrice)}<span className="text-xs font-normal text-white opacity-40">/noite</span>
                              </div>
                            </div>
                            <div className="flex gap-3 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                              <span>{p.bedrooms} qtos</span>
                              <span>·</span>
                              <span>{p.capacity} hósp.</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── BENEFITS ── */}
      <section className="py-24 px-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: "#c9a84c" }}>Por que escolher</p>
            <h2 className="text-4xl font-bold">Uma experiência diferente</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { num: "01", title: "Exclusividade total", desc: "Imóveis selecionados a dedo para garantir alto padrão e conforto em cada detalhe." },
              { num: "02", title: "Reserva segura", desc: "Processo de reserva transparente, com contrato digital e pagamento protegido." },
              { num: "03", title: "Suporte dedicado", desc: "Equipe disponível do check-in ao check-out para uma estadia sem preocupações." },
            ].map((b) => (
              <div key={b.num}>
                <div className="text-6xl font-bold mb-4" style={{ color: "rgba(201,168,76,0.2)", letterSpacing: "-0.04em" }}>{b.num}</div>
                <h3 className="text-xl font-semibold mb-3">{b.title}</h3>
                <p style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 px-4" style={{ background: "#111" }}>
        <div className="max-w-5xl mx-auto">
          <div className="mb-16 text-center">
            <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: "#c9a84c" }}>Avaliações</p>
            <h2 className="text-4xl font-bold">O que dizem nossos hóspedes</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { name: "Ana L.", text: "Experiência incrível! O imóvel superou todas as expectativas. Voltaremos com certeza.", loc: "São Paulo" },
              { name: "Carlos M.", text: "Atendimento impecável e imóvel perfeito para família. Cada detalhe pensado com cuidado.", loc: "Campinas" },
              { name: "Fernanda R.", text: "A vista é de tirar o fôlego e a casa é ainda melhor do que nas fotos. Recomendo!", loc: "Curitiba" },
            ].map((t) => (
              <div key={t.name} className="p-6 rounded-2xl" style={{ background: "#1a1a20", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map(s => <Star key={s} size={14} fill="#c9a84c" style={{ color: "#c9a84c" }} />)}
                </div>
                <p className="mb-6 leading-relaxed" style={{ color: "rgba(255,255,255,0.7)" }}>"{t.text}"</p>
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{t.loc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-4 text-center" style={{ background: "#0a0a0a" }}>
        <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: "#c9a84c" }}>Pronto para reservar?</p>
        <h2 className="text-4xl md:text-5xl font-bold mb-6">Sua temporada dos sonhos<br />começa aqui.</h2>
        <p className="mb-10 text-lg" style={{ color: "rgba(255,255,255,0.5)" }}>Escolha seu imóvel e garanta as melhores datas.</p>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="px-10 py-4 rounded-full font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "#c9a84c", color: "#0a0a0a" }}>
          Ver disponibilidade
        </button>
      </section>
    </div>
  );
}
