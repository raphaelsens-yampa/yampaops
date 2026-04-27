-- Mantém apenas a primeira conversão (menor converted_at) por stripe_subscription_id
DELETE FROM public.stripe_conversions sc
USING (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY stripe_subscription_id
             ORDER BY converted_at ASC, created_at ASC
           ) AS rn
    FROM public.stripe_conversions
    WHERE stripe_subscription_id IS NOT NULL
  ) ranked
  WHERE ranked.rn > 1
) dups
WHERE sc.id = dups.id;