# Tarefas na Carteira de CS

## O que o usuário vai ter
- Nova aba **Tarefas** na Carteira de CS (ao lado de Fila do dia).
- Criar tarefa ligada a um cliente: título, descrição, tipo (Ligação, WhatsApp, E-mail, Reunião, Follow-up, Outro), prioridade (Baixa/Média/Alta), data e hora agendada, responsável (padrão: quem cria).
- Status: Pendente, Em andamento, Concluída, Cancelada. Concluir com um clique registra data de conclusão.
- Lista com filtros: Minhas / Todas (admin vê todas), status, período (Atrasadas, Hoje, Próximos 7 dias, Todas), cliente, prioridade. Atrasadas em destaque vermelho.
- Contadores no topo: Atrasadas, Hoje, Próximos 7 dias, Concluídas no mês.
- No cadastro 360 do cliente: bloco "Tarefas" com as tarefas daquele cliente e botão "Nova tarefa". Botão "Criar tarefa" também na linha da Carteira e na Fila do dia.
- Editar, reagendar e excluir (autor, responsável ou admin).

## Regras de acesso
- Usuários internos veem e criam tarefas; cada um edita as suas (criadas ou atribuídas); admin edita todas.

## Detalhes técnicos
- Tabela `cs_tasks` (client_email normalizado, portfolio_id opcional, title, description, task_type, priority, status, due_at timestamptz, completed_at, assigned_to uuid, created_by uuid, timestamps), grants + RLS via `is_internal_user` / `has_role(admin)`, trigger `update_updated_at_column`, índices por assigned_to+due_at e client_email.
- Helper puro `src/lib/csTasks.ts` (classificação atrasada/hoje/semana em fuso São Paulo, filtros, contadores) com testes.
- Hook `useCsTasks.ts` (react-query, invalidação após salvar), componentes `TasksTab.tsx`, `TaskDialog.tsx`, `ClientTasksBlock.tsx` em `cs-portfolio/`; integração em `CsPortfolio.tsx` e `ClientDrawer360.tsx`.
- Fora do escopo: notificações por e-mail/lembretes automáticos e tarefas recorrentes.
