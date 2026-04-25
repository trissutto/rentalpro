"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Search, Calendar, Users, ChevronDown, Star, ArrowRight, MapPin } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import HomeBannerBlock from "@/components/HomeBannerBlock";
import DateRangePicker from "@/components/DateRangePicker";

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
  const [homeBanners, setHomeBanners] = useState<any[]>([]);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [guests, setGuests] = useState(2);
  const [waNumber, setWaNumber] = useState("5513996040123");
  const [waMessage, setWaMessage] = useState("Olá! Gostaria de saber mais sobre as casas disponíveis.");

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
    fetch("/api/public/home-banners")
      .then(r => r.json())
      .then(d => setHomeBanners(d.banners || []))
      .catch(() => {});
    fetch("/api/public/whatsapp-config")
      .then(r => r.json())
      .then(d => {
        if (d.whatsapp_number) setWaNumber(d.whatsapp_number);
        if (d.whatsapp_message) setWaMessage(d.whatsapp_message);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setInterval(() => setHeroIndex((i) => (i + 1) % heroImages.length), 5000);
    return () => clearInterval(t);
  }, [heroImages.length]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (checkIn) params.set("checkIn", checkIn);
      if (checkOut) params.set("checkOut", checkOut);
      if (guests) params.set("minGuests", String(guests));
      const res = await fetch(`/api/public/properties?${params.toString()}`);
      const data = await res.json();
      setProperties(data.properties || []);
    } catch {
      // keep current list on error
    } finally {
      setLoading(false);
    }
  }, [checkIn, checkOut, guests]);

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
      <section className="relative min-h-[55vh] max-h-[65vh] overflow-hidden">
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
              style={{ filter: "brightness(0.55)" }}
            />
          </motion.div>
        </AnimatePresence>

        <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, rgba(10,10,10,0.1) 0%, rgba(10,10,10,0.5) 100%)" }} />

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

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <p className="text-xs uppercase tracking-[0.2em] mb-2" style={{ color: "rgba(201,168,76,0.7)" }}>
              <Search size={14} className="inline mr-2" />
              Verifique a disponibilidade
            </p>
          </motion.div>

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
                  <div className="flex-[2] p-4 border-b sm:border-b-0 sm:border-r" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                    <DateRangePicker
                      checkIn={checkIn}
                      checkOut={checkOut}
                      onChangeCheckIn={setCheckIn}
                      onChangeCheckOut={setCheckOut}
                    />
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
                    <button onClick={handleSearch} className="w-full sm:w-auto px-6 py-3 rounded-xl font-semibold text-sm transition-all hover:opacity-90"
                      style={{ background: "#c9a84c", color: "#0a0a0a" }}>
                      Buscar
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-40 pointer-events-none">
          <div className="w-px h-12 animate-pulse" style={{ background: "#c9a84c" }} />
          <span className="text-xs tracking-widest" style={{ color: "#c9a84c" }}>SCROLL</span>
        </div>
      </section>

      {/* ── HOME BANNERS (acima dos imóveis) ── */}
      {homeBanners.length > 0 && (
        <section className="px-4 pt-10 pb-0 max-w-6xl mx-auto">
          {homeBanners.map((b, i) => (
            <HomeBannerBlock key={i} banner={b} />
          ))}
        </section>
      )}

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
                    <Link href={`/imoveis/${p.slug}${checkIn || checkOut || guests ? `?${new URLSearchParams({...(checkIn ? {checkIn} : {}), ...(checkOut ? {checkOut} : {}), ...(guests ? {guests: String(guests)} : {})}).toString()}` : ""}`} className="block group">
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

      {/* ── ITANHAÉM ── */}
      <section className="py-24 px-4" style={{ background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="mb-16 text-center">
            <p className="text-xs uppercase tracking-[0.3em] mb-3" style={{ color: "#c9a84c" }}>Destino</p>
            <h2 className="text-4xl font-bold mb-4">Descubra Itanhaém</h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: "rgba(255,255,255,0.5)" }}>
              A segunda cidade mais antiga do Brasil, com praias paradisíacas, natureza exuberante e um pôr do sol inesquecível.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "Praias Deslumbrantes",
                desc: "Mais de 28 km de litoral com praias de águas cristalinas, perfeitas para banho, surf e descanso em família.",
                emoji: "🏖️",
              },
              {
                title: "Natureza Preservada",
                desc: "Trilhas na Mata Atlântica, cachoeiras escondidas e o majestoso Rio Itanhaém para passeios de barco.",
                emoji: "🌿",
              },
              {
                title: "Gastronomia Local",
                desc: "Saboreie frutos do mar frescos nos restaurantes à beira-mar e descubra a culinária caiçara autêntica.",
                emoji: "🦐",
              },
              {
                title: "História e Cultura",
                desc: "Visite o Convento Nossa Senhora da Conceição (1699) e a Igreja Sant'Anna, patrimônios históricos únicos.",
                emoji: "⛪",
              },
              {
                title: "Pôr do Sol Mágico",
                desc: "Eleito um dos mais bonitos do litoral paulista. O mirante do Morro do Paranambuco oferece uma vista espetacular.",
                emoji: "🌅",
              },
              {
                title: "Lazer para Todos",
                desc: "Ciclovia beira-mar, pesca esportiva, stand-up paddle, kitesurf e muito mais para toda a família.",
                emoji: "🏄",
              },
            ].map((item) => (
              <div key={item.title} className="p-6 rounded-2xl transition-all duration-300 hover:scale-[1.02]"
                style={{ background: "#1a1a20", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="text-4xl mb-4">{item.emoji}</div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 px-4 text-center" style={{ background: "#111" }}>
        <p className="text-xs uppercase tracking-[0.3em] mb-4" style={{ color: "#c9a84c" }}>Pronto para reservar?</p>
        <h2 className="text-4xl md:text-5xl font-bold mb-6">Sua temporada dos sonhos<br />começa aqui.</h2>
        <p className="mb-10 text-lg" style={{ color: "rgba(255,255,255,0.5)" }}>Escolha seu imóvel e garanta as melhores datas.</p>
        <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="px-10 py-4 rounded-full font-semibold text-sm transition-all hover:opacity-90"
          style={{ background: "#c9a84c", color: "#0a0a0a" }}>
          Ver disponibilidade
        </button>
      </section>

      {/* ── FOOTER / CONTATO ── */}
      <footer className="py-16 px-4" style={{ background: "#0a0a0a", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-12">
            {/* Brand */}
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)" }}>
                  <span className="text-lg">🏠</span>
                </div>
                <div>
                  <p className="font-bold text-white">Reservas Ita</p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Temporadas Premium</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
                Imóveis de alto padrão em Itanhaém, litoral sul de São Paulo. Conforto, segurança e experiências inesquecíveis.
              </p>
            </div>

            {/* Contato */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#c9a84c" }}>Contato</h4>
              <div className="space-y-3 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                <a href="https://wa.me/5513996040123" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-white transition-colors">
                  <span>📱</span> +55 (13) 99604-0123
                </a>
                <a href="mailto:contato@reservasita.com.br"
                  className="flex items-center gap-2 hover:text-white transition-colors">
                  <span>✉️</span> contato@reservasita.com.br
                </a>
                <p className="flex items-center gap-2">
                  <span>📍</span> Itanhaém, SP - Litoral Sul
                </p>
              </div>
            </div>

            {/* Redes Sociais */}
            <div>
              <h4 className="font-semibold mb-4 text-sm uppercase tracking-wider" style={{ color: "#c9a84c" }}>Redes Sociais</h4>
              <div className="space-y-3 text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                <a href="https://instagram.com/reservasita" target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:text-white transition-colors">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  @reservasita
                </a>
                <a href="https://reservasita.com.br" className="flex items-center gap-2 hover:text-white transition-colors">
                  <span>🌐</span> reservasita.com.br
                </a>
              </div>
            </div>
          </div>

          <div className="pt-8 text-center text-xs" style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.3)" }}>
            &copy; {new Date().getFullYear()} Reservas Ita &middot; Todos os direitos reservados
          </div>
        </div>
      </footer>

      {/* ── WHATSAPP FLUTUANTE ── */}
      <a
        href={`https://wa.me/${waNumber}?text=${encodeURIComponent(waMessage)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-3 rounded-full shadow-2xl transition-all duration-300 hover:scale-105 hover:shadow-green-500/30"
        style={{ background: "#25D366", color: "#fff", fontWeight: 600, fontSize: "0.9rem" }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp
      </a>
    </div>
  );
}
