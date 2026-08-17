-- Remove carry-forward histórico indevido: antes de 26/07/2026 só existiam
-- fechamentos mensais, então replicar dia a dia distorce o histórico.
DELETE FROM public.metas_snapshot_diario
WHERE tipo_snapshot = 'carry_forward'
  AND data < DATE '2026-07-26';

-- Passa a preencher lacunas apenas dentro da série diária (a partir do primeiro
-- dia que tem captura real em dois dias consecutivos), nunca sobre meses que só
-- possuem fechamento mensal.
CREATE OR REPLACE FUNCTION public.fill_snapshot_gaps(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date;
  v_to date;
  v_days date[] := ARRAY[]::date[];
  v_inserted int := 0;
  d date;
  src date;
  n int;
BEGIN
  IF p_from IS NOT NULL THEN
    v_from := p_from;
  ELSE
    SELECT MIN(s.data) INTO v_from
    FROM (
      SELECT DISTINCT data FROM public.metas_snapshot_diario
      WHERE tipo_snapshot <> 'carry_forward'
    ) s
    WHERE EXISTS (
      SELECT 1 FROM public.metas_snapshot_diario x
      WHERE x.tipo_snapshot <> 'carry_forward' AND x.data = s.data + 1
    );
  END IF;

  v_to := COALESCE(p_to, (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1);

  IF v_from IS NULL OR v_to < v_from THEN
    RETURN jsonb_build_object('days', to_jsonb(v_days), 'inserted', 0);
  END IF;

  FOR d IN SELECT gs::date FROM generate_series(v_from, v_to, INTERVAL '1 day') gs LOOP
    IF EXISTS (SELECT 1 FROM public.metas_snapshot_diario WHERE data = d) THEN
      CONTINUE;
    END IF;

    SELECT MAX(data) INTO src
    FROM public.metas_snapshot_diario
    WHERE data < d;

    IF src IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.metas_snapshot_diario (
      data, data_execucao, mes_ref, year_month, metric_key, scope, category_id, area,
      realized_amount, deals_count, tipo_snapshot, origem_leitura, fonte, origem_cliente
    )
    SELECT
      d,
      d,
      to_char(d, 'YYYY-MM'),
      date_trunc('month', d)::date,
      metric_key,
      scope,
      category_id,
      area,
      realized_amount,
      deals_count,
      'carry_forward',
      origem_leitura,
      fonte,
      origem_cliente
    FROM public.metas_snapshot_diario
    WHERE data = src;

    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN
      v_inserted := v_inserted + n;
      v_days := v_days || d;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('days', to_jsonb(v_days), 'inserted', v_inserted);
END;
$$;