CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_seller_level_id uuid;
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'seller');

  SELECT id INTO v_seller_level_id
  FROM public.access_levels
  WHERE is_system = true AND name = 'Vendedor'
  LIMIT 1;

  IF v_seller_level_id IS NOT NULL THEN
    INSERT INTO public.user_access_levels (user_id, access_level_id)
    VALUES (NEW.id, v_seller_level_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;