# Conferência das Recuperações do CS nas Metas Táticas

## O que muda para você
No card **MRR Clientes Recuperados** e no total **MRR no período**, o sistema passa a conferir cada recuperação do CS com a base oficial de clientes que pagam:

- **Recuperação que soma MRR:** o cliente **não estava** na base de clientes ativos pagantes no dia anterior à recuperação. É MRR novo de verdade.
- **Recuperação que só preserva a base:** o cliente **já estava** pagando na base (fatura recusada que foi cobrada). Evitou churn, mas não aumenta o MRR oficial.

Um aviso aparece abaixo do total, por exemplo:
"Declarado pelo CS: R$ 6.118 (27) · Entra no MRR oficial: R$ 1.622 (10) · Já estava na base: R$ 4.496 (17)".

O total **MRR no período** passa a usar só o valor que entra no MRR oficial. O valor declarado continua visível no aviso, e a meta de quantidade de clientes recuperados não muda.

Ao clicar no aviso, abre a lista cliente a cliente, com a situação de cada um.

## Regras
- A base de referência é a foto de clientes ativos pagantes do dia anterior à recuperação. Se esse dia não tiver foto, usa a foto anterior mais próxima.
- O cliente é identificado pelo e-mail, sem diferenciar maiúsculas e minúsculas.
- Recuperações de hoje, ainda sem foto do dia anterior, usam a foto mais recente.
- O filtro de Origem (Yampa/4blue) continua valendo.

## Detalhes técnicos
- Nova função pura `classifyRecoveries(recoveries, snapshotsByDate)` em `src/lib/recoveryReconciliation.ts`. Ela devolve `{ declared, official, preserved, rows }`. Testes usam os números conferidos no chat.
- Os e-mails da base vêm da mesma fonte de clientes ativos pagantes usada na conciliação. As leituras usam `fetchAllPaged` e só os dias necessários.
- `TacticalOverview.tsx` usa o valor `official` em "MRR no período" e mostra o aviso com o diálogo de detalhamento. `MissionToday` segue a mesma regra.
- O TV board só muda se ler o mesmo total. O aviso fica apenas no sistema.
- Registrar a regra em `AGENTS.md` e na memória.
