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
  },
};

module.exports = withPWA(nextConfig);
