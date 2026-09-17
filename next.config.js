const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: false,
  dynamicStartUrl: false,
  customWorkerDir: "worker",
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkOnly",
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  images: {
    domains: ["localhost", "res.cloudinary.com"],
  },
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"], bodySizeLimit: '50mb' },
  },
  async headers() {
    return [
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "private, no-store" }] },
      {
        source: "/:path*",
        headers: [
          // Impede que o site seja embutido em iframe de terceiros (clickjacking)
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Navegador não tenta "adivinhar" o tipo do arquivo servido
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Não vaza a URL interna completa ao sair do site
          { key: "Referrer-Policy", value: "no-referrer" },
          // Nenhuma página precisa de câmera, microfone ou localização
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // Só HTTPS a partir da primeira visita
          { key: "Strict-Transport-Security", value: "max-age=15552000; includeSubDomains" },
        ],
      },
    ];
  },
};

module.exports = withPWA(nextConfig);
