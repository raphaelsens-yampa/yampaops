UPDATE public.stripe_conversions sc
SET assigned_seller_id = m.seller_user_id,
    attribution_source = 'price_map'
FROM public.commission_price_map m
WHERE m.price_id = sc.stripe_price_id
  AND m.seller_user_id IS NOT NULL
  AND sc.assigned_seller_id IS NULL;