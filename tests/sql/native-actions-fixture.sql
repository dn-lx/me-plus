-- Disposable contract fixture. No live credentials, users or records.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA public, auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;
CREATE TABLE public.actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  origin text NOT NULL, title text NOT NULL, domain text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('must','should','bonus')),
  version text NOT NULL, status text NOT NULL,
  estimated_minutes integer, available_from timestamptz, due_at timestamptz,
  routine_event_id uuid, constraint_flags jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL,
  action_id uuid NOT NULL REFERENCES public.actions(id), event_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(), metadata jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE public.actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY own_actions ON public.actions FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY own_events ON public.action_events FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON public.actions, public.action_events TO authenticated;
-- Failure injection verifies that action and event writes are atomic.
CREATE FUNCTION public.fixture_event_failure() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.reject_event', true) = 'yes' THEN
    RAISE EXCEPTION 'fixture event failure' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_event_failure BEFORE INSERT ON public.action_events
FOR EACH ROW EXECUTE FUNCTION public.fixture_event_failure();
