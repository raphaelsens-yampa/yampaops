
-- 1) profiles: restrict SELECT to authenticated users
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- 2) integration_settings: scope policy to authenticated role
DROP POLICY IF EXISTS "Admins manage integration_settings" ON public.integration_settings;
CREATE POLICY "Admins manage integration_settings"
  ON public.integration_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3) proposal_templates: replace permissive update/delete
DROP POLICY IF EXISTS "Authenticated users can update templates" ON public.proposal_templates;
DROP POLICY IF EXISTS "Authenticated users can delete templates" ON public.proposal_templates;
CREATE POLICY "Admins or tatico can update templates"
  ON public.proposal_templates FOR UPDATE
  TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()))
  WITH CHECK (public.is_tatico_or_admin(auth.uid()));
CREATE POLICY "Admins or tatico can delete templates"
  ON public.proposal_templates FOR DELETE
  TO authenticated
  USING (public.is_tatico_or_admin(auth.uid()));

-- 4) avatars bucket: prevent listing while keeping public file access via direct URLs
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated can read avatars"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- 5) Revoke EXECUTE on SECURITY DEFINER helpers from anon; keep authenticated only when needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_tatico_or_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_chatwoot_labels() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scc_compute_tag_funnel(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scc_list_campaign_tags(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scc_refresh_first_contact(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.scc_compute_first_contact_for(text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.calculate_discount(discount_plan_type, numeric, numeric, numeric) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_tatico_or_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_chatwoot_labels() TO authenticated;
GRANT EXECUTE ON FUNCTION public.scc_compute_tag_funnel(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scc_list_campaign_tags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.scc_refresh_first_contact(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_discount(discount_plan_type, numeric, numeric, numeric) TO authenticated;
