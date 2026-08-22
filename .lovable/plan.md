# Card "% de Crescimento a.m." na aba Acompanhamento Metas

## Objetivo
Na seção de cards do KPI ("Mês vigente") da aba **Acompanhamento Metas**, adicionar um card **"% de Crescimento a.m."** (crescimento mensal realizado do MRR) ao lado do card "% Atingido (vs Meta)", deixando **5 cards em linha** com tamanho legível.

## Onde
`src/components/goals/MetabaseTracking.tsx` — bloco KPI `kpiView === "month"` (linhas ~1421-1449) e seus cálculos auxiliares.

## O que fazer

### 1. Calcular o MRR de cada mês (Total de MRR)
Adicionar um `useMemo` que agrega o realizado de `BASE_MRR_CAT` por mês do ano selecionado, a partir de `scopedAgg` (já respeita recorte de produto/origem):

```
mrrByMonth[idx] = soma de realized_amount das linhas com category_id === BASE_MRR_CAT no mês idx do ano
```

### 2. Derivar o % de crescimento no bloco KPI (dentro do IIFE, junto a `monthRealized`)
```
prevIdx = currentMonthIdx - 1
growthPct = mrrByMonth[prevIdx] > 0
  ? (mrrByMonth[currentMonthIdx] / mrrByMonth[prevIdx] - 1) * 100
  : null        // sem mês anterior coberto → mostra "—"
```

### 3. Renderizar o card
- Label: **"% de Crescimento a.m."**
- Valor: `+1,4%` / `−0,3%` (sinal sempre exibido; vírgula pt-BR)
- Cor: verde se positivo, vermelho se negativo, `text-muted-foreground` se nulo/zero
- Sub-texto de apoio: "Ago R$ X · vs Jul R$ Y" (mês atual vs anterior) para legibilidade
- Posição: imediatamente antes do card "% Atingido (vs Meta)"

### 4. Layout
No bloco `kpiView === "month"`, trocar `lg:grid-cols-4` por **`lg:grid-cols-5`** (comportamento responsivo mantém `grid-cols-2` em telas menores). Ajustar o padding interno dos cards (`p-3 sm:p-4`) se necessário para legibilidade com 5 colunas.

## Escopo / decisões
- Aplica-se **somente à visão "Mês vigente"** (é crescimento mês a mês). A visão "Acumulado do período" já tem 5 cards e não é alterada.
- Crescimento é sempre sobre **Total de MRR** (o que significa "crescimento real"), independente da categoria selecionada no filtro.
- Sem alterações de banco, backend ou outras abas.
