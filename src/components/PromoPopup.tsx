"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

interface Promotion {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  emoji: string;
  bgGradient: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl?: string | null;
  showAsPopup: boolean;
}

const GRADIENT_CSS: Record<string, string> = {
  "from-teal-500 to-cyan-600":     "linear-gradient(135deg, #14b8a6, #0891b2)",
  "from-purple-500 to-pink-600":   "linear-gradient(135deg, #a855f7, #db2777)",
  "from-orange-400 to-red-500":    "linear-gradient(135deg, #fb923c, #ef4444)",
  "from-blue-500 to-indigo-600":   "linear-gradient(135deg, #3b82f6, #4f46e5)",
  "from-green-500 to-emerald-600": "linear-gradient(135deg, #22c55e, #059669)",
  "from-yellow-400 to-orange-500": "linear-gradient(135deg, #facc15, #f97316)",
  "from-pink-500 to-fuchsia-600":  "linear-gradient(135deg, #ec4899, #c026d3)",
  "from-slate-600 to-gray-700":    "linear-gradient(135deg, #475569, #374151)",
  "from-amber-500 to-brown-600":   "linear-gradient(135deg, #f59e0b, #92400e)",
  "from-violet-500 to-purple-600": "linear-gradient(135deg, #8b5cf6, #9333ea)",
};

// Cooldown: 5 minutos (evita loop mas permite reteste rápido)
const COOLDOWN_MS = 5 * 60 * 1000;

function isPreviewMode(): boolean {
  try { return new URLSearchParams(window.location.search).has("preview"); } catch { return false; }
}

function wasRecentlyClosed(id: string): boolean {
  if (isPreviewMode()) return false; // ?preview ignora cooldown
  try {
    const val = localStorage.getItem(`popup_ts_${id}`);
    if (!val) return false;
    return Date.now() - Number(val) < COOLDOWN_MS;
  } catch { return false; }
}

function markClosed(id: string) {
  if (isPreviewMode()) return; // em preview não salva
  try { localStorage.setItem(`popup_ts_${id}`, String(Date.now())); } catch {}
}

export default function PromoPopup() {
  const [popup, setPopup] = useState<Promotion | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    fetch("/api/public/promotions")
      .then((r) => r.json())
      .then((d) => {
        const popupPromos: Promotion[] = (d.promotions ?? []).filter(
          (p: Promotion) => p.showAsPopup === true
        );
        if (popupPromos.length === 0) return;

        const promo = popupPromos[0];
        if (wasRecentlyClosed(promo.id)) return;

        // Mostra após 5 segundos
        timer = setTimeout(() => {
          setPopup(promo);
          setVisible(true);
        }, 5000);
      })
      .catch(() => {});

    return () => clearTimeout(timer);
  }, []);

  function handleClose() {
    setVisible(false);
    if (popup) markClosed(popup.id);
  }

  if (!popup) return null;

  // ── COM IMAGEM ─────────────────────────────────────────────
  if (popup.imageUrl) {
    return (
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={handleClose}
          >
            <motion.div
              initial={{ scale: 0.75, opacity: 0, y: -60 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.88, opacity: 0, y: 30 }}
              transition={{ type: "spring", stiffness: 240, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="relative rounded-3xl shadow-2xl overflow-hidden"
              style={{ maxWidth: "min(90vw, 540px)", maxHeight: "85vh" }}
            >
              {/* Imagem — tamanho natural */}
              <img
                src={popup.imageUrl}
                alt={popup.title}
                className="block w-full h-auto object-contain"
                style={{ maxHeight: "85vh" }}
              />

              {/* Botão fechar */}
              <button
                onClick={handleClose}
                className="absolute top-3 right-3 z-20 w-9 h-9 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors backdrop-blur-sm"
              >
                <X size={18} />
              </button>

              {/* Barra inferior com CTA */}
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent p-5 flex items-end justify-between gap-3">
                <div className="text-white min-w-0">
                  {popup.title && (
                    <p className="font-bold text-base drop-shadow truncate">{popup.title}</p>
                  )}
                  {popup.subtitle && (
                    <p className="text-white/80 text-sm drop-shadow truncate">{popup.subtitle}</p>
                  )}
                </div>
                <a
                  href={popup.ctaUrl}
                  onClick={handleClose}
                  className="flex-shrink-0 bg-white text-slate-900 font-bold text-sm px-5 py-2.5 rounded-xl shadow-lg hover:scale-105 transition-all whitespace-nowrap"
                >
                  {popup.ctaText} →
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── SEM IMAGEM — gradiente ─────────────────────────────────
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.75, opacity: 0, y: -60 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.88, opacity: 0, y: 30 }}
            transition={{ type: "spring", stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="relative overflow-hidden rounded-3xl shadow-2xl w-full max-w-sm"
            style={{ background: GRADIENT_CSS[popup.bgGradient] ?? "linear-gradient(135deg, #14b8a6, #0891b2)" }}
          >
            <div className="absolute -right-12 -top-12 w-56 h-56 bg-white/10 rounded-full pointer-events-none" />
            <div className="absolute -left-8 -bottom-8 w-40 h-40 bg-white/10 rounded-full pointer-events-none" />

            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
            >
              <X size={18} />
            </button>

            <div className="relative z-10 flex flex-col items-center justify-center text-center p-8">
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.15, type: "spring", stiffness: 300 }}
                className="text-6xl mb-4 block"
              >
                {popup.emoji}
              </motion.span>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-3xl font-black text-white drop-shadow-lg mb-2 leading-tight"
              >
                {popup.title}
              </motion.h2>
              {popup.subtitle && (
                <motion.p
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.28 }}
                  className="text-white/90 text-base font-medium mb-4 drop-shadow"
                >
                  {popup.subtitle}
                </motion.p>
              )}
              {popup.description && (
                <p className="text-white/75 text-sm mb-6 drop-shadow">{popup.description}</p>
              )}
              <motion.a
                href={popup.ctaUrl}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.35 }}
                onClick={handleClose}
                className="inline-flex items-center gap-2 bg-white text-slate-900 font-bold text-base px-8 py-3 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 transition-all"
              >
                {popup.ctaText} →
              </motion.a>
              <button
                onClick={handleClose}
                className="mt-4 text-white/60 text-sm hover:text-white/90 transition-colors underline underline-offset-2"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
