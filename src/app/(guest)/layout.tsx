"use client";

import Link from "next/link";
import PromoPopup from "@/components/PromoPopup";
import PromoBanner from "@/components/PromoBanner";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <PromoPopup />
      {/* Header público */}
      <header
        className="px-4 py-3 sticky top-0 z-30"
        style={{ background: "rgba(10,10,10,0.92)", backdropFilter: "blur(12px)", borderBottom: "1px solid rgba(201,168,76,0.25)" }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/imoveis" className="flex items-center gap-3">
            <img
              src="/logo-reservas-ita.png"
              alt="Reservas Ita"
              width={40}
              height={40}
              className="w-10 h-10 rounded-full"
            />
            <span className="leading-tight">
              <span className="block font-bold text-white text-base tracking-[0.16em]">RESERVAS ITA</span>
              <span className="block text-[10px] uppercase tracking-[0.18em]" style={{ color: "rgba(201,168,76,0.85)" }}>
                Central de reservas · Itanhaém
              </span>
            </span>
          </Link>
          <Link
            href="/imoveis"
            className="text-sm font-semibold transition-colors hover:text-white"
            style={{ color: "#c9a84c" }}
          >
            Ver imóveis
          </Link>
        </div>
      </header>
      <PromoBanner />

      <main className="max-w-5xl mx-auto px-4 py-6 pb-16">
        {children}
      </main>

      <footer
        className="text-xs text-center py-8"
        style={{ background: "#0a0a0a", color: "rgba(255,255,255,0.4)", borderTop: "1px solid rgba(201,168,76,0.2)" }}
      >
        <div className="flex items-center justify-center gap-2.5 mb-2">
          <img src="/logo-reservas-ita.png" alt="" width={28} height={28} className="w-7 h-7 rounded-full" />
          <span className="text-white font-semibold text-sm tracking-wide">Reservas Ita</span>
        </div>
        © {new Date().getFullYear()} Reservas Ita · Todos os direitos reservados
      </footer>
    </div>
  );
}
