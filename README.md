# 🏠 RentalPro — Sistema de Gestão de Imóveis por Temporada

Sistema completo de administração interna para locação por temporada. Mobile-first, PWA instalável, com automações, financeiro e integração WhatsApp.

---

## 📸 Módulos

| Módulo | Descrição |
|--------|-----------|
| 🗓️ Dashboard | Ocupação, check-ins/outs do dia, limpezas pendentes, financeiro |
| 📅 Calendário | Grade visual por imóvel, todas as reservas, drag (coming soon) |
| 🧹 Limpeza | Kanban automático (Pendente → Em andamento → Concluído → Atrasado) |
| 🏠 Imóveis | Cadastro completo com fotos, preços, amenidades |
| 💰 Financeiro | Receitas, despesas, repasses, gráficos mensais |
| 👷 Faxineiras | Cadastro e distribuição automática de tarefas |
| 📲 WhatsApp | Notificações automáticas para hóspedes e faxineiras |

---

## 🚀 Instalação Rápida

### Pré-requisitos
- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
# Edite o .env com suas credenciais
```

Edite o arquivo `.env`:
```env
DATABASE_URL="postgresql://SEU_USER:SUA_SENHA@localhost:5432/rental_system"
JWT_SECRET="uma-chave-secreta-longa-e-aleatoria"
```

### 3. Configurar banco de dados

```bash
# Criar as tabelas
npm run db:push

# Popular com dados de demo
npm run db:seed
```

### 4. Rodar em desenvolvimento

```bash
npm run dev
```

Acesse: **http://localhost:3000**

---

## 👤 Credenciais de Demo

| Perfil | Email | Senha | Acesso |
|--------|-------|-------|--------|
| Admin | admin@rental.com | admin123 | Total |
| Equipe | equipe@rental.com | team123 | Operacional |
| Proprietário | proprietario@rental.com | owner123 | Visualização |

---

## 📦 Deploy em Produção

### Opção A: Vercel + Supabase (Recomendado)

1. **Banco de dados:** Crie um projeto no [Supabase](https://supabase.com) e copie a connection string.

2. **Deploy no Vercel:**
```bash
npm install -g vercel
vercel --prod
```

3. **Variáveis no Vercel:** Adicione `DATABASE_URL` e `JWT_SECRET` em Settings → Environment Variables.

4. **Migrate produção:**
```bash
npx prisma migrate deploy
```

---

### Opção B: VPS (Ubuntu)

```bash
# 1. Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Instalar PostgreSQL
sudo apt install postgresql postgresql-contrib

# 3. Criar banco
sudo -u postgres psql -c "CREATE DATABASE rental_system;"
sudo -u postgres psql -c "CREATE USER rental_user WITH PASSWORD 'senha123';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE rental_system TO rental_user;"

# 4. Clonar e instalar
git clone <seu-repo>
cd rental-system
npm install

# 5. Configurar .env
cp .env.example .env
nano .env  # Configure DATABASE_URL e JWT_SECRET

# 6. Build e migrar
npm run db:push
npm run db:seed
npm run build

# 7. Iniciar com PM2
npm install -g pm2
pm2 start npm --name "rentalpro" -- start
pm2 startup
pm2 save
```

---

## 📱 Instalar como App (PWA)

### Android (Chrome)
1. Abra o sistema no Chrome
2. Toque no menu ⋮ → "Adicionar à tela inicial"
3. Confirme a instalação

### iOS (Safari)
1. Abra no Safari
2. Toque no ícone de compartilhar ↑
3. "Adicionar à Tela de Início"

---

## 📲 Configurar WhatsApp

O sistema usa a **Evolution API** (open source) para envio de mensagens.

### 1. Instalar Evolution API (Docker)
```bash
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e AUTHENTICATION_API_KEY=minha-chave \
  atendai/evolution-api:latest
```

### 2. Criar instância
```bash
curl -X POST http://localhost:8080/instance/create \
  -H "apikey: minha-chave" \
  -H "Content-Type: application/json" \
  -d '{"instanceName": "rental-instance"}'
```

### 3. Conectar WhatsApp
Acesse `http://localhost:8080` → escaneie o QR Code com seu WhatsApp.

### 4. Configurar .env
```env
WHATSAPP_API_URL=http://localhost:8080
WHATSAPP_API_KEY=minha-chave
WHATSAPP_INSTANCE=rental-instance
```

---

## 🏗️ Estrutura do Projeto

```
rental-system/
├── prisma/
│   ├── schema.prisma          # Modelos do banco (User, Property, Reservation, Cleaning...)
│   └── seed.ts                # Dados de demo
├── src/
│   ├── app/
│   │   ├── (auth)/login/      # Tela de login
│   │   ├── (dashboard)/       # Área principal (protegida)
│   │   │   ├── page.tsx       # Dashboard
│   │   │   ├── calendar/      # Calendário inteligente
│   │   │   ├── cleaning/      # Painel Kanban de limpeza
│   │   │   ├── reservations/  # Gestão de reservas
│   │   │   ├── properties/    # Gestão de imóveis
│   │   │   ├── financial/     # Módulo financeiro
│   │   │   ├── cleaners/      # Faxineiras
│   │   │   └── settings/      # Configurações
│   │   └── api/               # API REST
│   │       ├── auth/          # Login, logout, usuários
│   │       ├── properties/    # CRUD imóveis
│   │       ├── reservations/  # CRUD reservas + calendário
│   │       ├── cleanings/     # CRUD limpezas
│   │       ├── cleaners/      # CRUD faxineiras
│   │       ├── financial/     # Transações financeiras
│   │       └── dashboard/     # Agregações do dashboard
│   ├── lib/
│   │   ├── prisma.ts          # Cliente Prisma singleton
│   │   ├── auth.ts            # JWT helpers
│   │   ├── utils.ts           # Formatação, utilitários
│   │   └── whatsapp.ts        # Integração WhatsApp
│   └── hooks/
│       └── useAuth.ts         # Zustand auth store
└── public/
    └── manifest.json          # PWA manifest
```

---

## ⚙️ Automações Implementadas

| Trigger | Ação Automática |
|---------|----------------|
| Nova reserva criada | Cria tarefa de limpeza para o dia do checkout |
| Nova reserva criada | Envia WhatsApp de confirmação ao hóspede |
| Tarefa de limpeza criada | Atribui faxineira por região e envia WhatsApp |
| GET /api/cleanings | Atualiza status para LATE se prazo venceu |
| Checkout feito | Marca limpeza como PENDING (prioridade) |

---

## 🔐 Permissões por Perfil

| Recurso | Admin | Equipe | Proprietário |
|---------|-------|--------|--------------|
| Dashboard | ✅ | ✅ | ✅ (só seus imóveis) |
| Calendário | ✅ | ✅ | ✅ (só seus imóveis) |
| Limpeza | ✅ | ✅ | ❌ |
| Reservas (criar/editar) | ✅ | ✅ | ❌ |
| Imóveis (criar/editar) | ✅ | ✅ | ❌ |
| Financeiro | ✅ | ❌ | ✅ (visualização) |
| Usuários | ✅ | ❌ | ❌ |

---

## 🛠️ Scripts Úteis

```bash
npm run dev          # Desenvolvimento
npm run build        # Build produção
npm run start        # Servidor produção
npm run db:push      # Sincronizar schema (sem migração)
npm run db:migrate   # Criar migração
npm run db:seed      # Popular dados demo
npm run db:studio    # Prisma Studio (GUI do banco)
```

---

## 📊 Stack Tecnológica

- **Frontend:** Next.js 14 (App Router), React 18, TypeScript
- **Styling:** Tailwind CSS + animações Framer Motion
- **Estado:** Zustand (auth) + React Query (em expansão)
- **Backend:** Next.js API Routes (Node.js)
- **ORM:** Prisma 5
- **Banco:** PostgreSQL
- **Auth:** JWT + httpOnly cookies
- **PWA:** next-pwa + manifest.json
- **Charts:** Recharts
- **Toast:** react-hot-toast
- **WhatsApp:** Evolution API / Z-API

---

## 🔮 Próximos Passos (Roadmap)

- [ ] Upload de fotos para imóveis (Cloudinary)
- [ ] Drag & drop real no calendário (@dnd-kit)
- [ ] Integração com Airbnb via iCal (importar reservas)
- [ ] Relatórios PDF (repasse mensal ao proprietário)
- [ ] App móvel nativo (React Native)
- [ ] Notificações push (Firebase FCM)
- [ ] Multi-tenant (múltiplas empresas)

---

Desenvolvido com ❤️ para gestão eficiente de imóveis por temporada.
