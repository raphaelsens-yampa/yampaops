DROP POLICY IF EXISTS "Autenticados leem a fotografia mensal" ON public.metas_ativos_pagantes_monthly;

CREATE POLICY "Gestores leem a fotografia mensal"
  ON public.metas_ativos_pagantes_monthly
  FOR SELECT TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()));

CREATE POLICY "Administradores gerenciam a fotografia mensal"
  ON public.metas_ativos_pagantes_monthly
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

ALTER FUNCTION public.close_ativos_pagantes_month(date) SECURITY INVOKER;
ALTER FUNCTION public.apply_commissions_from_metabase(date) SECURITY INVOKER;

REVOKE ALL ON FUNCTION public.close_ativos_pagantes_month(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_ativos_pagantes_month(date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_commissions_from_metabase(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_commissions_from_metabase(date) TO authenticated, service_role;