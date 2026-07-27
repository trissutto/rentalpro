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
# Banco usado apenas durante o build; em producao vem do volume via DATABASE_URL
ENV DATABASE_URL "file:./dev.db"

# Gerar o cliente Prisma
RUN npx prisma generate

# Inicializar o banco SQLite em /app/prisma/dev.db
RUN npx prisma db push --skip-generate

# Build da aplicacao
RUN npm run build

# Etapa 3: Runner
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl su-exec python3 py3-pip \
    && pip3 install --break-system-packages reportlab
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

# Apontar para engine compativel com OpenSSL 3.x no Alpine
ENV PRISMA_QUERY_ENGINE_LIBRARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Garante que o diretorio de uploads existe e pertence ao nextjs
RUN mkdir -p public/uploads && chown -R nextjs:nodejs public/uploads

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Aproveita a saida standalone
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Copia apenas o schema (NUNCA o dev.db — banco fica no volume)
# O schema vai para FORA de /app/prisma: aquele diretório é o ponto de montagem
# do volume, e o mount esconde qualquer arquivo que a imagem tenha deixado lá.
COPY --from=builder --chown=nextjs:nodejs /app/prisma/schema.prisma ./prisma-schema/schema.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
# CLI do Prisma: o entrypoint roda `db push` no boot para criar as tabelas
# quando o volume ainda está vazio (primeira subida no Railway)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
# sharp é binário nativo (compressão das fotos). Copiado explicitamente porque
# o rastreio do standalone nem sempre leva os .node das dependências opcionais.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@img ./node_modules/@img

COPY --chown=nextjs:nodejs docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

EXPOSE 3000
ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# O banco SQLite e os uploads são persistidos no volume montado em /app/prisma.
# O entrypoint sobe como root só para ajustar dono do volume e cai para `nextjs`.
CMD ["./docker-entrypoint.sh"]