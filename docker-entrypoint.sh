#!/bin/sh
set -e

# O volume (banco SQLite + uploads) é montado em /app/prisma e chega vazio na
# primeira subida — e montado pelo orquestrador, costuma vir como root.
# Rodamos este trecho como root só para ajustar dono e garantir o schema,
# e entregamos o processo para o usuário sem privilégio logo em seguida.

mkdir -p /app/prisma/uploads
chown -R nextjs:nodejs /app/prisma

# Cria as tabelas quando o banco ainda não existe. Com o banco já correto,
# `db push` não altera nada — é seguro rodar a cada boot.
# Sem --accept-data-loss de propósito: se algum dia o schema divergir a ponto
# de exigir descarte de coluna, é melhor o deploy falhar do que perder reserva.
#
# Chamamos o arquivo do CLI direto em vez de `npx prisma`: a imagem final não
# carrega node_modules/.bin, que é onde o npx procuraria o executável.
su-exec nextjs:nodejs node /app/node_modules/prisma/build/index.js db push \
  --schema /app/prisma-schema/schema.prisma --skip-generate

exec su-exec nextjs:nodejs node server.js
