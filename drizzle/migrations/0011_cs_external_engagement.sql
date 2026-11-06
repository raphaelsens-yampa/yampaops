ALTER TABLE public.cs_client_enrichment
  ADD COLUMN IF NOT EXISTS engagement_score integer,
  ADD COLUMN IF NOT EXISTS engagement_band text,
  ADD COLUMN IF NOT EXISTS engagement_imported_at timestamptz;

CREATE OR REPLACE FUNCTION public.cs_portfolio_apply_ext_engagement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE e record;
BEGIN
  SELECT engagement_score, engagement_band INTO e
    FROM public.cs_client_enrichment
   WHERE lower(trim(email)) = lower(trim(NEW.email))
     AND (engagement_score IS NOT NULL OR engagement_band IS NOT NULL)
   LIMIT 1;
  IF FOUND THEN
    NEW.engagement_score := coalesce(e.engagement_score, NEW.engagement_score);
    NEW.engagement_band := coalesce(e.engagement_band, NEW.engagement_band);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cs_portfolio_ext_engagement ON public.cs_portfolio;
CREATE TRIGGER trg_cs_portfolio_ext_engagement
  BEFORE INSERT OR UPDATE ON public.cs_portfolio
  FOR EACH ROW EXECUTE FUNCTION public.cs_portfolio_apply_ext_engagement();

CREATE OR REPLACE FUNCTION public.cs_enrichment_push_engagement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.engagement_score IS NOT NULL OR NEW.engagement_band IS NOT NULL THEN
    UPDATE public.cs_portfolio SET updated_at = now()
     WHERE email = lower(trim(NEW.email));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cs_enrichment_push_engagement ON public.cs_client_enrichment;
CREATE TRIGGER trg_cs_enrichment_push_engagement
  AFTER INSERT OR UPDATE ON public.cs_client_enrichment
  FOR EACH ROW EXECUTE FUNCTION public.cs_enrichment_push_engagement();

REVOKE EXECUTE ON FUNCTION public.cs_portfolio_apply_ext_engagement() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cs_enrichment_push_engagement() FROM PUBLIC, anon;