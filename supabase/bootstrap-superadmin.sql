-- Owner-only: run in Supabase SQL Editor after creating the Auth account.
-- Replace the example email with the intended, verified owner email.
-- Never expose this SQL through the application's public API.
BEGIN;
DO $$
DECLARE owner_id uuid; owner_email text := 'owner@example.invalid';
BEGIN
 SELECT id INTO owner_id FROM auth.users
 WHERE lower(email)=lower(owner_email) AND email_confirmed_at IS NOT NULL;
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Create and confirm the intended Auth account first'; END IF;
 IF EXISTS(SELECT 1 FROM public.profiles WHERE role='superadmin' AND id<>owner_id) THEN
  RAISE EXCEPTION 'A superadmin already exists; use the authorized access-management flow';
 END IF;
 INSERT INTO public.profiles(id,full_name,email,employee_id,department,position,role,status)
 VALUES(owner_id,'Superadmin',lower(owner_email),'OWNER-001','Manajemen','Superadmin','superadmin','active')
 ON CONFLICT(id) DO UPDATE SET role='superadmin',status='active',updated_at=now();
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,description)
 VALUES(owner_id,'bootstrap_superadmin','profile',owner_id,'Owner provisioned the first superadmin through SQL Editor');
END $$;
COMMIT;
