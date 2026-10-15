ALTER TABLE public.stripe_conversions ADD COLUMN origem_cliente text;
COMMENT ON COLUMN public.stripe_conversions.origem_cliente IS 'Origem do cliente (yampa | 4blue), resolvida por e-mail contra metas_ativos_pagantes_daily; vendas 4blue entram via sync do Metabase.';

UPDATE public.stripe_conversions c
SET origem_cliente = o.origem
FROM (
  SELECT DISTINCT lower(email) AS em, lower(origem_cliente) AS origem
  FROM public.metas_ativos_pagantes_daily
  WHERE email IS NOT NULL AND origem_cliente IS NOT NULL
) o
WHERE lower(c.customer_email) = o.em
  AND c.origem_cliente IS NULL;