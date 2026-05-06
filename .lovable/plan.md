## Objetivo

Adicionar ao relatório de Atendimentos um filtro **"Apenas horário comercial"** (Seg–Sex, 09h–18h) que, quando ativado, descarte conversas abertas fora desse horário, fazendo com que **todas** as métricas (volume, TMA, TM1R, gráficos por dia/agente/equipe/inbox/tabulação e a tabela) recalculem somente sobre o subset filtrado.

## Comportamento

- Novo controle no painel de filtros do relatório, ao lado dos filtros existentes (Status, Agente, Equipe, Inbox, Tabulação, Busca).
- Tipo: **Switch / Checkbox** chamado "Apenas horário comercial (Seg–Sex, 09h–18h)".
- Padrão: **desligado** (mantém comportamento atual).
- Quando ligado:
  - Considera apenas conversas cujo `opened_at` cai em **dia útil (segunda a sexta)** e em **horário entre 09:00 e 18:00** no fuso **America/Sao_Paulo** (mesmo fuso já usado nos timestamps exibidos).
  - O filtro é aplicado **antes** de qualquer cálculo: TMA, TM1R, médias, contagens, top agentes, distribuição por dia, tabulação, inbox e a tabela paginada usam o conjunto filtrado.
  - Conversas sem `opened_at` válido são descartadas quando o filtro estiver ativo.
- O badge/legenda no topo do relatório mostra "Horário comercial" quando o filtro estiver ativo, para deixar claro no PDF/PNG exportados que aquele recorte foi aplicado.

## Onde mexer

- `src/pages/ChatwootReports.tsx`
  - Adicionar estado `businessHoursOnly: boolean` (default `false`).
  - Adicionar helper `isBusinessHours(iso: string | null): boolean` que converte para America/Sao_Paulo e valida dia (1–5) e hora (>=9 e <18).
  - Aplicar o filtro no `useMemo` que monta o dataset base usado por todos os agregados e pela tabela. Como hoje todos os cálculos derivam do mesmo array `rows`, basta filtrar uma vez nesse memo.
  - Renderizar o controle no bloco de filtros existente.
  - Incluir indicação "Horário comercial: Seg–Sex 09–18h" no cabeçalho do PDF e no nome do arquivo exportado quando ativo.

## Detalhes técnicos

- Cálculo do "horário comercial" no client, usando `Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour12: false, weekday: 'short', hour: '2-digit' })` para extrair dia/hora no fuso correto sem depender de libs.
- Janela: `hour >= 9 && hour < 18`, `weekday in {Mon,Tue,Wed,Thu,Fri}`.
- Sem mudanças no backend nem no schema; nada de alterar `tm1r_seconds` no banco.
- Sem alteração nos cron jobs nem nas Edge Functions.

## Fora de escopo

- Configurar horário comercial customizável (feriados, fuso por usuário, etc.).
- Recalcular TMA/TM1R "dentro do expediente" (descontando horas fora do horário comercial dentro de uma mesma conversa). Aqui apenas filtramos conversas abertas fora do horário; a duração em si continua sendo a real.