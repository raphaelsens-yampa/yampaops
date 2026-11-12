ALTER TABLE public.cs_portfolio ADD COLUMN IF NOT EXISTS churned_at timestamptz;
UPDATE public.cs_portfolio SET churned_at = updated_at WHERE NOT is_active AND churned_at IS NULL;
CREATE OR REPLACE FUNCTION public.cs_portfolio_track_churn() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_active THEN NEW.churned_at := NULL;
  ELSIF OLD.is_active IS DISTINCT FROM NEW.is_active OR NEW.churned_at IS NULL THEN NEW.churned_at := coalesce(NEW.churned_at, now());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_cs_portfolio_track_churn ON public.cs_portfolio;
CREATE TRIGGER trg_cs_portfolio_track_churn BEFORE UPDATE OF is_active ON public.cs_portfolio FOR EACH ROW EXECUTE FUNCTION public.cs_portfolio_track_churn();
CREATE INDEX IF NOT EXISTS cs_portfolio_active_idx ON public.cs_portfolio (is_active, email);