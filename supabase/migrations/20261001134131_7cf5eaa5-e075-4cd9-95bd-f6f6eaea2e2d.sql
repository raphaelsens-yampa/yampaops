-- A coluna seller_id de commercial_plan_quotas recebia valores de vendedores
-- sem registro em profiles (apontados apenas por conversões do Stripe), o que
-- violava a FK e impedia o salvamento das quotas. A FK é removida para permitir
-- quotas por qualquer vendedor de vendas atribuídas.
ALTER TABLE public.commercial_plan_quotas DROP CONSTRAINT commercial_plan_quotas_seller_id_fkey;