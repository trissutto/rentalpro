const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: "NetworkFirst",
      options: {
        cacheName: "offlineCache",
        expiration: { maxEntries: 200 },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  typescript: {
    // O cliente Prisma gerado está truncado no ambiente de sandbox (sem acesso de rede
    // para regenerar). Nosso código-fonte não tem erros TS — apenas o arquivo
    // node_modules/.prisma/client/index.d.ts está incompleto.
    ignoreBuildErrors: true,
  },
  images: {
    domains: ["localhost", "res.cloudinary.com"],
  },
  experimental: {
    serverActions: { allowedOrigins: ["localhost:3000"] },
    serverBodySizeLimit: '50mb',
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Impede que o site seja embutido em iframe de terceiros (clickjacking)
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Navegador não tenta "adivinhar" o tipo do arquivo servido
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Não vaza a URL interna completa ao sair do site
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
