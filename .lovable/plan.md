# Cards de Crescimento a.m. em linha solo na aba Acompanhamento Metas

## Objetivo
Na visão **"Mês vigente"** da aba Acompanhamento Metas, tirar o card "% de Crescimento a.m." da linha de 5 cards e colocá-lo numa **linha própria no topo**, em formato duplo: **crescimento de MRR** e **crescimento de Usuários Ativos Pagantes** (estoque), fixos e sempre visíveis.

Abaixo dessa linha, **volta a linha de 4 cards** que variam com a categoria filtrada (Meta do Mês, Realizado do Mês, Excedente da Meta, % Atingido).

## Onde
`src/components/goals/MetabaseTracking.tsx` — bloco KPI `kpiView === "month"` (linhas ~1440-1483) e seus cálculos/memos auxiliares.

## O que fazer

### 1. Novo memo `ativosByMonth` (linha ~978, após `mrrByMonth`)
Espelhar `mrrByMonth`, mas filtrando por `BASE_ACTIVE_CAT` (Ativos Pagantes):
```
ativosByMonth[idx] = soma de realized_amount das linhas com category_id === BASE_ACTIVE_CAT no mês idx do ano
```
O `scopedAgg` já remapeia as linhas do 2.0 para as categorias base, então o recorte de produto/origem é respeitado da mesma forma que o MRR.

### 2. Cálculo do crescimento de Ativos no bloco KPI (junto a `growthPct`, linha ~1361)
```
curAtivos  = ativosByMonth[currentMonthIdx] || 0
prevAtivos = ativosByMonth[prevMonthIdx] || 0
growthPctAtivos = prevAtivos > 0 ? (curAtivos / prevAtivos - 1) * 100 : null
```

### 3. Renderizar a linha solo de crescimento (antes da linha de 4 cards)
Nova `<div className="grid grid-cols-2 gap-2 sm:gap-3">` com 2 cards:
- **"% de Crescimento MRR a.m."** — mesmo conteúdo do card atual de MRR: valor `+1,8%`/`−0,3%` (sinal sempre exibido, verde/vermelho/cinza), sub-texto "Ago R$ X · vs Jul R$ Y".
- **"% de Crescimento Ativos Pagantes a.m."** — valor `+2,1%`/`−0,4%` com mesma lógica de cor; sub-texto **sem** "R$": "Ago 1.234 · vs Jul 1.200" (contagem com `toLocaleString("pt-BR")`).
- Ambos exibem **"—"** (cinza) quando não há mês anterior coberto ou valor zero.

Ambos são sempre sobre **estoque total** (Total de MRR e Ativos Pagantes), independentes da categoria selecionada no filtro.

### 4. Linha dos 4 cards variáveis
Trocar a grid atual de 5 cards de volta para **`lg:grid-cols-4`** (mantém `grid-cols-2` em telas menores), removendo o card "% de Crescimento a.m." que migrou para a linha solo. Ficam: Meta do Mês, Realizado do Mês, Excedente da Meta, % Atingido.

## Escopo / decisões
- Aplica-se somente à visão **"Mês vigente"** (crescimento é mês a mês). A visão "Acumulado do período" permanece inalterada com seus cards atuais.
- A linha solo é fixa: sempre mostra crescimento de MRR e de Ativos Pagantes, independente do filtro de categoria.
- Sem alterações de banco, backend ou outras abas.
