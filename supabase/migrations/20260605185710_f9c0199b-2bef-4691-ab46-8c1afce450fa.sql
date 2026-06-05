
CREATE TABLE public.precificacao_insumos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('item', 'subproduto')),
  custo_minuto numeric,
  custo_acao numeric,
  qntde_minutos numeric,
  valor_insumo numeric,
  source_file text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, nome)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.precificacao_insumos TO authenticated;
GRANT ALL ON public.precificacao_insumos TO service_role;

ALTER TABLE public.precificacao_insumos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view insumos"
  ON public.precificacao_insumos FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admin/Tatico manage insumos"
  ON public.precificacao_insumos FOR ALL
  TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));

CREATE TRIGGER trg_precificacao_insumos_updated_at
  BEFORE UPDATE ON public.precificacao_insumos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
