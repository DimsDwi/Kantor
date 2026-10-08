-- Supabase foundation. Apply once to an empty public schema.
-- The application remains on D1 until its Supabase adapter is enabled and tested.
-- Native Supabase Auth supplies auth.users, auth.uid(), auth.role(), storage.objects.
-- UTC+8 office timezone is intentionally explicit (Asia/Singapore).
BEGIN;
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE public.profiles (
 id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 full_name text NOT NULL, email text NOT NULL UNIQUE, employee_id text NOT NULL UNIQUE,
 department text NOT NULL, position text NOT NULL, phone text NOT NULL DEFAULT '',
 role text NOT NULL DEFAULT 'employee' CHECK(role IN ('employee','admin','superadmin')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 avatar_url text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.rooms (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_name text NOT NULL, building text NOT NULL,
 floor text NOT NULL, room_number text NOT NULL, capacity integer NOT NULL CHECK(capacity>0),
 description text NOT NULL, image_url text, status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','maintenance','unavailable')),
 operating_start time NOT NULL DEFAULT '08:00', operating_end time NOT NULL DEFAULT '18:00',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK(operating_end>operating_start)
);
CREATE TABLE public.facilities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL UNIQUE, icon text NOT NULL DEFAULT 'check', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.room_facilities(room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,facility_id uuid NOT NULL REFERENCES public.facilities(id) ON DELETE CASCADE,PRIMARY KEY(room_id,facility_id));
CREATE TABLE public.bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id), room_id uuid NOT NULL REFERENCES public.rooms(id),
 booking_date date NOT NULL, start_time time NOT NULL, end_time time NOT NULL,
 purpose text NOT NULL CHECK(length(trim(purpose))>=5), participant_count integer NOT NULL CHECK(participant_count>0),
 contact_number text NOT NULL, notes text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','cancelled','completed')),
 rejection_reason text, approved_by uuid REFERENCES public.profiles(id), approved_at timestamptz,
 request_key uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(end_time>start_time), CHECK(status<>'rejected' OR (rejection_reason IS NOT NULL AND length(trim(rejection_reason))>0)),
 -- The GiST exclusion constraint arbitrates concurrent transactions, not a SELECT precheck.
 EXCLUDE USING gist (room_id WITH =, tsrange(booking_date+start_time,booking_date+end_time,'[)') WITH &&)
 WHERE (status IN ('pending','approved'))
);
CREATE INDEX bookings_owner_date ON public.bookings(user_id,booking_date);
CREATE INDEX bookings_room_date ON public.bookings(room_id,booking_date);
CREATE TABLE public.notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),title text NOT NULL,message text NOT NULL,type text NOT NULL,reference_id uuid REFERENCES public.bookings(id),is_read boolean NOT NULL DEFAULT false,dedupe_key text UNIQUE,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX notifications_owner ON public.notifications(user_id,is_read);
CREATE TABLE public.activity_logs(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES public.profiles(id),action text NOT NULL,entity_type text NOT NULL,entity_id uuid,description text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX activity_created ON public.activity_logs(created_at DESC);
CREATE TABLE public.documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES public.profiles(id),booking_id uuid REFERENCES public.bookings(id),object_key text NOT NULL UNIQUE,filename text NOT NULL,content_type text NOT NULL CHECK(content_type IN ('application/pdf','image/png','image/jpeg')),size integer NOT NULL CHECK(size BETWEEN 1 AND 5242880),created_at timestamptz NOT NULL DEFAULT now());

-- Membership helpers read trusted profiles, never editable Auth user_metadata.
CREATE FUNCTION public.active_member() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active'); $$;
CREATE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role IN ('admin','superadmin'));  $$;
CREATE FUNCTION public.is_superadmin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND status='active' AND role='superadmin'); $$;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
REVOKE ALL ON FUNCTION public.active_member(),public.is_admin() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.active_member(),public.is_admin() TO authenticated;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY profile_read ON public.profiles FOR SELECT TO authenticated USING(public.active_member() AND (id=auth.uid() OR public.is_admin()));
CREATE POLICY profile_update ON public.profiles FOR UPDATE TO authenticated USING(public.active_member() AND id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY rooms_read ON public.rooms FOR SELECT TO authenticated USING(public.active_member());
CREATE POLICY rooms_write ON public.rooms FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY facilities_read ON public.facilities FOR SELECT TO authenticated USING(public.active_member());
CREATE POLICY facilities_write ON public.facilities FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY room_facilities_read ON public.room_facilities FOR SELECT TO authenticated USING(public.active_member());
CREATE POLICY room_facilities_write ON public.room_facilities FOR ALL TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
CREATE POLICY bookings_read ON public.bookings FOR SELECT TO authenticated USING(public.active_member() AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY bookings_insert ON public.bookings FOR INSERT TO authenticated WITH CHECK(public.active_member() AND user_id=auth.uid() AND status='pending' AND approved_by IS NULL AND approved_at IS NULL);
CREATE POLICY bookings_update ON public.bookings FOR UPDATE TO authenticated USING(public.active_member() AND (user_id=auth.uid() OR public.is_admin())) WITH CHECK(public.active_member() AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY notifications_read ON public.notifications FOR SELECT TO authenticated USING(public.active_member() AND user_id=auth.uid());
CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated USING(public.active_member() AND user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY logs_read ON public.activity_logs FOR SELECT TO authenticated USING(public.is_admin());
CREATE POLICY documents_read ON public.documents FOR SELECT TO authenticated USING(public.active_member() AND (user_id=auth.uid() OR public.is_admin()));
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated WITH CHECK(public.active_member() AND user_id=auth.uid() AND split_part(object_key,'/',1)=auth.uid()::text AND (booking_id IS NULL OR EXISTS(SELECT 1 FROM public.bookings WHERE id=booking_id AND user_id=auth.uid())));
-- Grant only necessary columns: employees cannot elevate their own role or status.
REVOKE ALL ON public.profiles,public.rooms,public.facilities,public.room_facilities,public.bookings,public.notifications,public.activity_logs,public.documents FROM anon,authenticated;
GRANT SELECT ON public.profiles,public.rooms,public.facilities,public.room_facilities,public.bookings,public.notifications,public.activity_logs,public.documents TO authenticated;
GRANT UPDATE(full_name,phone,avatar_url) ON public.profiles TO authenticated;
GRANT INSERT,UPDATE,DELETE ON public.rooms,public.facilities,public.room_facilities TO authenticated;
GRANT INSERT ON public.bookings,public.documents TO authenticated;
GRANT UPDATE(status,rejection_reason) ON public.bookings TO authenticated;
GRANT UPDATE(is_read) ON public.notifications TO authenticated;

CREATE FUNCTION public.validate_booking() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.rooms; office_now timestamp := now() AT TIME ZONE 'Asia/Singapore';
BEGIN
 -- Shared row lock serializes capacity/status edits against new bookings.
 SELECT * INTO r FROM public.rooms WHERE id=NEW.room_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ROOM_NOT_FOUND'; END IF;
 IF TG_OP='INSERT' THEN
   IF NOT public.active_member() OR NEW.user_id<>auth.uid() OR NEW.status<>'pending' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
   IF NEW.booking_date+NEW.start_time<=office_now THEN RAISE EXCEPTION 'PAST_BOOKING'; END IF;
 ELSE
   IF ROW(NEW.user_id,NEW.room_id,NEW.booking_date,NEW.start_time,NEW.end_time,NEW.purpose,NEW.participant_count,NEW.contact_number,NEW.notes,NEW.request_key) IS DISTINCT FROM ROW(OLD.user_id,OLD.room_id,OLD.booking_date,OLD.start_time,OLD.end_time,OLD.purpose,OLD.participant_count,OLD.contact_number,OLD.notes,OLD.request_key) THEN RAISE EXCEPTION 'IMMUTABLE_BOOKING'; END IF;
   IF NEW.status IS DISTINCT FROM OLD.status THEN
     IF OLD.status='pending' AND NEW.status IN ('approved','rejected') THEN
       IF NOT public.is_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
       IF NEW.status='approved' THEN
         IF NEW.booking_date+NEW.start_time<=office_now THEN RAISE EXCEPTION 'PAST_BOOKING'; END IF;
         NEW.approved_by:=auth.uid(); NEW.approved_at:=now(); NEW.rejection_reason:=NULL;
       END IF;
     ELSIF OLD.status IN ('pending','approved') AND NEW.status='cancelled' THEN
       IF NOT public.active_member() OR (NEW.user_id<>auth.uid() AND NOT public.is_admin()) OR NEW.booking_date+NEW.start_time<=office_now THEN RAISE EXCEPTION 'CANCELLATION_FORBIDDEN'; END IF;
     ELSIF OLD.status='approved' AND NEW.status='completed' THEN
       IF auth.role() IS DISTINCT FROM 'service_role' OR NEW.booking_date+NEW.end_time>office_now THEN RAISE EXCEPTION 'COMPLETION_FORBIDDEN'; END IF;
     ELSE RAISE EXCEPTION 'INVALID_TRANSITION'; END IF;
   ELSIF ROW(NEW.rejection_reason,NEW.approved_by,NEW.approved_at) IS DISTINCT FROM ROW(OLD.rejection_reason,OLD.approved_by,OLD.approved_at) THEN RAISE EXCEPTION 'IMMUTABLE_DECISION';
   END IF;
 END IF;
 IF NEW.status IN ('pending','approved') AND r.status<>'available' THEN RAISE EXCEPTION 'ROOM_UNAVAILABLE'; END IF;
 IF NEW.participant_count>r.capacity THEN RAISE EXCEPTION 'CAPACITY_EXCEEDED'; END IF;
 IF NEW.start_time<r.operating_start OR NEW.end_time>r.operating_end THEN RAISE EXCEPTION 'OUTSIDE_HOURS'; END IF;
 IF NEW.status='rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason))=0) THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_booking() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER validate_booking BEFORE INSERT OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.validate_booking();
CREATE FUNCTION public.booking_side_effects() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE action_name text; title_text text;
BEGIN
 IF TG_OP='UPDATE' AND NEW.status=OLD.status THEN RETURN NEW; END IF;
 action_name:=CASE WHEN TG_OP='INSERT' THEN 'create_booking' ELSE NEW.status||'_booking' END;
 title_text:=CASE WHEN TG_OP='INSERT' THEN 'Pengajuan berhasil dikirim' WHEN NEW.status='approved' THEN 'Pengajuan disetujui' WHEN NEW.status='rejected' THEN 'Pengajuan ditolak' WHEN NEW.status='cancelled' THEN 'Peminjaman dibatalkan' ELSE 'Peminjaman selesai' END;
 INSERT INTO public.notifications(user_id,title,message,type,reference_id,dedupe_key) VALUES(NEW.user_id,title_text,COALESCE(NEW.rejection_reason,NEW.purpose),NEW.status,NEW.id,action_name||':'||NEW.id);
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,description) VALUES(auth.uid(),action_name,'booking',NEW.id,NEW.purpose);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.booking_side_effects() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER booking_side_effects AFTER INSERT OR UPDATE OF status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.booking_side_effects();

-- Privacy-preserving calendar projection. No purpose/contact/user metadata escapes RLS.
CREATE FUNCTION public.availability(from_date date,to_date date) RETURNS TABLE(id uuid,room_id uuid,booking_date date,start_time time,end_time time,status text) LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT public.active_member() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF from_date IS NULL OR to_date IS NULL OR to_date<from_date OR to_date-from_date>100 THEN RAISE EXCEPTION 'INVALID_RANGE'; END IF;
 RETURN QUERY SELECT b.id,b.room_id,b.booking_date,b.start_time,b.end_time,b.status FROM public.bookings b WHERE b.status IN ('pending','approved') AND b.booking_date BETWEEN from_date AND to_date;
END $$;
REVOKE ALL ON FUNCTION public.availability(date,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.availability(date,date) TO authenticated;

CREATE FUNCTION public.admin_set_access(target uuid,new_role text,new_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 -- Serialize access changes to preserve at least one active administrator.
 LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
 IF NOT public.is_superadmin() OR target=auth.uid() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
 IF new_role IS NULL OR new_status IS NULL OR new_role NOT IN ('employee','admin','superadmin') OR new_status NOT IN ('active','inactive') THEN RAISE EXCEPTION 'INVALID_ACCESS'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=target) THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE id<>target AND role='superadmin' AND status='active') AND (new_role<>'superadmin' OR new_status<>'active') THEN RAISE EXCEPTION 'LAST_SUPERADMIN'; END IF;
 UPDATE public.profiles SET role=new_role,status=new_status,updated_at=now() WHERE id=target;
 INSERT INTO public.activity_logs(user_id,action,entity_type,entity_id,description) VALUES(auth.uid(),'change_access','profile',target,new_role||' / '||new_status);
END $$;
REVOKE ALL ON FUNCTION public.admin_set_access(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_set_access(uuid,text,text) TO authenticated;

-- Private supporting documents: authenticated owner folder, admin review.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('booking-documents','booking-documents',false,5242880,ARRAY['application/pdf','image/png','image/jpeg']);
CREATE POLICY documents_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='booking-documents' AND public.active_member() AND (storage.foldername(name))[1]=auth.uid()::text);
CREATE POLICY documents_download ON storage.objects FOR SELECT TO authenticated USING(bucket_id='booking-documents' AND public.active_member() AND ((storage.foldername(name))[1]=auth.uid()::text OR public.is_admin()));
COMMIT;
