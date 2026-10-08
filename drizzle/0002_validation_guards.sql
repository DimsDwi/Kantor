-- Validation also runs when data is written directly, independently of the API.
CREATE TRIGGER booking_insert_validation BEFORE INSERT ON bookings BEGIN
 SELECT CASE WHEN length(NEW.booking_date)<>10 OR NEW.booking_date NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(NEW.booking_date,'+0 days') IS NULL OR date(NEW.booking_date,'+0 days')<>NEW.booking_date THEN RAISE(ABORT,'INVALID_DATE') END;
 SELECT CASE WHEN NEW.start_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' OR NEW.end_time NOT GLOB '[0-2][0-9]:[0-5][0-9]' OR NEW.start_time>'23:59' OR NEW.end_time>'23:59' OR length(NEW.start_time)<>5 OR length(NEW.end_time)<>5 THEN RAISE(ABORT,'INVALID_TIME') END;
 SELECT CASE WHEN typeof(NEW.participant_count)<>'integer' OR NEW.participant_count<1 THEN RAISE(ABORT,'INVALID_PARTICIPANTS') END;
 SELECT CASE WHEN NEW.status IN ('pending','approved') AND NEW.booking_date || ' ' || NEW.start_time<=strftime('%Y-%m-%d %H:%M','now','+8 hours') THEN RAISE(ABORT,'PAST_BOOKING') END;
 SELECT CASE WHEN NEW.status='rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason))=0) THEN RAISE(ABORT,'REJECT_REASON_REQUIRED') END;
 SELECT CASE WHEN NEW.status='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.approved_by<>NEW.actor_id) THEN RAISE(ABORT,'INVALID_APPROVER') END;
END;
--> statement-breakpoint
CREATE TRIGGER booking_update_validation BEFORE UPDATE ON bookings BEGIN
 SELECT CASE WHEN NEW.status='rejected' AND (NEW.rejection_reason IS NULL OR length(trim(NEW.rejection_reason))=0) THEN RAISE(ABORT,'REJECT_REASON_REQUIRED') END;
 SELECT CASE WHEN NEW.status='approved' AND (NEW.approved_by IS NULL OR NEW.approved_at IS NULL OR NEW.approved_by<>NEW.actor_id) THEN RAISE(ABORT,'INVALID_APPROVER') END;
 SELECT CASE WHEN NEW.status='approved' AND OLD.status='pending' AND NEW.booking_date || ' ' || NEW.start_time<=strftime('%Y-%m-%d %H:%M','now','+8 hours') THEN RAISE(ABORT,'PAST_BOOKING') END;
END;
