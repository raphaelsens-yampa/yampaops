CREATE TABLE public.stripe_bpo_mrr_runs (
  data date PRIMARY KEY,
  base_mrr numeric NOT NULL,
  base_ativos integer NOT NULL,
  added_mrr numeric NOT NULL DEFAULT 0,
  added_ativos integer NOT NULL DEFAULT 0,
  written_mrr numeric NOT NULL,
  written_ativos integer NOT NULL,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stripe_bpo_mrr_runs TO authenticated;
GRANT ALL ON public.stripe_bpo_mrr_runs TO service_role;
ALTER TABLE public.stripe_bpo_mrr_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Internal users read bpo runs" ON public.stripe_bpo_mrr_runs FOR SELECT TO authenticated USING (public.is_internal_user(auth.uid()));
INSERT INTO public.stripe_bpo_mrr_runs (data, base_mrr, base_ativos, added_mrr, added_ativos, written_mrr, written_ativos)
VALUES ('2026-11-16', 327025.77, 2105, 2493.90, 7, 329519.67, 2112);