-- 1) Virtual auth user for 4blue attribution. Trigger handle_new_user() creates profile + role.
DO $$
DECLARE
  v_uid uuid := '4b100000-0000-4000-8000-000000004b1e';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = '4blue@yampa.internal') THEN
    INSERT INTO auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, is_sso_user, is_anonymous
    ) VALUES (
      v_uid,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      '4blue@yampa.internal',
      crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(),
      jsonb_build_object('provider','virtual','providers', array['virtual']),
      jsonb_build_object('full_name','4blue','virtual', true),
      now(), now(), false, false
    );
  END IF;

  -- Ensure profile display name is "4blue" even if trigger seeded with email fallback.
  UPDATE public.profiles
     SET full_name = '4blue', email = '4blue@yampa.internal'
   WHERE user_id = (SELECT id FROM auth.users WHERE email='4blue@yampa.internal');
END $$;

-- 2) Commission price map without price_id, keyed by offer_name='4blue', tied to the virtual seller and area='4blue'.
INSERT INTO public.commission_price_map (
  price_id, offer_name, price_name, plan_name, payment_type,
  area, seller_user_id, seller_label, mrr_override, requires_commission
)
SELECT
  NULL, '4blue', '4blue', '4blue', NULL,
  '4blue', u.id, '4blue', NULL, false
FROM auth.users u
WHERE u.email = '4blue@yampa.internal'
ON CONFLICT ((lower(offer_name))) WHERE price_id IS NULL AND offer_name IS NOT NULL DO NOTHING;