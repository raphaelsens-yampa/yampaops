
-- 1) Tabela
CREATE TABLE IF NOT EXISTS public.stripe_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text,
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,
  customer_email text,
  area text NOT NULL DEFAULT 'desconhecida',
  product_name text,
  plan_name text,
  mrr numeric NOT NULL DEFAULT 0,
  matched_opportunity_id uuid,
  matched_contact_id uuid,
  registered_at timestamptz,
  converted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Idempotência
CREATE UNIQUE INDEX IF NOT EXISTS stripe_conversions_subscription_uniq
  ON public.stripe_conversions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stripe_conversions_event_uniq
  ON public.stripe_conversions (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL AND stripe_subscription_id IS NULL;

CREATE INDEX IF NOT EXISTS stripe_conversions_area_idx ON public.stripe_conversions (area);
CREATE INDEX IF NOT EXISTS stripe_conversions_converted_at_idx ON public.stripe_conversions (converted_at);
CREATE INDEX IF NOT EXISTS stripe_conversions_registered_at_idx ON public.stripe_conversions (registered_at);
CREATE INDEX IF NOT EXISTS stripe_conversions_matched_opp_idx ON public.stripe_conversions (matched_opportunity_id);

-- updated_at
DROP TRIGGER IF EXISTS trg_stripe_conversions_updated_at ON public.stripe_conversions;
CREATE TRIGGER trg_stripe_conversions_updated_at
BEFORE UPDATE ON public.stripe_conversions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) RLS
ALTER TABLE public.stripe_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage stripe_conversions" ON public.stripe_conversions;
CREATE POLICY "Admins manage stripe_conversions"
ON public.stripe_conversions
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Tatico view stripe_conversions" ON public.stripe_conversions;
CREATE POLICY "Tatico view stripe_conversions"
ON public.stripe_conversions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'tatico'::app_role));

-- 3) Backfill a partir de stripe_events
WITH ev AS (
  SELECT
    se.stripe_event_id,
    se.event_type,
    se.matched_opportunity_id,
    -- timestamp do evento
    to_timestamp((se.payload->>'created')::bigint) AS converted_at,
    -- email
    NULLIF(LOWER(TRIM(COALESCE(
      se.payload->'data'->'object'->>'customer_email',
      se.payload->'data'->'object'->'customer_details'->>'email'
    ))), '') AS email,
    -- customer
    COALESCE(
      se.payload->'data'->'object'->>'customer',
      se.payload->'data'->'object'->'customer'->>'id'
    ) AS customer_id,
    -- subscription (varia por evento)
    CASE
      WHEN se.event_type = 'customer.subscription.created'
        THEN se.payload->'data'->'object'->>'id'
      ELSE COALESCE(
        se.payload->'data'->'object'->>'subscription',
        se.payload->'data'->'object'->'subscription'->>'id'
      )
    END AS subscription_id,
    -- price (best-effort: subscription.items[0].price.id ou invoice.lines[0].price.id)
    COALESCE(
      se.payload->'data'->'object'->'items'->'data'->0->'price'->>'id',
      se.payload->'data'->'object'->'lines'->'data'->0->'price'->>'id'
    ) AS price_id
  FROM public.stripe_events se
  WHERE se.event_type IN ('checkout.session.completed','customer.subscription.created','invoice.paid')
),
ranked AS (
  SELECT
    ev.*,
    cp.area  AS cp_area,
    cp.name  AS cp_product,
    cp.plan_name AS cp_plan,
    cp.plan_mrr  AS cp_mrr,
    sp.area  AS sp_area,
    sp.product_name AS sp_product,
    sp.plan_name AS sp_plan,
    sp.mrr   AS sp_mrr,
    c.id AS contact_id,
    c.created_at AS contact_created_at,
    ROW_NUMBER() OVER (
      PARTITION BY COALESCE(ev.subscription_id, ev.stripe_event_id)
      ORDER BY ev.converted_at ASC
    ) AS rn
  FROM ev
  LEFT JOIN public.commission_products cp ON cp.stripe_price_id = ev.price_id
  LEFT JOIN public.stripe_prices sp ON sp.price_id = ev.price_id
  LEFT JOIN LATERAL (
    SELECT id, created_at FROM public.contacts
    WHERE LOWER(email) = ev.email
    ORDER BY created_at ASC
    LIMIT 1
  ) c ON ev.email IS NOT NULL
)
INSERT INTO public.stripe_conversions (
  stripe_event_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
  customer_email, area, product_name, plan_name, mrr,
  matched_opportunity_id, matched_contact_id,
  registered_at, converted_at
)
SELECT
  stripe_event_id, customer_id, subscription_id, price_id,
  email,
  COALESCE(cp_area, sp_area, 'desconhecida') AS area,
  COALESCE(cp_product, sp_product) AS product_name,
  COALESCE(cp_plan, sp_plan) AS plan_name,
  COALESCE(cp_mrr, sp_mrr, 0) AS mrr,
  matched_opportunity_id,
  contact_id,
  COALESCE(contact_created_at, converted_at) AS registered_at,
  converted_at
FROM ranked
WHERE rn = 1
ON CONFLICT DO NOTHING;
