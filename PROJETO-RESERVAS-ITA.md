# Projeto Reservas Ita — estado técnico

Atualização: 17/09/2026.

O projeto usa **SQLite + Prisma**, Next.js 14 e React 18. Produção principal em Railway, domínio https://reservasita.com.br, serviço rentalpro, volume /app/prisma. A branch main participa da publicação automática. GitHub Actions também mantém imagem GHCR e webhook Portainer existentes.

Operação, instalação, testes, cobrança, acesso e recuperação estão no [README](README.md). Este documento substitui o resumo de junho, que descrevia PostgreSQL e uma pendência de habilitação PagBank sem refletir a configuração verificada em setembro.

| Área | Implementação |
|---|---|
| Catálogo | /imoveis e /imoveis/[slug]; seleção explícita de campos públicos |
| Painel | /home; autenticação e permissões no servidor |
| Reservas | Cotação central em src/lib/pricing.ts; disponibilidade e gravações transacionais |
| Hóspedes | Links assinados para reserva, pagamento, pré-cadastro e contrato |
| Entrada | Pagamento integral e janela de hospedagem em São Paulo |
| Pagamentos | PagBank PIX/cartão, Pagar.me checkout e Mercado Pago; integração ativa depende das configurações |
| Comprovantes | Armazenamento privado junto ao banco; download autorizado |
| Airbnb | Importação preserva bloqueios quando falha; workflow a cada 30 minutos |
| PDF | Python/ReportLab no Docker |
| E-mail | SMTP com TLS implícito; relatório sinaliza falhas de configuração/envio |
| PWA | Recursos estáticos instaláveis; dados operacionais exigem conexão |

A credencial PagBank do FlowOps foi validada por consulta e preparada para teste local na etapa anterior. A configuração de pagamentos da produção Reservas Ita foi preservada. Nenhuma cobrança real de teste ou mensagem a hóspedes foi realizada para validação.

[Regras autorizadas pelo usuário](AGENTS.md), [19 achados e critérios](docs/AUDITORIA-2026-09-17.md) e [evidências operacionais](docs/CONTINUIDADE-2026-09-17.md).

Não registrar segredos, links assinados reais, dados pessoais, banco operacional ou comprovantes no Git.
