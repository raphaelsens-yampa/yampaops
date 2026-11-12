# Quantidade de vendas no painel New MRR (Metas Operacionais)

## O que muda
No card "Time de Vendas · New MRR", abaixo dos valores em R$, entra uma linha **"Vendas (qtd)"** com Meta e Realizado em número inteiro, para Mês, Semana e Dia selecionado. Vale também para o link da TV.

```text
MÊS     Meta R$ 32.247        Realizado R$ 2.416
        Vendas: meta 120      realizado 9   (7,5%)
SEMANA  Meta R$ 7.678 · 28 vendas    Realizado R$ 2.569 · 10 vendas
DIA     Meta R$ 1.536 · 6 vendas     Realizado R$ 0 · 0 vendas
```

## De onde vêm os números
- **Meta:** a meta tática "Vendas do dia" já cadastrada, somada pelos dias úteis do mês/semana (mesma regra das Metas Táticas). Se não houver meta cadastrada, mostra "—".
- **Realizado:** mesma contagem do "Vendas no Período" das Metas Táticas — vendas novas com pagamento confirmado na Stripe (incluindo low-touch) + Recuperados FT. Upsell não conta como venda.
- Respeita o filtro de Origem (Yampa/4blue) igual às Metas Táticas.
- Quantidade sempre inteira, arredondamento .5 para cima.

## Detalhes técnicos
- `OperationalGoals.tsx`: buscar `tactical_goals` da métrica `vendas_dia` e contar conversões `new` pagas + recuperados FT do mês (via `fetchAllPaged`), agregando por dia; reaproveitar helpers de dia útil já usados nas Táticas.
- Extrair a soma meta/realizado por mês/semana/dia num helper puro com teste (contagem, dias úteis, arredondamento).
- Só aparece na área Sales; área CS inalterada.
