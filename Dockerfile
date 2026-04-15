# Etapa 1: Dependencias
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

# Etapa 2: Build
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Variaveis necessarias para o build
ENV NEXT_TELEMETRY_DISABLED 1
ENV NODE_ENV production

# Gerar o cliente Prisma
RUN npx prisma generate

# Inicializar o banco SQLite em /app/data/dev.db (local correto para producao)
RUN mkdir -p /app/data && DATABASE_URL="file:/app/data/dev.db" npx prisma db push --skip-generate

# Build da aplicacao
RUN npm run build

# Etapa 3: Runner
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Apontar para engine compativel com OpenSSL 3.x no Alpine
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Aproveita a saida standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma

# Copiar banco inicializado para /app/data (sera sobrescrito pelo volume se ja existir em producao)
RUN mkdir -p /app/data
COPY --from=builder --chown=nextjs:nodejs /app/data/dev.db ./data/dev.db

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# O banco SQLite sera persistido via volume montado em /app/data
CMD ["node", "server.js"]
