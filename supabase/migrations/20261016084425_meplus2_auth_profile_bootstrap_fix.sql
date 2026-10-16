-- Me+ profiles no longer have the V1 marketplace primary_role column.
CREATE OR REPLACE FUNCTION private.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
DECLARE v_timezone text;
BEGIN
  SELECT name INTO v_timezone FROM pg_catalog.pg_timezone_names
  WHERE name = NEW.raw_user_meta_data->>'timezone' LIMIT 1;
  INSERT INTO public.profiles(id, display_name, timezone, locale)
  VALUES (NEW.id,
    nullif(left(btrim(coalesce(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name','')),200),''),
    coalesce(v_timezone,'UTC'),
    left(coalesce(nullif(NEW.raw_user_meta_data->>'locale',''),'en'),32))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
