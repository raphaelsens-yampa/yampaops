## Problema

Hoje o painel soma:
- Métricas derivadas da Base (status dos contatos individuais) **+**
- Totais informados em lote nos snapshots de Evolução

Quando o usuário atualiza tudo via Evolução (lote, sem marcar IA/Humano contato a contato), os dois conjuntos representam a **mesma população**, então a soma estoura — por isso "Contatados (1541) > Base (1136)" e o percentual passa de 100%.

## Solução

Trocar a soma por **Math.max(derivadoDaBase, totalDeSnapshots)** em todos os agregados do `OverviewTab`. Mesma filosofia já usada em `mergeCampaignProgress`. Snapshots passam a representar um "piso" da realidade, não um delta somado.

### Onde mudar (apenas `src/pages/SalesCampaignDetail.tsx`, `OverviewTab`)

1. **Cards principais (linhas ~181–186)**  
   Substituir `a.contacted + snapTotals.contacted` (e equivalentes para replies, meetings, conversions, mrr) por `Math.max(a.contacted, snapTotals.contacted)`. Idem para os demais campos.

2. **Buckets IA × Humano (linhas ~161–173)**  
   Hoje o loop de snapshots faz `b.x += snapshot.x` em cima do que já veio da Base. Em vez disso:
   - Acumular separadamente os totais de snapshots por bucket (`iaSnap`, `humanSnap`) — `mixed` continua contribuindo para os dois.
   - Depois do loop, fazer para cada métrica do bucket:  
     `ia.contacted = Math.max(ia.contacted, iaSnap.contacted)` (idem replies/meetings/conversions/mrr/count, onde `count` usa `iaSnap.contacted`).

3. **Cap defensivo**  
   Manter `Math.min(100, ...)` nos percentuais que usam a base como denominador, como rede de segurança caso alguém ainda informe um snapshot maior que a base.

### Fora de escopo

- Sem mudanças de schema, sem mudanças na aba Evolução, sem mudanças na aba Base.
- Sem mudanças visuais — apenas os números recalculados.

### Efeito esperado no print

Com Base=1136 e snapshots de contatados acumulados em 1541, o card "Contatados" passará a exibir **1136** (max entre derivado-da-base e snapshot), e o percentual ficará em **100% da base** — eliminando o 135,7%.
