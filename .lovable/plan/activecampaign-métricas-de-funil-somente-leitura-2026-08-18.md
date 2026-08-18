# ActiveCampaign — Métricas de Funil (somente leitura)

## Diagnóstico do que existe hoje

Verificado agora no projeto e na API do AC:

- Credenciais `AC_API_KEY` / `AC_API_URL` **ativas** (API v3 respondeu 200; 158 etapas na conta).
- As 7 Edge Functions `ac-*` estão **arquivadas** (retornam HTTP 410). Nenhum dado novo do AC entra desde ~19/06/2026 e não existe cron de AC.
- Já existe modelagem parcial reaproveitável: `pipelines` e `pipeline_stages` com `ac_id`, `opportunities` com `ac_id` / `previous_stage` / `ac_stage_changed_at` (3.345 deals antigos importados), e `ac_pipeline_selection` com 43 pipelines listados.
- **Não existe histórico de movimentação de etapa** — só o campo `previous_stage` (último estado). Métrica "de X para Y" exige uma tabela de eventos nova.

## Decisão de arquitetura

Não vamos reativar o sync operacional antigo (que escrevia em `opportunities` e disputava dados com o Stripe). Criamos uma **trilha analítica isolada, somente leitura**, começando pelo pipeline **103 – [Sales] Time Financeiro (Novo)**, com a possibilidade de ligar outros funis depois pela tela.

Sem backfill histórico: as movimentações passam a ser contadas a partir da ativação.

## O que será construído

### 1. Nova base de dados analítica
- `ac_funnels` — funis conectados (id AC, título, ativo, data de ativação, último sync).
- `ac_funnel_stages` — etapas de cada funil (id AC, título, ordem, tipo: aberto / ganho / perdido).
- `ac_funnel_deals` — estado atual de cada deal do funil (contato, e-mail, dono, valor, etapa atual, status, data de criação, data da última movimentação).
- `ac_funnel_stage_events` — o coração da coisa: um registro por movimentação (deal, etapa de origem, etapa de destino, quem moveu, quando, valor no momento). Chave única para ser idempotente.

Todas com RLS e GRANTs; leitura para admin/tático, escrita apenas via backend.

### 2. Ingestão em tempo quase real
- `ac-funnel-webhook` — recebe eventos de deal do AC (add, update, stage change, status change), valida o segredo, atualiza `ac_funnel_deals` e grava o evento de movimentação. Ignora deals de funis não conectados.
- `ac-funnel-sync` — sincronização sob demanda / de segurança: puxa deals e etapas do funil via API v3 por página, com detecção de mudança de etapa para não perder nada caso um webhook falhe. Roda no clique do botão e por cron a cada hora como rede de proteção.

### 3. Tela "Funis ActiveCampaign"
Nova página no menu de Integrações com duas partes:

**Conexão**
- Lista os funis do AC com switch para conectar/desconectar (o 103 já vem conectado).
- Status: último webhook recebido, último sync, contagem de deals e eventos, botão de sincronizar agora e URL do webhook para colar no AC.

**Métricas** (com filtro de período e de funil)
- Cards: contatos/deals abertos no período, total em aberto agora, fechamentos ganhos, fechamentos perdidos, taxa de conversão e valor ganho.
- Funil visual: quantidade e valor parados em cada etapa hoje.
- Matriz de movimentações: linhas = etapa de origem, colunas = etapa de destino, valor = quantidade movida no período (é a visão "de X para Y").
- Série diária de entradas, movimentações e fechamentos.
- Tempo médio por etapa e idade média dos deals abertos.
- Tabela detalhada de deals com link direto para o card no AC, exportável em CSV/XLSX.

Datas sempre em America/Sao_Paulo, como no resto do app.

## O que fica de fora
- Nada é escrito de volta no AC.
- `opportunities`, comissionamento, Metas e o vínculo Chatwoot↔AC não são tocados.
- Sem backfill de histórico anterior à ativação (a API permite depois, via `dealActivities`, se você quiser).

## Detalhes técnicos
- Endpoints usados: `/api/3/dealGroups`, `/api/3/dealStages`, `/api/3/deals` (filtro por `group` e `mdate`), `/api/3/dealActivities` (opcional, futuro backfill).
- Idempotência do evento por `(ac_deal_id, from_stage, to_stage, occurred_at)`.
- Segredo do webhook reutiliza `AC_WEBHOOK_SECRET` (já configurado); as funções antigas arquivadas permanecem como estão.
