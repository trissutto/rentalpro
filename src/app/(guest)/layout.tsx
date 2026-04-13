"use client";

import Link from "next/link";
import { Home } from "lucide-react";

export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header público */}
      <header className="bg-white border-b border-slate-200 px-4 py-4 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href="/imoveis" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-brand-600 rounded-xl flex items-center justify-center">
              <Home className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-lg">Villa Mare</span>
          </Link>
          <Link
            href="/imoveis"
            className="text-sm text-brand-600 font-medium hover:underline"
          >
            Ver imóveis
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 pb-16">
        {children}
      </main>

      <footer className="text-center text-xs text-slate-400 py-6 border-t border-slate-200">
        © {new Date().getFullYear()} Villa Mare · Todos os direitos reservados
      </footer>
    </div>
  );
}
