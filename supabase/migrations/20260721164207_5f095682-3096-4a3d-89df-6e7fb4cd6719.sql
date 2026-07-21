CREATE OR REPLACE FUNCTION public.validate_stripe_net_amount(p_id uuid)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sc public.stripe_conversions%ROWTYPE;
  v_issues text[] := ARRAY[]::text[];
  v_age_days int;
BEGIN
  SELECT * INTO v_sc FROM public.stripe_conversions WHERE id = p_id;
  IF NOT FOUND THEN RETURN v_issues; END IF;

  v_age_days := EXTRACT(DAY FROM (now() - COALESCE(v_sc.converted_at, v_sc.created_at)))::int;

  IF COALESCE(v_sc.mrr, 0) <= 0 AND v_sc.stripe_invoice_id IS NULL THEN
    RETURN v_issues;
  END IF;

  IF v_sc.stripe_invoice_id IS NOT NULL AND v_sc.net_amount IS NULL THEN
    v_issues := array_append(v_issues, 'net_amount ausente apesar de invoice conhecida'::text);
  END IF;

  IF v_sc.discount_amount > 0 AND v_sc.coupon_id IS NULL AND v_sc.promotion_code IS NULL THEN
    v_issues := array_append(v_issues, 'desconto aplicado sem cupom identificado'::text);
  END IF;

  IF COALESCE(v_sc.net_amount_source, 'price_fallback') = 'price_fallback'
     AND v_age_days <= 30 AND v_sc.converted_at IS NOT NULL THEN
    v_issues := array_append(v_issues, 'sem lookup de invoice em conversão recente (<= 30 dias)'::text);
  END IF;

  IF v_sc.gross_amount IS NOT NULL AND v_sc.net_amount IS NOT NULL
     AND ABS(v_sc.gross_amount - COALESCE(v_sc.discount_amount, 0) - v_sc.net_amount) > 0.02 THEN
    v_issues := array_append(v_issues,
      ('bruto - desconto != líquido (' ||
       to_char(v_sc.gross_amount, 'FM999999990.00') || ' - ' ||
       to_char(COALESCE(v_sc.discount_amount, 0), 'FM999999990.00') || ' != ' ||
       to_char(v_sc.net_amount, 'FM999999990.00') || ')')::text);
  END IF;

  IF v_sc.net_amount IS NOT NULL AND v_sc.net_amount > 0 AND v_sc.mrr_net IS NULL THEN
    v_issues := array_append(v_issues, 'mrr_net ausente apesar de valor líquido positivo'::text);
  END IF;

  IF v_sc.mrr > 0 AND v_sc.mrr_net IS NOT NULL AND v_sc.mrr_net > 0
     AND ABS(v_sc.mrr - v_sc.mrr_net) > 0.02 THEN
    v_issues := array_append(v_issues,
      ('mrr gravado difere do mrr_net (' ||
       to_char(v_sc.mrr, 'FM999999990.00') || ' vs ' ||
       to_char(v_sc.mrr_net, 'FM999999990.00') || ')')::text);
  END IF;

  RETURN v_issues;
END;
$function$;