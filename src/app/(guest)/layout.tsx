"use client";

import Link from "next/link";
import { Home } from "lucide-react";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Header público */}
      <header className="bg-white/80 backdrop-blur border-b border-slate-100 px-4 py-3.5 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/imoveis" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-md shadow-brand-200">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg tracking-tight">Villa Mare</span>
          </Link>
          <Link
            href="/imoveis"
            className="text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors"
          >
            Ver imóveis
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-16">
        {children}
      </main>

      <footer className="bg-slate-900 text-slate-400 text-xs text-center py-8 border-t border-slate-800">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 bg-gradient-to-br from-brand-500 to-brand-700 rounded-lg flex items-center justify-center">
            <Home className="w-3 h-3 text-white" />
          </div>
          <span className="text-white font-semibold text-sm">Villa Mare</span>
        </div>
        © {new Date().getFullYear()} Villa Mare · Todos os direitos reservados
      </footer>
    </div>
  );
}
