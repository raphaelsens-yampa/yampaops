
-- 1) Apagar duplicatas mantendo a linha mais antiga (created_at ASC) por (sub_id, price_id)
WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY stripe_subscription_id, stripe_price_id ORDER BY created_at ASC, id ASC) AS rn
  FROM public.stripe_conversions
  WHERE stripe_subscription_id IS NOT NULL
)
DELETE FROM public.stripe_conversions sc
USING ranked r
WHERE sc.id = r.id AND r.rn > 1;

-- 2) Trocar índice único: remover variante que incluía stripe_event_id (permitia duplicatas)
DROP INDEX IF EXISTS public.stripe_conversions_sub_price_event_uniq;

-- 3) Novo índice único: 1 linha por (assinatura, preço). Reaplicação do mesmo price na mesma sub vira no-op.
CREATE UNIQUE INDEX IF NOT EXISTS stripe_conversions_sub_price_uniq
  ON public.stripe_conversions (stripe_subscription_id, stripe_price_id)
  WHERE stripe_subscription_id IS NOT NULL;
