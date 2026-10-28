# Margem mensal e total na Tabela de Serviços

## Como é calculada hoje
Margem de contribuição (sobre o preço total do contrato):

```text
Margem R$ = Preço total × (1 − impostos − comissão − gateway − churn) − Custo total
Margem %  = Margem R$ ÷ Preço total
```
Os percentuais de dedução vêm das Configurações da Precificação. O valor cinza abaixo do % (ex.: R$ 2.388,59) é a margem em reais do contrato inteiro.

Observação: como o custo total é o custo mensal × meses, o **%** da margem mensal e da total é o mesmo; o que muda é o **valor em R$**.

## O que muda
Trocar a coluna única "Margem" por duas colunas independentes, igual Custo e Mínimo:
- **Margem/mês**: % + valor em R$ por mês (Preço/mês com deduções − Custo/mês).
- **Margem total**: % + valor em R$ do contrato (como hoje).

Cada uma com seu próprio item no botão Colunas, filtro, ordenação e posição arrastável. Quem já tinha "Margem" escondida/posicionada passa a ver "Margem total" no mesmo lugar.

## Detalhes técnicos
- `AnalisePrecosTab.tsx`: substituir chave `margem` por `margem_mes` e `margem_total` em DEFAULT_ORDER, metadados de coluna, TOGGLE_COLS, sort/filter e render; margem mensal = `calcMC(eff.preco_mes, p.custo / meses, config)`.
- Migrar preferências salvas (ordem/ocultas) mapeando `margem` → `margem_total` e inserindo `margem_mes` ao lado.
- Teste em `src/test` validando que margem mensal × meses = margem total em R$ e que os % coincidem.
