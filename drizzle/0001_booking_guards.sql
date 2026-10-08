-- Active intervals are half-open [start,end). SQLite serializes writers; both guards
-- run inside the same write transaction as insert/update, including D1 batch.
CREATE TRIGGER booking_insert_guard BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.actor_id AND status='active' AND (role='admin' OR (id=NEW.user_id AND NEW.status='pending'))) THEN RAISE(ABORT,'FORBIDDEN_ACTOR') END;
 SELECT CASE WHEN NEW.status IN ('pending','approved') AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND status='available') THEN RAISE(ABORT,'ROOM_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.participant_count>(SELECT capacity FROM rooms WHERE id=NEW.room_id) THEN RAISE(ABORT,'CAPACITY_EXCEEDED') END;
 SELECT CASE WHEN NEW.start_time<(SELECT operating_start FROM rooms WHERE id=NEW.room_id) OR NEW.end_time>(SELECT operating_end FROM rooms WHERE id=NEW.room_id) THEN RAISE(ABORT,'OUTSIDE_HOURS') END;
 SELECT CASE WHEN NEW.status IN ('pending','approved') AND EXISTS(SELECT 1 FROM bookings WHERE room_id=NEW.room_id AND booking_date=NEW.booking_date AND status IN ('pending','approved') AND start_time<NEW.end_time AND end_time>NEW.start_time AND id<>NEW.id) THEN RAISE(ABORT,'BOOKING_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_update_guard BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.room_id<>OLD.room_id OR NEW.user_id<>OLD.user_id OR NEW.booking_date<>OLD.booking_date OR NEW.start_time<>OLD.start_time OR NEW.end_time<>OLD.end_time OR NEW.participant_count<>OLD.participant_count OR NEW.purpose<>OLD.purpose OR NEW.request_key<>OLD.request_key THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.status<>OLD.status AND NOT ((OLD.status='pending' AND NEW.status IN ('approved','rejected','cancelled')) OR (OLD.status='approved' AND NEW.status IN ('cancelled','completed'))) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.status IN ('approved','rejected') AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.actor_id AND role='admin' AND status='active') THEN RAISE(ABORT,'FORBIDDEN_ACTOR') END;
 SELECT CASE WHEN NEW.status='cancelled' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=NEW.actor_id AND status='active' AND (role='admin' OR id=NEW.user_id)) THEN RAISE(ABORT,'FORBIDDEN_ACTOR') END;
 SELECT CASE WHEN NEW.status='cancelled' AND NEW.booking_date || ' ' || NEW.start_time<=strftime('%Y-%m-%d %H:%M','now','+8 hours') THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.status='completed' AND NEW.booking_date || ' ' || NEW.end_time>strftime('%Y-%m-%d %H:%M','now','+8 hours') THEN RAISE(ABORT,'INVALID_TRANSITION') END;
 SELECT CASE WHEN NEW.status IN ('pending','approved') AND NOT EXISTS(SELECT 1 FROM rooms WHERE id=NEW.room_id AND status='available') THEN RAISE(ABORT,'ROOM_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.status IN ('pending','approved') AND EXISTS(SELECT 1 FROM bookings WHERE room_id=NEW.room_id AND booking_date=NEW.booking_date AND status IN ('pending','approved') AND start_time<NEW.end_time AND end_time>NEW.start_time AND id<>NEW.id) THEN RAISE(ABORT,'BOOKING_CONFLICT') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_created AFTER INSERT ON bookings BEGIN
 INSERT INTO notifications(id,user_id,title,message,type,reference_id,dedupe_key) VALUES(lower(hex(randomblob(16))),NEW.user_id,'Pengajuan berhasil dikirim',(SELECT room_name FROM rooms WHERE id=NEW.room_id) || ' · ' || NEW.booking_date || ' · ' || NEW.start_time,'booking',NEW.id,'created:' || NEW.id);
 INSERT INTO notifications(id,user_id,title,message,type,reference_id,dedupe_key) SELECT lower(hex(randomblob(16))),id,'Pengajuan baru menunggu persetujuan',NEW.purpose,'approval',NEW.id,'approval:' || NEW.id || ':' || id FROM profiles WHERE role='admin' AND status='active' AND NEW.status='pending';
 INSERT INTO activity_logs(id,user_id,action,entity_type,entity_id,description) VALUES(lower(hex(randomblob(16))),NEW.actor_id,'create_booking','booking',NEW.id,'Mengajukan ' || NEW.purpose);
END;
--> statement-breakpoint
CREATE TRIGGER booking_changed AFTER UPDATE OF status ON bookings WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO notifications(id,user_id,title,message,type,reference_id,dedupe_key) VALUES(lower(hex(randomblob(16))),NEW.user_id,CASE NEW.status WHEN 'approved' THEN 'Pengajuan telah disetujui' WHEN 'rejected' THEN 'Pengajuan ditolak' WHEN 'cancelled' THEN 'Peminjaman dibatalkan' WHEN 'completed' THEN 'Peminjaman telah selesai' ELSE 'Status pengajuan berubah' END,(SELECT room_name FROM rooms WHERE id=NEW.room_id) || ' · ' || COALESCE(NEW.rejection_reason,NEW.purpose),NEW.status,NEW.id,NEW.status || ':' || NEW.id);
 INSERT INTO activity_logs(id,user_id,action,entity_type,entity_id,description) VALUES(lower(hex(randomblob(16))),CASE WHEN NEW.status='completed' THEN NULL ELSE NEW.actor_id END,NEW.status || '_booking','booking',NEW.id,NEW.purpose || ' · ' || NEW.status);
END;
--> statement-breakpoint
CREATE TRIGGER room_booking_guard BEFORE UPDATE ON rooms BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE room_id=NEW.id AND status IN ('pending','approved') AND booking_date || ' ' || end_time>strftime('%Y-%m-%d %H:%M','now','+8 hours') AND (NEW.status<>'available' OR participant_count>NEW.capacity OR start_time<NEW.operating_start OR end_time>NEW.operating_end)) THEN RAISE(ABORT,'ROOM_HAS_BOOKINGS') END;
END;
--> statement-breakpoint
CREATE TRIGGER last_admin_guard BEFORE UPDATE ON profiles WHEN OLD.role='admin' AND OLD.status='active' AND (NEW.role<>'admin' OR NEW.status<>'active') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM profiles WHERE role='admin' AND status='active' AND id<>OLD.id) THEN RAISE(ABORT,'LAST_ADMIN') END;
END;
