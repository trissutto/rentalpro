# Reservas Ita

Aplicação de reservas de temporada em Itanhaém, com catálogo público, portal do hóspede e administração de imóveis, reservas, limpeza e financeiro.

## Stack e ambiente

- Next.js 14, React 18 e TypeScript.
- Prisma 5 com **SQLite em arquivo**; o schema atual não usa PostgreSQL.
- Produção principal: Railway, serviço rentalpro, domínio https://reservasita.com.br.
- Docker com Node.js 20; volume persistente em /app/prisma.
- GitHub Actions publica imagem no GHCR e mantém integração Portainer. Railway acompanha main.
- Contratos PDF utilizam Python e ReportLab no contêiner.

## Desenvolvimento e validação

Use Node.js 24 para os testes (alguns usam node:sqlite). Copie .env.example para .env e configure um banco local separado e chave JWT aleatória. Não reutilize segredos de produção.

```sh
npm ci
npx prisma generate
npm run db:push
npm run dev
```

DATABASE_URL="file:./dev.db" resolve prisma/dev.db. Em produção, use o caminho absoluto do volume, por exemplo file:/app/prisma/dev.db.

Antes de publicar:

```sh
npm run typecheck
npm test
npm run build
```

Os testes criam bancos temporários com dados sintéticos e simulam gateways e notificações. Não precisam de credenciais reais. O build deve usar banco descartável, nunca o operacional como fixture.

Os seeds são demonstrações para ambientes descartáveis. **Não execute seed em produção.** O boot verifica o schema com prisma db push --skip-generate, sem autorizar perda de dados.

## Regras de reserva e acesso

- A cobrança inclui os dias de entrada e saída. Uma estadia de 2 noites corresponde a 3 diárias cobradas.
- Cotação calculada no servidor; alterações cadastrais preservam valores. Total manual é uma ação explícita do painel.
- Solicitações pendentes sem pagamento retêm disponibilidade por 2 horas. Criação e confirmação de pagamento verificam conflitos em transação.
- O código comercial não é senha. Links de hóspede contêm token assinado com prazo e escopos; o painel emite novos links. Links antigos com apenas código precisam ser substituídos.
- GUEST_ACCESS_SECRET é opcional; sem ele, a assinatura usa JWT_SECRET com separação de contexto. Alterar a chave invalida links existentes.
- Limites de tentativas são mantidos em memória e pressupõem **uma réplica**. Antes de escalar, adotar limites compartilhados e reavaliar SQLite.
- Pré-cadastro não libera entrada. Instruções e Wi-Fi exigem pagamento integral, confirmação e horário válido em São Paulo.
- Dados de sessão exigem conexão. Logout limpa caches; a nova versão do service worker elimina o antigo offlineCache.

## Pagamentos

Configurações PagBank, Pagar.me e Mercado Pago ficam no servidor. Não colocar tokens em variáveis NEXT_PUBLIC_*. card_gateway escolhe a integração de cartão; sem configuração explícita, permanece Pagar.me.

Webhooks consultam o gateway autenticado, conferem referência, moeda, valor e estado e registram recebimentos de forma idempotente. Cartão autorizado sem captura não é quitação. Pagamentos com conflito ou após expiração entram em conferência (REVIEW / PAYMENT_REVIEW), sem confirmar hospedagem automaticamente. A resolução manual revalida disponibilidade e saldo.

Comprovantes novos ficam em private-receipts ao lado do SQLite, com download autorizado. scripts/migrate-payment-receipts.cjs migra legados verificando hash e atualizando URLs em transação. Fazer backup de banco **e arquivos** antes da primeira execução. Preservar arquivos do contêiner antigo no volume antes de substituí-lo.

## Calendários e notificações

O workflow iCal sincroniza calendários externos a cada 30 minutos. CRON_SECRET no GitHub e no Railway deve coincidir. Calendários inválidos não substituem bloqueios; datas de saída iCal são exclusivas. URLs privadas não aparecem no catálogo.

SMTP requer host, porta, usuário, senha e remetente. O transporte usa TLS implícito (normalmente 465). O relatório retorna erro quando configuração/envio falha. Seu saldo representa movimentos do período, incluindo receitas, despesas e repasses registrados; não promete um repasse futuro.

WhatsApp depende da Evolution API. Testes não enviam mensagens. Sem configuração, o envio não é marcado como concluído.

## Publicação e recuperação

1. Validar tipos, testes e build. Revisar diff e preservar alterações de terceiros.
2. Fazer backup verificável de SQLite e arquivos persistentes; registrar versão atual.
3. Revisar PR; merge em main pode publicar automaticamente.
4. Confirmar implantação e versão, disponibilidade, controles de acesso e iCal.
5. Em regressão, reimplantar versão compatível. Não restaurar banco por cima de reservas novas sem analisar alterações desde o backup.

[Regras de trabalho](AGENTS.md), [auditoria](docs/AUDITORIA-2026-09-17.md) e [continuidade](docs/CONTINUIDADE-2026-09-17.md).
