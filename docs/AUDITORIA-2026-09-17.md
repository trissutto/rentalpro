# Auditoria inicial — Reservas Ita

Data: 17/09/2026
Repositório analisado: `C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system`
Commit de referência: `285089d` — 21/08/2026.
Estado dos achados: abertos; esta etapa documenta a auditoria e as regras de trabalho.

## Resultado e limites

Foram consolidados **19 achados: 1 crítico, 9 altos, 8 médios e 1 baixo**. São causas agrupadas para orientar correções, não 19 incidentes comprovados em produção.

A análise cobre o código local, configuração, documentação, fluxos de reservas/pagamentos e verificações locais. Não identifica qual commit está publicado. Não foram consultados dados reais de hóspedes nem executados pagamentos, notificações ou testes contra produção.

Evidência principal: leitura estática. A checagem TypeScript foi executada novamente nesta etapa. A rejeição do filtro Prisma/SQLite foi reproduzida em banco temporário isolado durante a avaliação inicial desta conversa. Exemplos financeiros são calculados a partir das fórmulas e payloads do código, não de reservas reais.

As condições e os critérios de aceite de cada item são explícitos. **Critérios de aceite são testes propostos para a correção, não testes já aprovados.** A severidade expressa prioridade de engenharia neste projeto, não uma pontuação CVSS.

## Níveis

| Nível | Critério | Tratamento |
|---|---|---|
| N1 — Crítico | Contorna uma garantia essencial, permitindo confirmar quitação sem comprovação. | Primeira correção; verificar a exposição efetiva e aplicar contenção compatível com a operação. |
| N2 — Alto | Pode expor dados ou instruções privadas, alterar valores, criar sobreposição ou deixar registros essenciais inconsistentes. | Corrigir na primeira fase de estabilização, com testes de regressão focados. |
| N3 — Médio | Prejudica confiabilidade, uso, privacidade local ou detecção de regressões, com condições mais restritas ou impacto menos imediato. | Tratar após/conjuntamente aos fluxos prioritários, conforme dependências. |
| N4 — Baixo | Problema de documentação e manutenção sem dano direto demonstrado na operação. | Corrigir junto da atualização do projeto. |

A classificação considera também o impacto real demonstrável. Por isso, uma tela PIX sem atualização automática e um erro de calendário apresentado incorretamente são médios neste relatório: não foi demonstrada falha de recebimento nesses itens. A proteção de disponibilidade no servidor é classificada separadamente como alta.

## Inventário

| ID | Nível | Achado |
|---|---|---|
| AUD-001 | N1 — Crítico | Confirmação de pagamento sem comprovação |
| AUD-002 | N2 — Alto | Catálogo público retorna campos privados dos imóveis |
| AUD-003 | N2 — Alto | Código previsível funciona como credencial da reserva |
| AUD-004 | N2 — Alto | Proprietários conseguem consultar dados de outros imóveis |
| AUD-005 | N2 — Alto | Check-in libera instruções sem validar pagamento ou período |
| AUD-006 | N2 — Alto | Criação e pagamento permitem reservas sobrepostas |
| AUD-007 | N2 — Alto | Correção cadastral altera preço, comissão e repasse |
| AUD-008 | N2 — Alto | Orçamento exibido diverge do valor reservado |
| AUD-009 | N2 — Alto | Reserva do painel pode ser salva parcialmente e retornar erro |
| AUD-010 | N2 — Alto | Resposta iCal inválida pode apagar bloqueios existentes |
| AUD-011 | N3 — Médio | Erros TypeScript são ignorados pelo build e não há testes no fluxo CI examinado |
| AUD-012 | N3 — Médio | Relatório mensal chama o envio de e-mail com contrato incompatível |
| AUD-013 | N3 — Médio | Cache da PWA pode preservar respostas privadas após logout |
| AUD-014 | N3 — Médio | Tela de PIX não acompanha confirmação normal do pagamento |
| AUD-015 | N3 — Médio | Falha de disponibilidade pode parecer calendário livre |
| AUD-016 | N3 — Médio | Menu Painel e definição da rota raiz são inconsistentes |
| AUD-017 | N3 — Médio | Noites e diárias cobradas são apresentadas como equivalentes |
| AUD-018 | N3 — Médio | Zoom bloqueado e calendário com barreiras de acessibilidade |
| AUD-019 | N4 — Baixo | Documentação descreve banco e pendências diferentes do código |

## Achados detalhados

### AUD-001 — N1 — Crítico — Confirmação de pagamento sem comprovação

**Evidência:** O webhook do Pagar.me usa o código e o status enviados no corpo da requisição para marcar a reserva como PAID, confirmar uma reserva pendente e lançar receita. Não autentica o evento nem consulta o pedido no gateway.

**Referências:** [src/app/api/webhooks/pagarme/route.ts:17](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/webhooks/pagarme/route.ts:17>); [src/app/api/webhooks/pagarme/route.ts:55](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/webhooks/pagarme/route.ts:55>).

**Impacto e condições:** Quem conhece o código de uma reserva pode fabricar uma confirmação. O recebimento real do dinheiro não é verificado. Classificação crítica pelo desvio direto da integridade financeira; não é uma alegação de fraude já ocorrida.

**Correção proposta:** Validar o evento conforme a integração efetivamente usada, consultar o pedido no gateway, conferir valor, referência e estado e aplicar a atualização de forma idempotente.

**Critério de aceite:** Evento fabricado não altera reserva nem financeiro. Pagamento comprovado confirma uma vez. Repetições não duplicam receita.

### AUD-002 — N2 — Alto — Catálogo público retorna campos privados dos imóveis

**Evidência:** As consultas públicas retornam o objeto Property completo. O schema inclui instruções de acesso, senha de Wi-Fi e URLs dos calendários importados.

**Referências:** [src/app/api/public/properties/route.ts:21](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/properties/route.ts:21>); [src/app/api/public/properties/[slug]/route.ts:5](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/properties/[slug]/route.ts:5>); [prisma/schema.prisma:61](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/prisma/schema.prisma:61>).

**Impacto e condições:** Visitantes sem login recebem esses campos quando estão preenchidos. Possibilidade de entrada física depende do conteúdo das instruções, que não foi inspecionado.

**Correção proposta:** Usar uma lista explícita de campos públicos e separar a entrega de instruções e credenciais em um fluxo autorizado.

**Critério de aceite:** Listagem e detalhe públicos não contêm instruções de acesso, senha de Wi-Fi ou URLs privadas de iCal, mesmo quando esses valores existem nos dados simulados.

### AUD-003 — N2 — Alto — Código previsível funciona como credencial da reserva

**Evidência:** O código é gerado somente a partir de Date.now(). O mesmo código permite obter CPF, contatos e hóspedes e substituir o cadastro de hóspedes. As rotas examinadas não limitam tentativas.

**Referências:** [src/app/api/public/reservation/route.ts:163](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:163>); [src/app/api/public/reservation/[code]/route.ts:8](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/[code]/route.ts:8>); [src/app/api/public/reservation/[code]/guests/route.ts:22](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/[code]/guests/route.ts:22>).

**Impacto e condições:** Um código válido obtido ou adivinhado permite acessar e alterar dados pessoais. O horário aproximado reduz o espaço de busca; nenhuma enumeração de reservas foi executada.

**Correção proposta:** Separar identificador comercial de token de acesso criptograficamente aleatório, definir escopo e validade, limitar tentativas e minimizar os dados retornados. Planejar a transição dos links existentes.

**Critério de aceite:** Conhecer apenas o código comercial não autoriza consulta ou alteração. Tokens inválidos/expirados são rejeitados e excesso de tentativas é limitado.

### AUD-004 — N2 — Alto — Proprietários conseguem consultar dados de outros imóveis

**Evidência:** A API financeira exige login, mas não restringe consultas e agregações ao proprietário autenticado. A consulta individual de reserva também não verifica property.ownerId antes de retornar hóspedes e transações.

**Referências:** [src/app/api/financial/route.ts:7](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/financial/route.ts:7>); [src/app/api/financial/route.ts:39](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/financial/route.ts:39>); [src/app/api/reservations/[id]/route.ts:5](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/reservations/[id]/route.ts:5>).

**Impacto e condições:** Uma conta de proprietário pode consultar informações financeiras de outros imóveis. Para o detalhe de uma reserva também é necessário conhecer seu ID.

**Correção proposta:** Aplicar autorização por objeto em todas as consultas, totais e gráficos, mantendo acesso administrativo conforme perfil.

**Critério de aceite:** Com dois proprietários e dados distintos, cada um vê somente seus imóveis, reservas e totais. Consulta direta ao ID do outro é negada.

### AUD-005 — N2 — Alto — Check-in libera instruções sem validar pagamento ou período

**Evidência:** A API pública rejeita somente reserva inexistente ou cancelada, marca check-in concluído e devolve instruções e Wi-Fi. O visitante pode obter um código criando uma reserva pendente.

**Referências:** [src/app/api/public/checkin/route.ts:9](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/checkin/route.ts:9>); [src/app/api/public/checkin/route.ts:33](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/checkin/route.ts:33>); [src/app/api/public/reservation/route.ts:165](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:165>).

**Impacto e condições:** Reserva pendente ou futura pode aparecer como check-in concluído e receber instruções imediatamente. O impacto sobre acesso físico depende do conteúdo cadastrado.

**Correção proposta:** Aplicar no servidor a política de liberação de entrada: identidade/token, estado permitido, requisitos financeiros e janela de hospedagem. Tratar o preenchimento antecipado de hóspedes separadamente da liberação de acesso.

**Critério de aceite:** Reserva sem autorização de entrada não recebe instruções nem é marcada como entrada concluída. Pré-cadastro permitido continua possível sem revelar credenciais.

### AUD-006 — N2 — Alto — Criação e pagamento permitem reservas sobrepostas

**Evidência:** A criação pública ignora reservas PENDING ao verificar conflitos, mas grava a nova reserva nesse estado. Os webhooks confirmam o pagamento sem verificar novamente a disponibilidade.

**Referências:** [src/app/api/public/reservation/route.ts:123](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:123>); [src/app/api/public/reservation/route.ts:165](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:165>); [src/app/api/webhooks/pagbank/route.ts:109](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/webhooks/pagbank/route.ts:109>).

**Impacto e condições:** Duas pessoas que visualizaram a mesma disponibilidade podem criar pedidos, pagar e receber confirmação para o mesmo imóvel e período. O problema não depende exclusivamente de uma corrida entre requisições simultâneas.

**Correção proposta:** Garantir disponibilidade nas transições que ocupam o imóvel, com retenção e expiração consistentes e proteção transacional. Tratar pagamento tardio explicitamente.

**Critério de aceite:** Pedidos sequenciais e simultâneos, expiração e pagamento tardio não produzem duas reservas confirmadas com períodos conflitantes.

### AUD-007 — N2 — Alto — Correção cadastral altera preço, comissão e repasse

**Evidência:** A tela sempre envia guestCount. Sua presença aciona recálculo mesmo quando somente o nome mudou. A edição usa uma fórmula diferente da criação, ignora tarifas especiais, retira a limpeza do total e a soma ao repasse.

**Referências:** [src/app/(dashboard)/reservations/[id]/page.tsx:214](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(dashboard)/reservations/[id]/page.tsx:214>); [src/app/api/reservations/[id]/route.ts:57](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/reservations/[id]/route.ts:57>); [src/app/api/public/reservation/route.ts:149](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:149>).

**Impacto e condições:** Exemplo calculado a partir do código: três diárias de R$100, limpeza R$50 e comissão de 10%, sem adicionais, começam com total R$350, comissão R$35 e repasse R$265. Corrigir o nome pela tela muda para total R$300, comissão R$30 e repasse R$320.

**Correção proposta:** Detectar alterações efetivas nos campos que afetam preço, preservar valores em correções cadastrais e centralizar a regra financeira.

**Critério de aceite:** Editar nome, telefone ou observações preserva valores. Alterar datas/hóspedes aplica a mesma política de preços, limpeza, comissão e repasse da criação.

### AUD-008 — N2 — Alto — Orçamento exibido diverge do valor reservado

**Evidência:** A ficha do imóvel calcula valores no navegador com coeficientes próprios de feriados e fins de semana. O servidor calcula a criação usando as regras cadastradas completas. A interface também limita sua iteração a 60 dias.

**Referências:** [src/app/(guest)/imoveis/[slug]/page.tsx:194](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/imoveis/[slug]/page.tsx:194>); [src/app/(guest)/imoveis/[slug]/page.tsx:530](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/imoveis/[slug]/page.tsx:530>); [src/app/api/public/reservation/route.ts:149](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/public/reservation/route.ts:149>).

**Impacto e condições:** Sem regras cadastradas, diária R$100 e limpeza zero, sexta a domingo pode aparecer por R$360 na tela e gerar reserva de R$300. Regras específicas podem produzir divergência no sentido oposto.

**Correção proposta:** Mostrar a cotação calculada pelo servidor usando a mesma função da criação e validar qualquer mudança de cotação antes de concluir o pedido.

**Critério de aceite:** Tela e reserva coincidem para ausência de regras, tarifas fixas, feriados específicos, dias personalizados e adicionais. Intervalos longos são tratados explicitamente.

### AUD-009 — N2 — Alto — Reserva do painel pode ser salva parcialmente e retornar erro

**Evidência:** O POST administrativo cria a reserva e só depois busca a faxineira com mode: insensitive, opção rejeitada pelo Prisma configurado para SQLite. Limpeza e lançamentos financeiros vêm depois dessa consulta, sem uma transação envolvendo o conjunto.

**Referências:** [src/app/api/reservations/route.ts:92](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/reservations/route.ts:92>); [src/app/api/reservations/route.ts:121](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/reservations/route.ts:121>); [src/app/api/reservations/route.ts:163](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/reservations/route.ts:163>).

**Impacto e condições:** O cliente recebe erro após a reserva já ter sido persistida, sem as tarefas e lançamentos esperados. A rejeição do filtro foi reproduzida com Prisma em banco temporário isolado, sem dados reais; o efeito parcial foi estabelecido pela ordem das operações no código.

**Correção proposta:** Usar filtro compatível com o banco e uma transação para as gravações relacionadas. Tratar notificações externas após a confirmação da transação.

**Critério de aceite:** Criação válida gera reserva, limpeza e lançamentos coerentes. Falha forçada numa gravação não deixa reserva parcial. Notificação indisponível não perde a reserva nem duplica registros.

### AUD-010 — N2 — Alto — Resposta iCal inválida pode apagar bloqueios existentes

**Atualização em 17/09/2026:** correção implementada e validada por 24 testes iCal, incluindo SQLite em memória e rollback. O novo parser aceitou os três feeds Airbnb configurados em produção por consulta somente leitura. Ver [registro de continuidade](CONTINUIDADE-2026-09-17.md) para implantação e verificação operacional; os demais achados continuam abertos salvo registro explícito.

**Evidência:** Uma resposta HTTP 200 é interpretada sem validação suficiente do formato. HTML ou conteúdo inválido pode virar uma lista vazia. O código então apaga os bloqueios da origem antes de inserir os novos, sem transação.

**Referências:** [src/lib/ical.ts:29](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/lib/ical.ts:29>); [src/lib/ical.ts:62](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/lib/ical.ts:62>).

**Impacto e condições:** Uma página de erro ou login retornada com HTTP 200 pode liberar datas antes bloqueadas. Falha de inserção também pode deixar o calendário incompleto.

**Correção proposta:** Validar o calendário e os eventos antes de modificar dados e substituir os bloqueios atomicamente, distinguindo calendário vazio válido de resposta inválida.

**Critério de aceite:** HTML, calendário truncado e evento inválido preservam bloqueios. Falha de gravação reverte a substituição inteira. Calendário vazio válido segue uma política explícita.

### AUD-011 — N3 — Médio — Erros TypeScript são ignorados pelo build e não há testes no fluxo CI examinado

**Evidência:** A checagem local retornou 22 diagnósticos. next.config.js usa ignoreBuildErrors: true. O workflow examinado constrói e publica a imagem e chama o deploy, sem uma etapa explícita de typecheck ou testes. package.json não declara script de testes e não foi localizada uma suíte pelos nomes usuais.

**Referências:** [next.config.js:22](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/next.config.js:22>); [.github/workflows/docker-publish.yml:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/.github/workflows/docker-publish.yml:1>); [package.json:6](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/package.json:6>).

**Impacto e condições:** O build pode avançar com incompatibilidades reais já identificadas, como o filtro SQLite e a chamada SMTP. Os 22 diagnósticos não equivalem a 22 incidentes de execução independentes.

**Correção proposta:** Corrigir os diagnósticos, restaurar a checagem de tipos e incorporar testes relevantes dos fluxos críticos ao CI. Não usar a desativação da checagem como validação.

**Critério de aceite:** Typecheck limpo; build e testes relevantes aprovados; erro proposital de tipos e regressão crítica impedem publicação no CI.

### AUD-012 — N3 — Médio — Relatório mensal chama o envio de e-mail com contrato incompatível

**Evidência:** A chamada fornece to, toName, subject e html, mas sendMail requer host, port, user, pass e from. O retorno é Promise<void>, porém a rota testa seu valor como indicador de sucesso.

**Referências:** [src/app/api/cron/owner-report/route.ts:155](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/cron/owner-report/route.ts:155>); [src/lib/email.ts:10](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/lib/email.ts:10>); [src/lib/email.ts:40](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/lib/email.ts:40>).

**Impacto e condições:** O fluxo não fornece a configuração necessária ao envio. Mesmo um envio que retorne normalmente não seria contado como sucesso pela condição atual. Não foi enviado e-mail para validar.

**Correção proposta:** Carregar configuração SMTP conforme o padrão do projeto e alinhar a chamada e a contabilização ao contrato de sendMail.

**Critério de aceite:** Com transporte SMTP simulado, configuração correta é encaminhada; sucesso incrementa ownersSent; falha real é registrada sem falso sucesso. Nenhuma mensagem real é usada como teste.

### AUD-013 — N3 — Médio — Cache da PWA pode preservar respostas privadas após logout

**Evidência:** A regra NetworkFirst abrange todos os GET HTTP(S), inclusive APIs privadas, no mesmo offlineCache. O logout remove token/cookie, mas não limpa CacheStorage. A implementação Workbox instalada mantém respostas elegíveis para fallback offline.

**Referências:** [next.config.js:6](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/next.config.js:6>); [src/hooks/useAuth.ts:33](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/hooks/useAuth.ts:33>); [src/app/api/auth/logout/route.ts:3](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/api/auth/logout/route.ts:3>).

**Impacto e condições:** Com service worker ativo, resposta privada previamente armazenada, mesmo perfil de navegador e falha de rede, dados podem reaparecer após logout ou troca de usuário. Não é acesso remoto ao cache de outro dispositivo.

**Correção proposta:** Excluir APIs privadas do cache, remover caches privados anteriores na atualização e definir a limpeza de sessão.

**Critério de aceite:** Após acessar dados simulados como usuário A, sair, entrar como B e ficar offline, respostas de A não são recuperadas pelo aplicativo.

### AUD-014 — N3 — Médio — Tela de PIX não acompanha confirmação normal do pagamento

**Evidência:** Gerar PIX apenas armazena o QR code na tela. As consultas adicionais de status dependem de parâmetros de retorno de checkout e terminam rapidamente. Não há acompanhamento do PIX gerado no fluxo normal, apesar da mensagem de confirmação automática.

**Referências:** [src/app/(guest)/pagar/[code]/page.tsx:328](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/pagar/[code]/page.tsx:328>); [src/app/(guest)/pagar/[code]/page.tsx:397](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/pagar/[code]/page.tsx:397>); [src/app/(guest)/pagar/[code]/page.tsx:477](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/pagar/[code]/page.tsx:477>).

**Impacto e condições:** O backend pode confirmar enquanto a tela permanece no estado anterior. Isso não comprova falha do recebimento nem cobrança duplicada.

**Correção proposta:** Acompanhar o status até confirmação, expiração ou erro comunicado, encerrando consultas quando adequado.

**Critério de aceite:** Com gateway simulado, a tela muda para pago sem recarga e encerra o acompanhamento. Falhas de consulta têm mensagem e recuperação.

### AUD-015 — N3 — Médio — Falha de disponibilidade pode parecer calendário livre

**Evidência:** Datas ocupadas começam vazias. A carga não verifica res.ok, engole falhas e encerra o carregamento. A submissão não depende de uma disponibilidade válida ter sido obtida.

**Referências:** [src/app/(guest)/imoveis/[slug]/page.tsx:481](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/imoveis/[slug]/page.tsx:481>); [src/app/(guest)/imoveis/[slug]/page.tsx:509](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/imoveis/[slug]/page.tsx:509>); [src/app/(guest)/imoveis/[slug]/page.tsx:914](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/imoveis/[slug]/page.tsx:914>).

**Impacto e condições:** Durante falha de rede ou servidor, datas desconhecidas parecem livres. O usuário pode preencher o pedido e descobrir o problema somente na submissão. É uma falha de apresentação distinta da proteção contra reservas sobrepostas.

**Correção proposta:** Separar os estados de disponibilidade carregada, desconhecida e com erro; oferecer nova tentativa e impedir interpretação de erro como calendário livre.

**Critério de aceite:** Timeout e HTTP 500 mostram erro recuperável; resposta válida reabilita a seleção sem descartar silenciosamente bloqueios.

### AUD-016 — N3 — Médio — Menu Painel e definição da rota raiz são inconsistentes

**Evidência:** O menu Painel aponta para /, o login direciona para /home, src/app/page.tsx declara redirecionamento público para /imoveis e existe também src/app/(dashboard)/page.tsx para a raiz.

**Referências:** [src/app/(dashboard)/layout.tsx:32](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(dashboard)/layout.tsx:32>); [src/app/(auth)/login/page.tsx:31](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(auth)/login/page.tsx:31>); [src/app/page.tsx:4](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/page.tsx:4>); [src/app/(dashboard)/page.tsx:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(dashboard)/page.tsx:1>).

**Impacto e condições:** A intenção do destino do menu é ambígua. Não foi determinado em navegador qual definição vence, nem foi demonstrado que o build falha; o achado é a inconsistência estática de navegação e definição.

**Correção proposta:** Definir um único destino administrativo, alinhar menu e login e eliminar a ambiguidade da raiz após verificar referências.

**Critério de aceite:** Em execução local, login e Painel levam a /home; a raiz leva ao catálogo; um build atualizado tem roteamento sem ambiguidade.

### AUD-017 — N3 — Médio — Noites e diárias cobradas são apresentadas como equivalentes

**Evidência:** A seleção de datas apresenta a diferença entre datas como noites. A regra existente cobra dias de presença, incluindo entrada e saída. A tela de pagamento chama a contagem inclusiva de noites.

**Referências:** [src/components/DateRangePicker.tsx:134](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/components/DateRangePicker.tsx:134>); [src/lib/pricing.ts:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/lib/pricing.ts:1>); [src/app/(guest)/pagar/[code]/page.tsx:717](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/(guest)/pagar/[code]/page.tsx:717>).

**Impacto e condições:** Sexta a domingo pode aparecer como duas noites na busca e três noites no pagamento. O +1 está documentado como regra comercial; não foi classificado como erro matemático.

**Correção proposta:** Usar nomenclatura coerente e explicar diárias cobradas versus noites, preservando a política comercial existente.

**Critério de aceite:** O mesmo intervalo é apresentado consistentemente, por exemplo 2 noites e 3 diárias cobradas. Correção de texto não muda valores ou mínimos de estadia.

### AUD-018 — N3 — Médio — Zoom bloqueado e calendário com barreiras de acessibilidade

**Evidência:** O viewport limita escala e desabilita zoom. O modal de calendário não implementa semântica e gestão de foco completas, fechamento por Escape e nomes acessíveis consistentes nos controles com ícones.

**Referências:** [src/app/layout.tsx:52](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/app/layout.tsx:52>); [src/components/DateRangePicker.tsx:153](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/src/components/DateRangePicker.tsx:153>).

**Impacto e condições:** Dificulta ampliação no celular e operação do calendário por teclado ou leitor de tela. Não foi realizado um teste completo com tecnologias assistivas.

**Correção proposta:** Permitir zoom; implementar diálogo acessível, foco inicial/retorno, navegação de teclado, Escape e nomes acessíveis.

**Critério de aceite:** Fluxo completo por teclado, foco contido no diálogo e devolvido ao acionador, controles anunciados e ampliação disponível no celular.

### AUD-019 — N4 — Baixo — Documentação descreve banco e pendências diferentes do código

**Evidência:** README e resumo técnico mencionam PostgreSQL e integrações ainda pendentes. O schema usa SQLite e o repositório contém sincronização iCal e fluxo de deploy diferentes de partes das instruções antigas.

**Referências:** [README.md:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/README.md:1>); [PROJETO-RESERVAS-ITA.md:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/PROJETO-RESERVAS-ITA.md:1>); [prisma/schema.prisma:6](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/prisma/schema.prisma:6>); [.github/workflows/ical-sync.yml:1](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/.github/workflows/ical-sync.yml:1>).

**Impacto e condições:** Aumenta a chance de instalar, configurar ou retomar o projeto com premissas erradas. Não comprova qual hospedagem ou versão está em produção.

**Correção proposta:** Atualizar documentação a partir do código e da infraestrutura posteriormente verificada, separando estado local, publicado e pendências confirmadas.

**Critério de aceite:** Uma pessoa consegue preparar ambiente isolado com o guia atualizado. Banco e comandos coincidem com o repositório; informações não verificadas são sinalizadas.


## Verificações executadas

- Inspeção de estrutura, fontes, schema, configurações, workflows, histórico recente e estado do Git.
- Comando: `node_modules/.bin/tsc.cmd --noEmit --incremental false --pretty false`.
- Resultado: falha com **22 diagnósticos TypeScript**, em código, seed e um tipo gerado existente em `.next`.
- O filtro `region: { contains: "TESTE", mode: "insensitive" }` foi rejeitado pelo Prisma/SQLite no teste isolado: `Unknown argument mode`. O banco temporário foi removido após o teste.
- Não foi executado novo build nesta auditoria; a presença de um build antigo não comprova que o estado atual passe nas verificações.
- Não foi identificada uma suíte de testes pelos scripts e nomes de arquivos usuais examinados. Isso não prova ausência de testes externos ao repositório.
- As alterações preexistentes em `next-env.d.ts` e `public/sw.js` foram identificadas antes desta etapa e devem ser preservadas.

Distribuição dos 22 diagnósticos:

| Grupo | Quantidade |
|---|---:|
| Seed TypeScript desatualizado | 7 |
| Iteração de Set/Map incompatível com configuração de compilação | 4 |
| Tipagem de autenticação JWT | 3 |
| Chamada/retorno de e-mail do relatório | 2 |
| Valores nulos na configuração de pagamento | 2 |
| Exportação adicional em rota, apontada por tipo gerado | 1 |
| Resposta do contrato com Buffer | 1 |
| Valor nulo no envio relacionado a PIX | 1 |
| Filtro SQLite incompatível na reserva administrativa | 1 |
| **Total** | **22** |

## Ordem de execução

1. **Contenção e fronteiras de acesso:** AUD-001 a AUD-005. Validar a versão efetivamente publicada por meios autorizados e sem explorar dados reais; fechar confirmação forjada, exposição de campos e acesso indevido.
2. **Integridade operacional e financeira:** AUD-006 a AUD-010. Unificar cotações e edição, impedir sobreposição, tornar gravações relacionadas atômicas e preservar bloqueios iCal válidos.
3. **Base de validação:** AUD-011, em paralelo às correções anteriores. Restaurar tipos e implementar testes relevantes para os fluxos corrigidos; não apresentar build com checagem desativada como prova de correção.
4. **Confiabilidade e experiência:** AUD-012 a AUD-018. SMTP, cache privado, acompanhamento PIX, falhas de calendário, navegação, rótulos e acessibilidade.
5. **Documentação atualizada:** AUD-019 e registro de cada versão implantada.

Publicar lotes pequenos e verificáveis conforme a autorização já concedida. Correções urgentes não precisam esperar ajustes cosméticos. Antes de modificar banco persistente, preparar backup e recuperação compatíveis com a mudança; verificar a aplicação após a publicação.

## Decisões preservadas

- O código atual documenta cobrança por dias de presença, incluindo entrada e saída. Não transformar isso em cobrança por noites silenciosamente.
- A autorização do usuário cobre correções, testes, acesso técnico, merge e deploy dentro do projeto, sem confirmações rotineiras. Consulte [AGENTS.md](<C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system/AGENTS.md>).
- A autorização não comprova que todas as conexões externas estejam configuradas. Bloqueios reais de autenticação devem ser descritos com precisão.
- Este relatório não afirma conformidade jurídica, ausência de outras falhas ou ocorrência de incidente. Não houve varredura completa de dependências, teste de carga ou auditoria completa de infraestrutura.
