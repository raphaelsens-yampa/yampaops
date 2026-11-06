DROP TRIGGER IF EXISTS trg_cs_portfolio_ext_engagement ON public.cs_portfolio;
DROP TRIGGER IF EXISTS trg_cs_enrichment_push_engagement ON public.cs_client_enrichment;
DROP FUNCTION IF EXISTS public.cs_portfolio_apply_ext_engagement();
DROP FUNCTION IF EXISTS public.cs_enrichment_push_engagement();
COMMENT ON COLUMN public.cs_client_enrichment.engagement_score IS 'DEPRECATED: usage data lives in cs_product_usage';
COMMENT ON COLUMN public.cs_client_enrichment.engagement_band IS 'DEPRECATED: usage data lives in cs_product_usage';
COMMENT ON COLUMN public.cs_client_enrichment.engagement_imported_at IS 'DEPRECATED: usage data lives in cs_product_usage';

CREATE TABLE public.cs_product_usage (
  company_id text PRIMARY KEY,
  email text,
  plano text,
  segmento text,
  recorrencia text,
  canal text,
  ie numeric,
  tier text,
  pql_score numeric,
  pql_tier text,
  modulos integer,
  usuarios integer,
  pts_a integer,
  pts_b integer,
  pts_c integer,
  ultima_atividade date,
  reference_date date NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  imported_by uuid
);
CREATE INDEX idx_cs_product_usage_email ON public.cs_product_usage (lower(email));
GRANT SELECT ON public.cs_product_usage TO authenticated;
GRANT ALL ON public.cs_product_usage TO service_role;
ALTER TABLE public.cs_product_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs_product_usage read" ON public.cs_product_usage FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.cs_product_usage_import(p_rows jsonb, p_reference_date date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  IF NOT public.is_tatico_or_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN RAISE EXCEPTION 'empty file'; END IF;
  DELETE FROM public.cs_product_usage WHERE company_id IS NOT NULL;
  INSERT INTO public.cs_product_usage (company_id, email, plano, segmento, recorrencia, canal, ie, tier, pql_score, pql_tier,
    modulos, usuarios, pts_a, pts_b, pts_c, ultima_atividade, reference_date, imported_by)
  SELECT DISTINCT ON (r->>'company_id') r->>'company_id', nullif(lower(trim(r->>'email')),''), r->>'plano', r->>'segmento',
    r->>'recorrencia', r->>'canal', (r->>'ie')::numeric, r->>'tier', (r->>'pql_score')::numeric, r->>'pql_tier',
    (r->>'modulos')::integer, (r->>'usuarios')::integer, (r->>'pts_a')::integer, (r->>'pts_b')::integer, (r->>'pts_c')::integer,
    (r->>'ultima_atividade')::date, p_reference_date, auth.uid()
  FROM jsonb_array_elements(p_rows) r
  WHERE coalesce(r->>'company_id','') <> '';
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE EXECUTE ON FUNCTION public.cs_product_usage_import(jsonb, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cs_product_usage_import(jsonb, date) TO authenticated;