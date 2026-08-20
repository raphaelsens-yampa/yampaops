# Classificar em lote os Recuperados/Retidos sem motivo

## Situação atual (verificada no banco)
- `tactical_recoveries`: 99 registros, **91 sem motivo** (34 recuperados, 65 retidos), entre 31/01/2026 e 17/08/2026. Canal já está preenchido em todos (94 CS, 5 Cobrança).
- `tactical_manual_entries` de recuperados/retidos: 1 registro, também sem motivo.
- Há 10 motivos cadastrados e ativos.
- A tabela "Clientes recuperados e retidos" hoje só permite editar **um registro por vez** (`RecoveryEditDialog`). Não existe seleção múltipla nem ação em lote — por isso o painel "Motivos no período" mostra 97 · R$ 18.556 em "Sem motivo declarado".

## O que será entregue

### 1. Filtro rápido de pendências
Chip no topo da tabela: "91 sem motivo" — 1 clique filtra apenas os registros a classificar (combinável com os filtros de tipo/canal/período já existentes).

### 2. Seleção múltipla + ação em lote
- Checkbox por linha e "selecionar todos os visíveis".
- Barra de ação flutuante com a contagem selecionada e o botão "Definir canal/motivo".
- No diálogo em lote: Select de Canal (opcional, mantém o atual se não escolher) e Select de Motivo (filtrado pelo canal), com o botão "Gerenciar motivos" já existente ao lado.
- Gravação por `update ... in (ids)` nas duas tabelas conforme a origem de cada linha; ao final, recarrega tabela e painéis de canal/motivo.
- Reativações automáticas do Stripe (linhas derivadas, sem id próprio) ficam sem checkbox, como hoje.

### 3. Versão mobile
Nos cards, o mesmo checkbox no canto e a mesma barra de ação, para permitir a classificação pelo celular.

### 4. Sem preenchimento automático
Nenhum motivo será adivinhado por regra: a classificação do histórico fica sob controle do usuário. Se preferir, depois posso aplicar um motivo padrão em massa (ex.: tudo que é canal Cobrança → "Cobrança recuperada na retentativa") — diga e faço em um passo separado.

## Detalhes técnicos
- Arquivos: `TeamRecoveriesTable.tsx` (checkboxes, chip de pendência, barra de ação), novo `RecoveryBulkClassifyDialog.tsx`, reaproveitando `useRecoveryReasons`/`reasonsForChannel` de `recoveryChannels.ts` e `ManageReasonsButton.tsx`.
- Sem mudança de schema: `recovery_channel` e `reason_id` já existem em `tactical_recoveries` e `tactical_manual_entries`.
- Recarga: o callback de refresh existente da tabela + incremento da chave usada por `useRecoveryChannelData` em `TacticalTracking.tsx`, para os cards e o ranking refletirem na hora.
