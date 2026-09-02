# Engajamento CS — integração com o app do Google Apps Script

O link enviado está restrito ao login Google do domínio yampa.com.br: uma chamada do servidor é redirecionada para a tela de login, então hoje a aplicação não consegue ler esses dados. O plano abaixo resolve o acesso e cria a seção.

## O que você precisa fazer (uma vez)

No Apps Script, reimplantar o Web App com:
- Executar como: eu (seu usuário)
- Quem pode acessar: qualquer pessoa (com a URL)

E adicionar uma verificação simples de token no `doGet(e)`:

```text
if (e.parameter.token !== 'SEGREDO') return ContentService.createTextOutput('unauthorized');
```

Depois me envie a nova URL `/exec` e o token. Guardo o token como segredo do backend (nunca no frontend).

Se preferir não abrir o Web App, a alternativa é o script empurrar os dados (POST diário) para uma função do backend — o restante do plano continua igual.

## Etapa 1 — Descobrir o formato dos dados

Com a URL liberada, faço uma chamada de inspeção e mapeio os campos reais retornados (colunas, tipos, granularidade: por cliente, por CS, por dia). O modelo de tabela abaixo é ajustado ao que vier de fato.

## Etapa 2 — Backend

- Segredos: `CS_ENGAGEMENT_URL` e `CS_ENGAGEMENT_TOKEN`.
- Edge function `cs-engagement-sync`: busca o JSON, normaliza e faz upsert.
- Tabela `cs_engagement` (schema final definido na Etapa 1), com colunas previstas: `id`, `ref_date`, `cliente`, `email`, `cs_owner`, `ultimo_contato`, `interacoes`, `score`, `status`, `raw` (jsonb), `synced_at`. RLS habilitada + GRANTs (leitura para usuários autenticados, escrita apenas service_role).
- Tabela `cs_engagement_sync_log` para status/erros da última sincronização.
- Cron diário (07:00 America/Sao_Paulo) + botão "Atualizar agora" na tela.

## Etapa 3 — Tela "Engajamento CS"

Nova página `src/pages/CsEngagement.tsx`, rota `/cs-engagement`, item no sidebar dentro do grupo CX, seguindo o padrão visual das telas atuais (tokens do design system, PT-BR, timezone São Paulo).

Conteúdo:
- Filtros: período, responsável CS, status/segmento.
- KPIs: clientes acompanhados, engajados no período, sem contato há X dias, score médio.
- Gráfico de evolução diária/semanal do engajamento.
- Ranking por responsável CS.
- Tabela detalhada com busca, ordenação, paginação (`fetchAllPaged`) e exportação CSV/XLSX.
- Painel de status da sincronização (última execução, registros, erros).

## Detalhes técnicos

- Consultas seguem o guardrail de paginação já existente no projeto.
- Chave de acesso na tela de Gestão de Nível de Acessos (`cs_engagement`), para controlar quem vê a seção.
- Datas normalizadas para `America/Sao_Paulo`.
