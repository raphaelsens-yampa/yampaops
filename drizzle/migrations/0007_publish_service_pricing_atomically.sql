CREATE OR REPLACE FUNCTION public.publish_service_pricing(p_version jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_permission text;
  v_row public.pricing_versions;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
  v_permission := CASE WHEN p_version->>'change_type' IN ('new_service', 'import_xlsx') THEN 'create' ELSE 'edit' END;
  IF NOT public.has_role(v_uid, 'admin'::public.app_role) AND NOT EXISTS (
    SELECT 1 FROM public.user_access_levels u
    JOIN public.access_levels a ON a.id = u.access_level_id
    WHERE u.user_id = v_uid AND a.permissions->'precificacao'->v_permission = 'true'::jsonb
  ) THEN RAISE EXCEPTION 'Sem permissão para salvar a precificação' USING ERRCODE = '42501'; END IF;
  IF COALESCE(jsonb_typeof(p_version->'snapshot'->'products'), '') <> 'array'
    OR COALESCE(jsonb_typeof(p_version->'snapshot'->'config'), '') <> 'object'
    OR COALESCE(trim(p_version->>'name'), '') = '' THEN
    RAISE EXCEPTION 'Invalid pricing snapshot' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('public.pricing_versions.active'));
  UPDATE public.pricing_versions SET is_active = false WHERE is_active = true;
  INSERT INTO public.pricing_versions(name, description, source, change_type, file_name, snapshot, is_active, status, created_by)
  VALUES (p_version->>'name', p_version->>'description', p_version->>'source', p_version->>'change_type', p_version->>'file_name', p_version->'snapshot', true, 'committed', v_uid)
  RETURNING * INTO v_row;
  RETURN to_jsonb(v_row);
END;
$$;
REVOKE ALL ON FUNCTION public.publish_service_pricing(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_service_pricing(jsonb) TO authenticated;
COMMENT ON FUNCTION public.publish_service_pricing(jsonb) IS 'Publishes the shared catalog atomically after checking the authenticated pricing create/edit permission; preserves version history and prevents losing the active catalog on failed inserts.';