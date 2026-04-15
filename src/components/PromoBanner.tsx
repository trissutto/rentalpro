"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Promotion {
  id: string;
  title: string;
  subtitle?: string | null;
  emoji: string;
  bgGradient: string;
  ctaText: string;
  ctaUrl: string;
  showAsPopup: boolean;
}

const GRADIENT_CSS: Record<string, string> = {
  "from-teal-500 to-cyan-600":     "linear-gradient(90deg, #14b8a6, #0891b2)",
  "from-purple-500 to-pink-600":   "linear-gradient(90deg, #a855f7, #db2777)",
  "from-orange-400 to-red-500":    "linear-gradient(90deg, #fb923c, #ef4444)",
  "from-blue-500 to-indigo-600":   "linear-gradient(90deg, #3b82f6, #4f46e5)",
  "from-green-500 to-emerald-600": "linear-gradient(90deg, #22c55e, #059669)",
  "from-yellow-400 to-orange-500": "linear-gradient(90deg, #facc15, #f97316)",
  "from-pink-500 to-fuchsia-600":  "linear-gradient(90deg, #ec4899, #c026d3)",
  "from-slate-600 to-gray-700":    "linear-gradient(90deg, #475569, #374151)",
  "from-amber-500 to-brown-600":   "linear-gradient(90deg, #f59e0b, #92400e)",
  "from-violet-500 to-purple-600": "linear-gradient(90deg, #8b5cf6, #9333ea)",
};

const SESSION_KEY = "promo_banners_closed";

function getClosedBanners(): string[] {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || "[]"); } catch { return []; }
}

function markBannerClosed(id: string) {
  try {
    const closed = getClosedBanners();
    sessionStorage.setItem(SESSION_KEY, JSON.stringify([...closed, id]));
  } catch {}
}

export default function PromoBanner() {
  const [banners, setBanners] = useState<Promotion[]>([]);
  const [closed, setClosed] = useState<string[]>([]);

  useEffect(() => {
    setClosed(getClosedBanners());
    fetch("/api/public/promotions")
      .then(r => r.json())
      .then(d => {
        const list: Promotion[] = (d.promotions ?? []).filter(
          (p: Promotion) => p.showAsPopup === false
        );
        setBanners(list);
      })
      .catch(() => {});
  }, []);

  function handleClose(id: string) {
    markBannerClosed(id);
    setClosed(prev => [...prev, id]);
  }

  const visible = banners.filter(b => !closed.includes(b.id));
  if (visible.length === 0) return null;

  return (
    <div className="flex flex-col w-full">
      <AnimatePresence>
        {visible.map(banner => (
          <motion.div
            key={banner.id}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            style={{ background: GRADIENT_CSS[banner.bgGradient] ?? "linear-gradient(90deg, #14b8a6, #0891b2)" }}
          >
            <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xl flex-shrink-0">{banner.emoji}</span>
                <span className="text-white font-bold text-sm truncate">{banner.title}</span>
                {banner.subtitle && (
                  <span className="text-white/80 text-sm hidden sm:inline truncate">— {banner.subtitle}</span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <a
                  href={banner.ctaUrl}
                  className="bg-white/20 hover:bg-white/30 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                >
                  {banner.ctaText} →
                </a>
                <button
                  onClick={() => handleClose(banner.id)}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
