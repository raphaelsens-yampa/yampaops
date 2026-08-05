-- 1) Mapeia o novo price [LETI] Time Financeiro sem BPO Pct 3 Reuniões - Semestral
INSERT INTO public.commission_price_map (price_id, price_name, plan_name, payment_type, area, seller_user_id, seller_label, requires_commission)
SELECT 'price_1TzHwIDrhWjWTprToW0POxwP', '[LETI] Time Financeiro sem BPO Pct 3 Reuniões - Semestral', 'Time Financeiro', 'mensal', 'Sales', '96e1d6ff-0cd6-43bd-aa95-7bf5257ef774'::uuid, 'Leticia Calor', true
WHERE NOT EXISTS (SELECT 1 FROM public.commission_price_map WHERE price_id = 'price_1TzHwIDrhWjWTprToW0POxwP');

-- 2) Preenche seller_user_id nos mapeamentos cujo rótulo é uma pessoa real
UPDATE public.commission_price_map pm
SET seller_user_id = p.user_id, updated_at = now()
FROM public.profiles p
WHERE pm.seller_user_id IS NULL
  AND pm.seller_label IS NOT NULL
  AND lower(btrim(pm.seller_label)) = lower(btrim(p.full_name));

-- 3) Reprocessa a atribuição das conversões sem vendedor conforme o Mapa de Preços
UPDATE public.stripe_conversions sc
SET assigned_seller_id = pm.seller_user_id,
    attribution_source = 'price_map',
    updated_at = now()
FROM public.commission_price_map pm
WHERE pm.price_id = sc.stripe_price_id
  AND pm.seller_user_id IS NOT NULL
  AND sc.assigned_seller_id IS NULL;