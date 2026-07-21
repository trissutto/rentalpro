# Projeto Reservas Ita — Resumo Técnico Completo

> Última atualização: 11/06/2026
> Site: https://reservasita.com.br (sem www!)
> Repositório: GitHub → deploy via GitHub Actions + Portainer webhook

---

## Stack

- **Frontend/Backend:** Next.js 14 (App Router)
- **Banco de dados:** Prisma ORM (PostgreSQL)
- **Pagamentos:** PagBank (PIX via `/orders` + cartão via `/charges`)
- **Deploy:** Docker Alpine + GitHub Actions CI/CD → Portainer
- **PDF contratos:** Python + reportlab (instalados no Dockerfile)
- **Email:** SMTP direto via TLS (sem nodemailer)

---

## Estrutura de Pastas Principais

```
src/
├── app/
│   ├── (dashboard)/          # Admin/retaguarda
│   │   ├── layout.tsx        # Sidebar dark premium com menus colapsáveis
│   │   ├── settings/page.tsx # Configurações (PagBank, WhatsApp, SMTP, etc.)
│   │   └── reservations/     # Gestão de reservas
│   ├── (guest)/              # Área do hóspede
│   │   ├── layout.tsx        # Layout público "Reservas Ita"
│   │   └── imoveis/
│   │       ├── page.tsx      # Home: hero, busca, calendário, Itanhaém, footer
│   │       └── [slug]/page.tsx # Detalhe do imóvel com calendário + reserva
│   └── api/
│       ├── public/
│       │   ├── pagbank-config/route.ts    # Public key PagBank
│       │   ├── pagbank-pix/route.ts       # PIX via /orders + qr_codes
│       │   ├── pagbank-card/route.ts      # Cartão via /charges
│       │   ├── pay-installment/route.ts   # Parcelas (PIX + cartão)
│       │   └── whatsapp-config/route.ts   # Config WhatsApp
│       ├── payments/test/route.ts         # Teste token PagBank
│       └── webhooks/pagbank/route.ts      # Webhook PagBank
├── components/
│   └── DateRangePicker.tsx   # Calendário modal (portal, 2 meses)
├── lib/
│   └── email.ts              # SMTP + template PIX email
└── Dockerfile                # Alpine + Python + reportlab
```

---

## O Que Foi Feito

### 1. PagBank — Pagamentos
- **PIX:** Reescrito para usar `POST /orders` com `qr_codes[]` (não `/charges`)
- **Cartão:** Usa `POST /charges` com `payment_method.type: "CREDIT_CARD"`
- **SDK:** URL atualizada para `checkout-sdk-js/rc/dist/browser/pagseguro.min.js`
- **Public Key:** Auto-salva no DB ao testar token; `pagbank-config` busca da API se não cacheado
- **`force-dynamic`** em todas as rotas de API para evitar cache do Next.js no build
- **⚠️ PENDENTE:** Conta PagBank precisa de aprovação para API (`whitelist_unauthorized`). Thiago precisa ligar para o PagBank.

### 2. Interface Admin (Dashboard)
- Sidebar dark (#0f172a) com gradiente azul/indigo
- Menus colapsáveis: Operações, Financeiro, Inventário
- Animação com framer-motion
- Drawer mobile com backdrop

### 3. Home Page (Guest)
- Hero com busca integrada (Entrada/Saída/Hóspedes)
- DateRangePicker: modal fullscreen no mobile via `createPortal`
- Busca filtra imóveis por disponibilidade e capacidade
- Botão "Buscar" rola suavemente até seção de imóveis
- Datas passam via query params para página do imóvel
- Fotos quadradas (`aspect-square`)
- Seção "Descubra Itanhaém" com 6 atrações
- Footer com contato, Instagram (@reservasita)
- Botão WhatsApp flutuante (número e mensagem configuráveis)

### 4. Página do Imóvel
- Recebe checkIn/checkOut/guests da URL
- Calendário navega para o mês do check-in
- Barra de resumo acima do calendário (datas + noites + total)
- Fotos quadradas

### 5. Renomeação
- "Villa Mare" → "Reservas Ita" em todo o app

### 6. PDF Contratos
- Dockerfile atualizado com Python + reportlab

### 7. WhatsApp
- API `/api/public/whatsapp-config` retorna número e mensagem
- Configurável em Settings do admin
- Botão flutuante na home

---

## Problemas Conhecidos / Resolvidos

| Problema | Causa | Solução |
|----------|-------|---------|
| "Gateway não configurado" | Public key null no DB | Auto-fetch + force-dynamic |
| "invalid_parameter pix" | Endpoint errado (/charges) | Reescrito para /orders |
| "whitelist_unauthorized" | Conta não aprovada PagBank | ⚠️ Ligar para PagBank |
| Mobile congelado | Overlay capturando touch | `pointer-events-none` |
| Calendário atrás do conteúdo | `overflow:hidden` no pai | `createPortal` |
| Calendário fechando ao clicar | Outside-click listener | Removido (backdrop fecha) |
| `searchParams` undefined | Variável usada fora do escopo | Usar props |
| PDF não abre | Python faltando no Docker | Adicionado ao Dockerfile |

---

## Pendências

1. **PagBank:** Ligar para suporte e pedir aprovação da conta para pagamentos via API
2. **Commit + Push:** Últimas alterações (resumo de datas + scroll para imóveis) precisam ser commitadas no GitHub Desktop
3. **Airbnb iCal sync:** Integração para sincronizar calendários (adiada)
4. **Testar pagamentos:** Após aprovação do PagBank

---

## Deploy

1. Commit + Push no GitHub Desktop
2. GitHub Actions roda o build
3. Portainer webhook faz auto-deploy

**URL:** https://reservasita.com.br (NÃO usar www)

---

## Para Continuar em Outra Sessão

Ao iniciar nova conversa no Cowork, compartilhe este arquivo e diga:
"Estou continuando o projeto Reservas Ita. Leia o documento PROJETO-RESERVAS-ITA.md para contexto."
