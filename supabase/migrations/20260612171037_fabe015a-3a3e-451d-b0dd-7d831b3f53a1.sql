
-- Drop avatars listing policy entirely; public bucket still serves files via direct URL
DROP POLICY IF EXISTS "Authenticated can read avatars" ON storage.objects;

-- Revoke EXECUTE from all roles on trigger-only / internal SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_opportunity_dates_on_stage_change() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_commission_on_won() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scc_set_first_contact_on_match() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scc_sync_first_contact_at() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_precificacao_proposal_delete() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scc_compute_first_contact_for(text, text) FROM public, anon, authenticated;
