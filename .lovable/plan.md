# Aba "Cohort D+N" — Freetrial × Primeira Conversa

## Objetivo
Dar visibilidade de quantos contatos da base tiveram a primeira conversa em D0, D1, D2, D3, D4–D7, D8–D14, D15+ ou "Sem contato", medindo o gap entre a criação do Freetrial e a primeira mensagem registrada no Chatwoot.

## Dados disponíveis (sem mudar schema)
- `sales_campaign_contacts.extra->>'Data Freetrial'` — número serial do Excel (ex.: `46142.874...`). Convertido em JS por: `new Date(Math.round((serial - 25569) * 86400 * 1000))`. Aceita também string ISO como fallback.
- `sales_campaign_contacts.cw_first_contact_at` — já populado pelo match com Chatwoot (`first_contact_message_at`).
- Fallback: se `cw_first_contact_at` não existir, usar `last_touch_at`.

Nenhuma migração nova — tudo já está na tabela.

## Nova aba
Adicionar `TabsTrigger value="cohort"` em `src/pages/SalesCampaignDetail.tsx`, ao lado de Evolução, com o título **"Cohort D+N"**.

### Componente `CohortTab`
Renderiza, para a campanha atual:

1. **Cards de resumo**
   - Total da base com Data Freetrial válida
   - % com primeira conversa registrada
   - Mediana de dias até primeiro contato
   - % contatados em D0–D3 (janela "quente")

2. **Tabela de distribuição** (linhas = buckets, colunas = qtd, % da base, MRR gerado nesse bucket)
   ```text
   Bucket        Contatos   % base   Convertidos   MRR
   D0            ...        ...      ...           ...
   D1            ...
   D2
   D3
   D4–D7
   D8–D14
   D15+
   Sem contato
   ```

3. **Gráfico de barras** (Recharts) com a mesma distribuição para leitura rápida.

4. **Filtro** simples: toggle "Considerar apenas contatos com Data Freetrial preenchida" (default on) — evita poluir o "Sem contato" com linhas sem data de origem.

### Lógica de bucket (client-side, em memória)
```ts
function excelToDate(v: unknown): Date | null { /* serial OR ISO */ }
function bucket(daysDiff: number | null): Bucket {
  if (daysDiff === null) return "Sem contato";
  if (daysDiff <= 0) return "D0";
  if (daysDiff === 1) return "D1";
  if (daysDiff === 2) return "D2";
  if (daysDiff === 3) return "D3";
  if (daysDiff <= 7) return "D4–D7";
  if (daysDiff <= 14) return "D8–D14";
  return "D15+";
}
```
- `daysDiff = floor((cw_first_contact_at - dataFreetrial) / 86400000)`.
- Linhas sem `dataFreetrial` são excluídas (a menos que o usuário desligue o filtro).
- Linhas com `dataFreetrial` mas sem `cw_first_contact_at` caem em "Sem contato".

## Detalhes técnicos
- Reaproveita o array de `contacts` já carregado em `SalesCampaignDetail`. Sem queries novas.
- `useMemo` para o agregado.
- Sem alterações em backend, edge functions, migrations ou na aba Evolução.

## Fora de escopo
- Mudar mapeamento de import (continua usando a coluna "Data Freetrial" como está em `extra`).
- Buckets configuráveis pelo usuário (pode virar follow-up).
- Cruzar com IA/Humano dentro do mesmo gráfico (pode entrar como segmento depois).
