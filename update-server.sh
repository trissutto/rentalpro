#!/bin/bash
# ═══════════════════════════════════════════════════════════
#  RentalPro — Atualização do sistema em produção
#  Execute: bash update-server.sh
# ═══════════════════════════════════════════════════════════

APP_DIR="/var/www/rentalpro"
cd $APP_DIR

echo "🔄 Atualizando RentalPro..."

# Puxar últimas alterações do Git
git pull origin main

# Instalar novas dependências (se houver)
npm install --production=false

# Rodar migrations (seguro — usa CREATE IF NOT EXISTS)
node migrate-minnights.js 2>/dev/null || true
node migrate-dateblocks.js 2>/dev/null || true

# Rebuild
npm run build

# Reiniciar sem downtime
pm2 restart rentalpro

echo ""
echo "✅ Sistema atualizado e reiniciado!"
echo "   Versão: $(git log -1 --format='%h — %s')"
pm2 status
