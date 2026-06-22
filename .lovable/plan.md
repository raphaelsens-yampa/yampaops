# Auditar e corrigir conversões "Já contabilizadas"

## Problema

Hoje, na tela **Integrações/Stripe → Diagnosticar emails ausentes**, quando o sistema responde *"Já contabilizado"*, a linha só mostra o badge verde — sem detalhes da conversão e sem ação. Não dá para confirmar se o registro realmente está correto (área, MRR, plano, data) nem ajustar nada quando está errado. As ações de edição/forçar só aparecem para os outros status.

## O que vamos fazer

Tornar o status **`already_counted`** auditável e editável, mantendo todo o resto da tela igual.

### 1. Edge function nova: `stripe-update-conversion`
- Input: `{ conversion_id: uuid, area?, mrr?, plan_name?, product_name?, converted_at?, registered_at?, note? }`.
- Atualiza `stripe_conversions` apenas nos campos enviados.
- Registra em `integration_sync_errors` (`entity_type='stripe_manual_edit'`, `resolved=true`) com `auth.uid()`, o `conversion_id`, o diff (campos antes/depois) e a nota — fica trilha de auditoria igual ao `stripe-force-conversion`.
- Apenas admin (valida JWT em código + `has_role`).

### 2. `stripe-diagnose-emails` (ajuste mínimo)
Já retorna `conversion_id`, `area`, `mrr`, `plan_name`, `product_name`, `converted_at`, `registered_at` para `already_counted`. Acrescentar no payload:
- `stripe_subscription_id`, `stripe_price_id`, `stripe_customer_id` (já buscados; só expor)
- `product_name` / `plan_name` (já vêm)
- além disso, **se houver mais de 1 conversão** para o mesmo email, devolver todas (hoje já faz, mas confirmar que cada uma vira uma linha — já é o comportamento via `flatRows`).

### 3. `EmailDiagnosis.tsx` — coluna "Detalhe" para `already_counted`
Para linhas `already_counted` mostrar bloco rico de detalhe:
- Área (badge), MRR formatado, Plano, Produto
- `converted_at` e `registered_at` formatados em pt-BR
- `subscription_id` / `price_id` / `customer_id` em mono pequeno
- ID da conversão (mono)

E **substituir o "—" da coluna Ação** por dois botões:
- **Ver/Editar** → abre o novo `EditConversionDialog`
- **Abrir em Conversões** → link para `/comissionamento` (ou rota equivalente atual de conversões) com filtro pelo email/conversion_id, para inspeção full

### 4. Componente novo: `EditConversionDialog.tsx`
Espelha o `ForceConversionDialog`, mas:
- Recebe `conversion: { id, email, area, mrr, plan_name, product_name, converted_at, registered_at, subscription_id, price_id, customer_id }`.
- Campos editáveis: Área (Select), MRR, Plano, Produto, `converted_at` (date), `registered_at` (date), Nota (obrigatória — justificativa da edição).
- Mostra somente leitura: email, subscription_id, price_id, customer_id, id da conversão.
- Botão "Salvar alterações" chama `stripe-update-conversion`. Após salvar, `diagnose([email])` re-executa o diagnóstico só desse email para refletir o estado novo.
- Botão secundário "Reverter (excluir conversão)" — opcional, fora do escopo agora; deixar fora para não misturar com o pedido.

### 5. Sem alterações de schema
Tudo cabe em `stripe_conversions` + `integration_sync_errors` já existentes.

## Arquivos

- `supabase/functions/stripe-update-conversion/index.ts` (novo)
- `supabase/functions/stripe-diagnose-emails/index.ts` (expor `stripe_price_id`, `stripe_customer_id`, `stripe_subscription_id` no bloco `already_counted`)
- `src/components/stripe/EditConversionDialog.tsx` (novo)
- `src/components/stripe/EmailDiagnosis.tsx` (detalhe rico + botões de ação no status `already_counted`)

## Fora do escopo

- Mudar layout/colunas da tabela
- Tocar nos outros status (`unmapped_price`, `not_in_stripe`, etc.) — continuam exatamente como estão
- Excluir conversões existentes (apenas editar)
