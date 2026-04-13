#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  RentalPro — Script de instalação automática no VPS (Ubuntu 22.04)
#  Execute como root: bash install-server.sh
# ═══════════════════════════════════════════════════════════════════

set -e

# ── Configurações — edite antes de rodar ────────────────────────────
DOMAIN="reservasita.com.br"
REPO_URL="https://github.com/trissutto/rentalpro.git"
APP_DIR="/var/www/rentalpro"
NODE_VERSION="20"
# ────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║   RentalPro — Instalação no Servidor     ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 1. Atualizar sistema
echo "▶ [1/9] Atualizando sistema..."
apt-get update -qq && apt-get upgrade -y -qq

# 2. Instalar Node.js LTS
echo "▶ [2/9] Instalando Node.js $NODE_VERSION..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - > /dev/null
apt-get install -y nodejs -qq
echo "   Node $(node -v) | npm $(npm -v)"

# 3. Instalar PM2 (gerenciador de processos)
echo "▶ [3/9] Instalando PM2..."
npm install -g pm2 --quiet
pm2 startup systemd -u root --hp /root > /dev/null

# 4. Instalar Nginx
echo "▶ [4/9] Instalando Nginx..."
apt-get install -y nginx -qq
systemctl enable nginx > /dev/null

# 5. Instalar Certbot (SSL gratuito Let's Encrypt)
echo "▶ [5/9] Instalando Certbot..."
apt-get install -y certbot python3-certbot-nginx -qq

# 6. Clonar projeto
echo "▶ [6/9] Clonando projeto..."
mkdir -p $APP_DIR
git clone $REPO_URL $APP_DIR
cd $APP_DIR

# 7. Criar .env de produção
echo "▶ [7/9] Configurando variáveis de ambiente..."
cat > $APP_DIR/.env << EOF
DATABASE_URL="file:./prisma/prod.db"
NEXTAUTH_SECRET="$(openssl rand -base64 32)"
NEXTAUTH_URL="https://reservasita.com.br"
JWT_SECRET="$(openssl rand -base64 32)"
CRON_SECRET="$(openssl rand -base64 16)"
NODE_ENV="production"
EOF
echo "   ✅ .env criado com secrets aleatórios"

# 8. Instalar dependências e build
echo "▶ [8/9] Instalando dependências e buildando..."
cd $APP_DIR
npm install --production=false
npx prisma generate 2>/dev/null || true
node migrate-minnights.js 2>/dev/null || true
node migrate-dateblocks.js 2>/dev/null || true
npm run build

# 9. Configurar PM2
echo "▶ [9/9] Configurando PM2..."
cat > $APP_DIR/ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name:        'rentalpro',
    script:      'node_modules/.bin/next',
    args:        'start -p 3000',
    cwd:         '$APP_DIR',
    instances:   1,
    autorestart: true,
    watch:       false,
    max_memory_restart: '500M',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
    }
  }]
}
EOF

pm2 start $APP_DIR/ecosystem.config.js
pm2 save

# 10. Configurar Nginx como proxy reverso
echo "▶ [10/10] Configurando Nginx..."
cat > /etc/nginx/sites-available/rentalpro << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    # Segurança
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";

    # Proxy para Next.js
    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 60s;
    }

    # Aumentar limite de upload
    client_max_body_size 20M;
}
EOF

ln -sf /etc/nginx/sites-available/rentalpro /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx

# 11. Ativar SSL
echo ""
echo "▶ Ativando HTTPS com Let's Encrypt..."
certbot --nginx -d $DOMAIN -d www.$DOMAIN --non-interactive --agree-tos \
  --email admin@$DOMAIN --redirect

echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║   ✅ Instalação concluída com sucesso!           ║"
echo "╠══════════════════════════════════════════════════╣"
echo "║                                                  ║"
echo "║  🌐 Sistema:  https://$DOMAIN"
echo "║  📊 Status:   pm2 status                        ║"
echo "║  📋 Logs:     pm2 logs rentalpro                ║"
echo "║  🔄 Restart:  pm2 restart rentalpro             ║"
echo "║                                                  ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "⚠️  Guarde o conteúdo do arquivo .env:"
cat $APP_DIR/.env
