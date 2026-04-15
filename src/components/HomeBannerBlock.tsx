"use client";

import { motion } from "framer-motion";

interface Banner {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaUrl: string;
  imageUrl: string;
  bgColor: string;
  textColor: string;
}

export default function HomeBannerBlock({ banner }: { banner: Banner }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="relative w-full rounded-3xl overflow-hidden my-8 shadow-xl"
      style={{ minHeight: 220, background: banner.bgColor }}
    >
      {/* Imagem de fundo */}
      {banner.imageUrl && (
        <img
          src={banner.imageUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: 0.35 }}
        />
      )}

      {/* Overlay gradiente */}
      <div
        className="absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${banner.bgColor}ee 40%, ${banner.bgColor}55 100%)` }}
      />

      {/* Conteúdo */}
      <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6 px-8 py-10">
        <div className="text-center sm:text-left">
          <h2
            className="text-2xl sm:text-3xl font-black leading-tight mb-2"
            style={{ color: banner.textColor }}
          >
            {banner.title}
          </h2>
          {banner.subtitle && (
            <p className="text-base" style={{ color: banner.textColor, opacity: 0.8 }}>
              {banner.subtitle}
            </p>
          )}
        </div>

        {banner.ctaText && banner.ctaUrl && (
          <a
            href={banner.ctaUrl}
            className="flex-shrink-0 px-8 py-3.5 rounded-2xl font-bold text-sm shadow-lg hover:scale-105 transition-all"
            style={{
              background: banner.textColor,
              color: banner.bgColor,
            }}
          >
            {banner.ctaText} →
          </a>
        )}
      </div>
    </motion.div>
  );
}
