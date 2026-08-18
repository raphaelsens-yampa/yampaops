# Nova meta tática: Quantidade de Oportunidades Abertas

Cria uma métrica tática cuja meta é cadastrada normalmente no painel de Metas Táticas, e cujo Realizado vem do ActiveCampaign: negócios que o vendedor moveu da etapa **Backlog** para **Em contato**, por dia.

## Como vai funcionar

- Nova métrica "Oportunidades abertas" (unidade contagem) aparece junto de MRR do dia, Vendas do dia, Recuperados e Retidos — com Missão do Dia, ranking, heatmap, metas semanais e visão Original/Revisada, como as demais.
- Meta cadastrada na aba "Cadastro de Metas" (por vendedor ou por equipe), igual às outras métricas.
- Realizado = quantidade de movimentações Backlog → Em contato no dia, agrupadas pelo proprietário do negócio no ActiveCampaign.
- O par de etapas é configurável na tela de Funis ActiveCampaign (padrão sugerido: Backlog → Em contato do funil "[Sales] Time Financeiro (Novo)").
- Vínculo vendedor: casamento automático por nome (Eduarda Nunes, Leticia Calor batem com os cadastros) mais uma tela simples de mapeamento manual para os proprietários que não casam (hoje "Keila Suelen" e "Ferramentas yampa").
- Histórico: o banco hoje só tem eventos de criação de negócio (nenhuma movimentação de etapa registrada), então o realizado começa a acumular a partir de agora, conforme as movimentações chegam pelo webhook/sincronização. Enquanto não houver movimentações, a métrica mostra 0 com um aviso na tela explicando que a contagem começou nesta data.
- Filtro de origem (Geral / 4blue / Yampa): a métrica vem do ActiveCampaign, base Yampa — aparece em Geral e Yampa, com o mesmo aviso de "sem recorte" já usado em outras métricas quando 4blue for selecionado.

## Detalhes técnicos

Banco (migração):
- `tactical_metrics`: liberar `source = 'ac_stage_move'` no CHECK e inserir a métrica `oportunidades_abertas` (label "Oportunidades abertas", unit `count`, ativa).
- Nova tabela `ac_stage_move_config` (ou colunas em `ac_funnels`) guardando `ac_group_id`, `from_stage_id`, `to_stage_id` do par que conta como oportunidade aberta.
- Nova tabela `ac_owner_seller_map` (`ac_group_id`, `owner_name`, `seller_id` → `profiles.user_id`) com RLS e GRANTs para o mapeamento manual.

Realizado (`useTacticalData.ts` / `useTacticalRealized.ts`):
- Buscar `ac_funnel_stage_events` com `event_type = 'stage_change'`, `from_stage_id`/`to_stage_id` iguais ao par configurado, no período (fuso America/Sao_Paulo).
- Resolver `owner_name` → `seller_id` via mapeamento manual e, na ausência, por nome igual em `profiles.full_name`; eventos sem vendedor resolvido ficam agregados como "Sem vendedor" e listados num aviso, no mesmo padrão do `UnattributedSalesAlert`.
- Alimentar a métrica com `bump(seller_id, metricId, dateKey, 1)`; sem MRR associado (métrica de contagem pura).
- Tratar a métrica como bloqueada para lançamento manual (fonte canônica), como já ocorre com Vendas do dia.

Front-end:
- `TacticalOverview` / `MissionToday` / `TeamScoreboard` / `WeeklyGoalsPanel` / `CategoryWeeklyGoalsPanel`: incluir a nova métrica na lista controlada de métricas táticas.
- `AcFunnelMetrics.tsx`: nova seção "Meta tática" na aba Conexão para escolher o funil e o par de etapas (Backlog → Em contato) e mapear proprietários sem vínculo a vendedores.
- Garantir que o webhook e o sync horário do funil continuem gravando `stage_change` (já implementado) para alimentar o realizado.
