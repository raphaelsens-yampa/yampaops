# Corrigir Visão Geral para refletir a Base após sincronia

## Diagnóstico

Na aba **Visão Geral** (`src/pages/SalesCampaignDetail.tsx` → `OverviewTab`) os KPIs (Contatados, Respostas, Reuniões, Conversões, MRR) são calculados assim:

1. Agrega `sales_campaign_contacts` por status → valores reais da Base.
2. Soma todos os snapshots da aba Evolução.
3. `mergeCampaignProgress` faz `Math.max(base, snapshots)` para cada métrica.

Na campanha atual:
- Base (após sincronia Chatwoot): 73 contatados, 69 respostas, 4 conversões.
- Snapshots manuais: somam 383 contatados, 93 respostas, 2 reuniões, 5 conversões.

Como o snapshot é maior, o `Math.max` faz a Base aparecer "congelada" nos números antigos do snapshot. Por isso a sincronia "não aparece" no dashboard.

## Correção

A sincronia com o Chatwoot agora alimenta a Base de forma confiável (status `contatado`/`respondeu` etc.), então a Base passa a ser a fonte da verdade para os KPIs. Os snapshots continuam servindo para:

- O **gráfico de evolução** (linha do tempo).
- Manter histórico manual quando o usuário quer registrar pontos antes da integração existir.

### Mudanças

1. **`src/pages/SalesCampaignDetail.tsx` (`OverviewTab`)**
   - Remover o uso de `mergeCampaignProgress` para os KPIs.
   - Usar diretamente os agregados de `sales_campaign_contacts` (`contacted`, `replies`, `meetings`, `conversions`, `mrr`).
   - Manter `snapshots` apenas como dado de entrada do `LineChart` de evolução (sem afetar cards).
   - Manter a invalidação por realtime já existente (já cobre updates feitos pela edge function).

2. **Sem mudanças** em `src/lib/salesCampaigns.ts` (a função `mergeCampaignProgress` segue disponível, mas deixa de ser usada na Visão Geral). Se quisermos depois, podemos remover.

3. **Sem mudanças** no edge function de sincronia — já está gravando `status` corretamente.

## Resultado esperado

Após a próxima sincronia (ou imediatamente, ao recarregar), a Visão Geral mostrará os números reais da Base:
- Contatados: 73 (4 convertido + 69 respondeu)
- Respostas: 73
- Conversões: 4
- E os snapshots continuam aparecendo no gráfico de evolução.
