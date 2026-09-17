# Correções da auditoria de 17/09/2026

Escopo: os 19 achados da auditoria inicial. Os critérios abaixo foram implementados e verificados em ambiente isolado; a publicação e suas evidências são registradas ao final. A classificação original permanece como histórico de prioridade.

| ID | Nível original | Correção e evidência |
|---|---|---|
| AUD-001 | N1 | Consulta autenticada ao gateway, conferência de referência/valor/moeda/captura e registro transacional idempotente. Testes de evento falso, repetição, divergência, reembolso e pagamento tardio. |
| AUD-002 | N2 | Catálogo usa lista explícita de campos públicos. Testes com instruções, Wi-Fi e iCal sintéticos comprovam ausência na resposta. |
| AUD-003 | N2 | Código separado de token assinado, escopos, prazo e limite de tentativas. Testes de assinatura, expiração, escopos, acesso sem token e links autorizados. |
| AUD-004 | N2 | Escopo do proprietário aplicado a reserva, financeiro, agregados, gráficos e parcelamentos. Testes com dois proprietários e dados distintos. |
| AUD-005 | N2 | Entrada exige confirmação, pagamento integral e janela em São Paulo. Cadastro antecipado separado; cron não antecipa credenciais nem encerra hospedagem ao enviar lembrete. |
| AUD-006 | N2 | Retenção de duas horas, verificação transacional e conferência manual de pagamentos incompatíveis. Testes concorrentes, expiração e conflito de calendário. |
| AUD-007 | N2 | Edição cadastral preserva preço/comissão/repasse; mudanças financeiras usam cotação atual e total manual explícito. Testes de preservação e conflito de preço. |
| AUD-008 | N2 | Cotação central no servidor usada por telas públicas e internas. expectedTotal evita aceitar valor alterado sem nova conferência. Testes de tarifas, adicionais, limpeza e respostas fora de ordem. |
| AUD-009 | N2 | Reserva, limpeza e financeiro gravados em transação; filtro compatível com SQLite. Teste de falha tardia comprova rollback. |
| AUD-010 | N2 | Calendário validado antes de substituir bloqueios; correção de DTEND exclusivo e autenticação do cron, já publicada no PR #3. Testes iCal mantidos. |
| AUD-011 | N3 | Erros TypeScript corrigidos, ignoreBuildErrors removido e CI executa tipos/testes antes da publicação da imagem. |
| AUD-012 | N3 | Relatório recebe configuração SMTP completa; transporte verifica respostas completas/códigos, timeout e aceitação final. Testes sem rede cobrem sucesso, recusa e interrupção. |
| AUD-013 | N3 | Service worker usa NetworkOnly para consultas; remove cache antigo e limpa caches na mudança de sessão. APIs usam no-store. |
| AUD-014 | N3 | PIX integral/parcelado acompanha confirmação, expiração e erros com recuperação e cancelamento de consultas. REVIEW bloqueia cobrança adicional. Testes de página real com transporte simulado. |
| AUD-015 | N3 | Falha de disponibilidade exibe erro e bloqueia solicitação; retentativa recupera. Datas fora da cobertura também são bloqueadas. |
| AUD-016 | N3 | Rota duplicada removida; Painel aponta para /home e raiz pública mantém catálogo. Build confirma rotas. |
| AUD-017 | N3 | Noites distintas de diárias inclusivas nas telas de busca, reserva, pagamento e contrato. Exemplo verificado: 2 noites, 3 diárias. |
| AUD-018 | N3 | Zoom liberado; calendário com nomes acessíveis, Escape, foco contido/retornado e navegação por setas. Testes simulados e verificação no Chrome local. |
| AUD-019 | N4 | README e resumo técnico atualizados para SQLite, Railway/volume, testes, pagamentos e regras de operação. |

## Validação

- 187 testes automatizados aprovados, com bancos descartáveis e dados sintéticos.
- TypeScript sem os 22 erros da auditoria inicial; build completo aprovado com verificação de tipos habilitada.
- Teste HTTP em build de produção isolado: cotação de R$ 350, criação 201, conflito 409, acesso sem token 401 e com token 200; instruções privadas ausentes e entrada antecipada negada.
- Chrome local: diálogo do calendário, Shift+Tab/Tab, Escape e retorno ao botão; cotação mostra 2 noites / 3 diárias / R$ 350.
- Nenhuma cobrança real, reserva de teste em produção, mensagem WhatsApp ou e-mail de teste enviado.

## Proteções adicionais

Comprovantes novos usam armazenamento privado ao lado do SQLite. Migração copia/verifica hash antes de atualizar referências; banco e arquivos existentes foram preservados antes da publicação. A pasta de recibos foi excluída do Git e da imagem Docker. Arquivos de teste no histórico não foram reescritos.

Cobranças legadas iniciadas antes do registro de idempotência exigem conferência para nova tentativa; callbacks autenticados continuam processados. Operações com REVIEW podem ser resolvidas por ADMIN/TEAM após confirmação explícita na interface e nova validação do saldo/disponibilidade.

Links antigos contendo apenas o código deixam de autorizar acesso. A administração deve copiar o novo link pela reserva. Nenhum reenvio automático em massa foi realizado.

Os limites de tentativas são locais ao processo e pressupõem uma réplica. Pagamentos reais e entrega de e-mail dependem dos provedores; testes simulados não demonstram liquidação bancária ou entrega na caixa de entrada.

## Publicação

Em andamento. Backup SQLite com integridade verificada e cópia dos recibos com hashes conferidos. Não houve alteração do schema nem substituição das credenciais de pagamento em produção.
