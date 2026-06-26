
-- 1) De-dup: dentro de cada (customer, price, converted_at) mantém o mais antigo (created_at ASC).
WITH ranked AS (
  SELECT id,
         stripe_customer_id,
         stripe_price_id,
         converted_at,
         created_at,
         row_number() OVER (
           PARTITION BY stripe_customer_id, stripe_price_id, converted_at
           ORDER BY created_at ASC, id ASC
         ) AS rn,
         first_value(id) OVER (
           PARTITION BY stripe_customer_id, stripe_price_id, converted_at
           ORDER BY created_at ASC, id ASC
         ) AS keeper_id
  FROM public.stripe_conversions
  WHERE stripe_customer_id IS NOT NULL
    AND stripe_price_id IS NOT NULL
    AND converted_at IS NOT NULL
),
to_delete AS (
  SELECT id, keeper_id FROM ranked WHERE rn > 1
)
-- Redireciona referências de previous_conversion_id para o keeper
UPDATE public.stripe_conversions sc
SET previous_conversion_id = td.keeper_id
FROM to_delete td
WHERE sc.previous_conversion_id = td.id;

-- Agora apaga os duplicados
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY stripe_customer_id, stripe_price_id, converted_at
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.stripe_conversions
  WHERE stripe_customer_id IS NOT NULL
    AND stripe_price_id IS NOT NULL
    AND converted_at IS NOT NULL
)
DELETE FROM public.stripe_conversions sc
USING ranked r
WHERE sc.id = r.id AND r.rn > 1;

-- 2) Índice único parcial para impedir nova duplicidade por (customer, price, converted_at)
CREATE UNIQUE INDEX IF NOT EXISTS stripe_conversions_cust_price_convat_uniq
ON public.stripe_conversions (stripe_customer_id, stripe_price_id, converted_at)
WHERE stripe_customer_id IS NOT NULL
  AND stripe_price_id IS NOT NULL
  AND converted_at IS NOT NULL;
