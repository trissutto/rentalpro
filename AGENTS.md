# Regras de trabalho — Reservas Ita

## Escopo e continuidade

Projeto principal: `C:/Users/User/Documents/Claude/Projects/RESERVAS ITA/rental-system`.

O diretório da tarefa no Codex pode ser `C:/Users/User/Documents/ChatGPT/RESERVAS ITA`. Ele é um ponto de entrada; editar e executar comandos do aplicativo no repositório principal. Não criar uma cópia concorrente do sistema por engano.

Stack verificada no código: Next.js 14, React 18, TypeScript, Prisma e **SQLite**. Documentação antiga que descreve PostgreSQL não substitui o schema efetivo.

A auditoria inicial está em [docs/AUDITORIA-2026-09-17.md](docs/AUDITORIA-2026-09-17.md). Consultar os achados e registrar a verificação de cada correção; não assumir que um item está resolvido apenas porque um arquivo mudou.

## Autorização do usuário

Em 17/09/2026, o usuário determinou: “você faz tudo sem perguntar”, incluindo “deploy, merge, acessos, tudo”, dentro da continuidade deste projeto.

- Conduzir autonomamente leitura, edição, correções, testes, branches, commits, resolução de conflitos, merge, push, configuração e deploy necessários ao trabalho solicitado.
- Usar acessos e credenciais já disponíveis pelos mecanismos autorizados. Não pedir nova confirmação para uma ação rotineira já incluída nessa autorização.
- Preparar a alteração, validar o resultado, executar a publicação quando fizer parte da etapa e verificar seu funcionamento.
- A autorização ampla não muda o objetivo da etapa. Um pedido de auditoria e classificação produz auditoria e classificação; não exige disparar um deploy só porque o deploy está autorizado.
- Tomar decisões técnicas usuais com base no código, documentação e intenção do usuário. Explicar decisões relevantes e manter atualizações curtas em português.
- Se faltar informação essencial impossível de inferir ou um acesso realmente não estiver disponível, informar exatamente o bloqueio e prosseguir com o trabalho independente. Não inventar acesso nem contornar autenticação ou restrições de ferramentas. Não solicitar que o usuário cole segredos na conversa.
- Não tratar a preferência por autonomia como uma ordem para omitir erros, riscos concretos ou resultados de validação.

## Preservação do projeto e dos dados

- Antes de editar, ler o estado do Git e preservar alterações preexistentes. Na auditoria inicial estavam modificados `next-env.d.ts` e `public/sw.js`; não reverter ou incluir esses arquivos em commits automaticamente.
- Criar branches com prefixo `codex/` quando útil para isolar trabalho. Verificar o diff e incluir somente arquivos pertencentes à alteração.
- Evitar operações destrutivas quando houver alternativa reversível. Antes de alterar dados persistentes ou schema em produção, fazer backup verificável e preparar recuperação compatível com a mudança.
- Nunca usar seed de demonstração, limpeza de dados ou substituição de banco como método de testar produção.
- Não exibir nem versionar segredos, arquivos de ambiente, bancos, documentos de hóspedes ou comprovantes. Para diagnóstico, preferir estrutura e metadados sem conteúdo pessoal.
- Testar pagamentos, e-mails e WhatsApp com simulações ou ambientes de teste. A autorização de desenvolvimento e deploy não é uma solicitação de disparar mensagens a hóspedes/proprietários nem cobranças reais como teste.

## Regras funcionais e técnicas

- Preservar a política comercial documentada: diárias por dias de presença, incluindo entrada e saída, até uma instrução explícita de mudança. Diferenciar claramente noites e diárias na interface.
- Usar uma fonte de cálculo no servidor para cotação, criação e alterações que realmente afetem preço. Correções de nome, telefone e observações devem preservar valores.
- Manter cálculo consistente de limpeza, comissão, adicionais e repasse; validar arredondamento e totais. Evitar fórmulas independentes em cada tela ou gateway.
- Exigir autorização por perfil e por imóvel/reserva no servidor. Ocultar um botão não substitui controle de acesso.
- Entregar explicitamente apenas campos públicos nas APIs públicas. Separar identificador comercial de credencial de acesso.
- Confirmar pagamentos somente a partir de evidência autenticada e validada no gateway, conferindo referência, valor e estado. Processar repetições sem duplicar receita ou confirmar estados incompatíveis.
- Garantir disponibilidade de forma consistente nas transições de reserva e pagamento, incluindo retenção, expiração e pagamento tardio.
- Usar transações para gravações relacionadas. Notificações externas não devem deixar reserva parcialmente gravada.
- Validar calendários importados antes de substituir bloqueios e preservar o estado anterior se a importação falhar.
- Não tratar erro de API como lista vazia, calendário livre ou operação concluída. Mostrar erro recuperável quando necessário.
- Excluir APIs privadas do cache compartilhado da PWA e impedir reaproveitamento de dados de outra sessão.

## Validação, merge e deploy

- Priorizar N1, depois N2, respeitando dependências. Corrigir a causa e adicionar testes relevantes de regressão para segurança, preços, disponibilidade e integridade.
- Para alterações de baixo impacto e documentação, usar verificação proporcional; não criar testes que apenas repitam a implementação.
- Executar typecheck, testes aplicáveis e build para mudanças de código. `ignoreBuildErrors` não constitui evidência de sucesso. Distinguir falhas preexistentes das introduzidas e registrar o que foi realmente validado.
- O workflow atual dispara publicação ao receber push em `main`. Tratar merge/push nessa branch como ação que pode publicar, verificando antes o destino e as condições do deploy.
- Preferir lotes pequenos e recuperáveis. Preservar banco e uploads na publicação; não presumir ambiente de hospedagem apenas pelo README.
- Verificar a versão implantada e os fluxos afetados depois do deploy. Se houver regressão, conduzir correção ou recuperação dentro da autorização concedida e comunicar o resultado.
- Não declarar “publicado”, “corrigido”, “testado” ou “seguro” sem evidência compatível. Distinguir análise estática, teste local, integração simulada e produção.
- Não esperar que todos os ajustes visuais estejam concluídos para publicar uma correção crítica já validada.

## Comunicação e registro

- Responder em português e manter o usuário informado sobre resultado, impacto, validação e bloqueios concretos.
- Não repetir pedidos de autorização já concedida para merge, deploy ou acessos técnicos deste projeto.
- Registrar achados por ID, gravidade, evidência, impacto, correção e critério de aceite. Atualizar o estado quando a correção for verificada.
- Não apresentar suspeitas como incidentes comprovados. As falhas da auditoria inicial foram identificadas no código local; a versão publicada ainda precisava ser verificada nessa etapa.
