CREATE OR REPLACE FUNCTION public.fill_snapshot_gaps(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_min date;
  v_max date;
  d date;
  v_prev date;
  v_inserted int := 0;
  v_days text[] := ARRAY[]::text[];
  v_n int;
BEGIN
  SELECT COALESCE(p_from, MIN(data)), COALESCE(p_to, GREATEST(MAX(data), CURRENT_DATE - 1))
    INTO v_min, v_max
  FROM public.metas_snapshot_diario;

  IF v_min IS NULL THEN
    RETURN jsonb_build_object('inserted', 0, 'days', v_days);
  END IF;

  d := v_min;
  WHILE d <= v_max LOOP
    IF NOT EXISTS (SELECT 1 FROM public.metas_snapshot_diario WHERE data = d) THEN
      SELECT MAX(data) INTO v_prev FROM public.metas_snapshot_diario WHERE data < d;
      IF v_prev IS NOT NULL THEN
        INSERT INTO public.metas_snapshot_diario (
          data, data_execucao, mes_ref, year_month, metric_key, scope, category_id,
          area, realized_amount, deals_count, tipo_snapshot, origem_leitura, fonte,
          coletado_em, origem_cliente
        )
        SELECT d, d + 1, mes_ref, year_month, metric_key, scope, category_id,
               area, realized_amount, deals_count, 'carry_forward',
               'carry_forward_dia_anterior',
               'replicado de ' || to_char(v_prev, 'DD/MM/YYYY') || ' (sem captura no dia)',
               now(), origem_cliente
        FROM public.metas_snapshot_diario
        WHERE data = v_prev;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        v_inserted := v_inserted + v_n;
        v_days := array_append(v_days, to_char(d, 'YYYY-MM-DD'));
      END IF;
    END IF;
    d := d + 1;
  END LOOP;

  RETURN jsonb_build_object('inserted', v_inserted, 'days', v_days);
END;
$$;

SELECT public.fill_snapshot_gaps('2026-07-25'::date, (CURRENT_DATE - 1));