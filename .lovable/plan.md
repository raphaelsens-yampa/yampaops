# Casar Meta × Realizado — aba Dados Metabase

Hoje o gráfico soma **Meta** de todas as `goals` que interceptam o ano e **Realizado** de tudo em `metabase_monthly_agg` do ano. Os filtros de topo (Período, Escopo, Categoria, Equipe, Vendedor, Campanha) já filtram os dois lados, mas há dois desalinhamentos que causam distorção:

1. O filtro **Período** (Dia/Semana/Mês/Personalizado) hoje não recorta nada — só o Ano é aplicado.
2. Metas cobrem intervalos (ex.: Jul→Dez) e são rateadas por mês; se o Metabase ainda só enviou Julho, o gráfico compara "Realizado só de Julho" com "Meta rateada de vários meses", parecendo baixo/alto sem razão.

## O que muda

### 1. Recorte de período efetivo

- Traduzir o filtro **Período** em uma janela `[from, to]`:
  - `day` = hoje; `week` = semana corrente (seg–dom); `month` = mês corrente; `custom` = `customFrom`/`customTo`; padrão = ano inteiro.
- **Realizado**: somar apenas linhas de `metabase_monthly_agg` cujo `year_month` cai no intervalo.
- **Meta**: usar `monthsIntersect` contra a janela selecionada (não o ano inteiro), rateando proporcionalmente pelos dias sobrepostos.
- Aplicar o mesmo recorte ao gráfico, aos KPIs e à tabela pivot.

### 2. Modo de comparação do gráfico

Adicionar um seletor **"Comparar até"** com duas opções:

- **Até hoje (padrão)** — só considera meses/dias com dados de realizado já capturados. Meta é rateada só até o último `year_month` presente em `metabase_monthly_agg` (ou até hoje, o que for menor). Evita o efeito "meta cheia × realizado parcial".
- **Período completo** — comportamento atual (meta cheia do intervalo).

Nos cards KPI, mostrar dois selos pequenos: "Janela: Jul/26" e "Base: Metabase até 27/07".

### 3. Aviso de cobertura de dados

Abaixo dos filtros, um badge discreto:

- "Última captura Metabase: {max(capture_date)} — meses cobertos: Jul/26" (lido de `metabase_daily_raw` / `metabase_monthly_agg`).
- Se algum mês do intervalo selecionado não tiver captura, mostrar aviso: "Meses sem dados no Metabase: Ago, Set — comparação parcial".

### 4. Coerência de dimensões Meta × Realizado

Uma meta com `scope=user` e `user_id=X` só deve casar com linhas de realizado com o **mesmo** `scope`/`user_id`. Já é o caso hoje via `scopedFilter`, mas confirmar comportamento para metas de escopo `company` (sem team/user) versus realizado que vem detalhado por vendedor:

- Regra: quando `scope=all` no filtro, agregar tudo — ok.
- Quando o usuário escolhe **Escopo=Empresa**, somar realizado independentemente de `team_id`/`user_id` (o total "rola pra cima").
- Documentar essa regra num tooltip no seletor de Escopo.

## Detalhes técnicos

Arquivo único: `src/components/goals/MetabaseTracking.tsx`.

- Criar `windowRange = useMemo(...)` retornando `{ from: Date, to: Date }` conforme `period`.
- Substituir o filtro `d.getFullYear() !== year` em `realizedByCatMonth` por check contra `windowRange`.
- Em `targetByCatMonth`, chamar `monthsIntersect(g.period_start, g.period_end, windowRange.from, windowRange.to)` além do rateio mensal — a fração final por mês vira `frac_mes × frac_janela_do_mes`.
- Novo estado `compareMode: "to_date" | "full"`; quando `to_date`, cap superior da janela = `min(windowRange.to, maxCaptureDate)`.
- Query auxiliar: `select max(capture_date) from metabase_daily_raw` para o badge.
- Manter a tabela pivot mostrando os 12 meses do ano (visão anual continua útil), mas destacar em fundo `muted/30` os meses fora da janela ativa.

## Fora do escopo

- Rewriting de como o agente Claude ingere dados.
- Mudanças em `goals`/`goal_categories`.
- Export XLSX (posso adicionar depois).

## Perguntas rápidas (posso assumir defaults)

- Default de "Comparar até": **Até hoje**. Ok? Ok
- Quando `Período=Dia` ou `Semana`, faz sentido comparar contra meta rateada por dias? Faz sentido, vamos ver como fica 