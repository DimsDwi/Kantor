-- Run after the foundation migration. Test fixtures are always rolled back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000001','rls-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000000002','rls-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000003','rls-b@example.invalid'),
 ('00000000-0000-4000-8000-000000000004','rls-super@example.invalid');
INSERT INTO public.profiles(id,email,full_name,employee_id,department,position,role)
SELECT id,email,'RLS test',id::text,'QA','QA',CASE WHEN id::text LIKE '%004' THEN 'superadmin' WHEN id::text LIKE '%001' THEN 'admin' ELSE 'employee' END
FROM auth.users WHERE id IN ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004');
INSERT INTO public.rooms(id,room_name,building,floor,room_number,capacity,description)
VALUES('00000000-0000-4000-8000-000000000010','RLS test','QA','1','QA',10,'Temporary verification');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.profiles)<>1 THEN RAISE EXCEPTION 'FAIL: profile privacy'; END IF;
 BEGIN
  UPDATE public.profiles SET role='admin' WHERE id=auth.uid();
  RAISE EXCEPTION 'FAIL: role escalation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  INSERT INTO public.rooms(room_name,building,floor,room_number,capacity,description) VALUES('Forbidden','QA','1','QA',1,'test');
  RAISE EXCEPTION 'FAIL: employee room write';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
INSERT INTO public.bookings(id,user_id,room_id,booking_date,start_time,end_time,purpose,participant_count,contact_number)
VALUES('00000000-0000-4000-8000-000000000020',auth.uid(),'00000000-0000-4000-8000-000000000010',current_date+30,'09:00','10:00','RLS verification',2,'000');
DO $$ BEGIN
 BEGIN
  INSERT INTO public.bookings(user_id,room_id,booking_date,start_time,end_time,purpose,participant_count,contact_number)
  VALUES(auth.uid(),'00000000-0000-4000-8000-000000000010',current_date+30,'09:30','10:30','Overlap verification',2,'000');
  RAISE EXCEPTION 'FAIL: overlap accepted';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.bookings) THEN RAISE EXCEPTION 'FAIL: booking privacy'; END IF;
 IF (SELECT count(*) FROM public.availability(current_date+30,current_date+30))<>1 THEN RAISE EXCEPTION 'FAIL: availability'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
UPDATE public.bookings SET status='approved' WHERE id='00000000-0000-4000-8000-000000000020';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.bookings WHERE status='approved' AND approved_by=auth.uid()) THEN RAISE EXCEPTION 'FAIL: admin approval'; END IF;
 IF (SELECT count(*) FROM public.activity_logs WHERE entity_id='00000000-0000-4000-8000-000000000020')<>2 THEN RAISE EXCEPTION 'FAIL: audit'; END IF;
END $$;
DO $$ BEGIN
 BEGIN
  PERFORM public.admin_set_access('00000000-0000-4000-8000-000000000003','admin','active');
  RAISE EXCEPTION 'FAIL: ordinary admin changed role';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
SELECT public.admin_set_access('00000000-0000-4000-8000-000000000003','admin','active');
DO $$ BEGIN
 IF NOT public.is_superadmin() OR NOT public.is_admin() THEN RAISE EXCEPTION 'FAIL: superadmin capabilities'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id='00000000-0000-4000-8000-000000000003' AND role='admin') THEN RAISE EXCEPTION 'FAIL: superadmin role change'; END IF;
 BEGIN
  PERFORM public.admin_set_access(auth.uid(),'employee','inactive');
  RAISE EXCEPTION 'FAIL: self demotion';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM<>'FORBIDDEN' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: profile privacy, role protection, admin-only rooms, booking privacy, overlap exclusion, availability, approval, audit; fixtures rolled back' AS verification;
