CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`description` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_logs_created` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `bookings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`room_id` text NOT NULL,
	`booking_date` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`purpose` text NOT NULL,
	`participant_count` integer NOT NULL,
	`contact_number` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`rejection_reason` text,
	`approved_by` text,
	`approved_at` text,
	`actor_id` text NOT NULL,
	`request_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`approved_by`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`actor_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "booking_time" CHECK("bookings"."end_time">"bookings"."start_time"),
	CONSTRAINT "booking_count" CHECK("bookings"."participant_count">0),
	CONSTRAINT "booking_status" CHECK("bookings"."status" IN ('pending','approved','rejected','cancelled','completed')),
	CONSTRAINT "reject_reason" CHECK("bookings"."status"!='rejected' OR length(trim("bookings"."rejection_reason"))>0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookings_request_key_unique` ON `bookings` (`request_key`);--> statement-breakpoint
CREATE INDEX `idx_bookings_room_date` ON `bookings` (`room_id`,`booking_date`,`status`);--> statement-breakpoint
CREATE INDEX `idx_bookings_user_date` ON `bookings` (`user_id`,`booking_date`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`booking_id` text,
	`object_key` text NOT NULL,
	`filename` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`booking_id`) REFERENCES `bookings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_object_key_unique` ON `documents` (`object_key`);--> statement-breakpoint
CREATE TABLE `facilities` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text DEFAULT 'check' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `facilities_name_unique` ON `facilities` (`name`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`message` text NOT NULL,
	`type` text NOT NULL,
	`reference_id` text,
	`is_read` integer DEFAULT 0 NOT NULL,
	`dedupe_key` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_dedupe_key_unique` ON `notifications` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `idx_notifications_user` ON `notifications` (`user_id`,`is_read`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`employee_id` text NOT NULL,
	`department` text NOT NULL,
	`position` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`avatar_url` text,
	`password_hash` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "profile_role" CHECK("profiles"."role" IN ('admin','employee')),
	CONSTRAINT "profile_status" CHECK("profiles"."status" IN ('active','inactive'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_employee_id_unique` ON `profiles` (`employee_id`);--> statement-breakpoint
CREATE TABLE `reset_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `room_facilities` (
	`room_id` text NOT NULL,
	`facility_id` text NOT NULL,
	PRIMARY KEY(`room_id`, `facility_id`),
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`facility_id`) REFERENCES `facilities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`room_name` text NOT NULL,
	`building` text NOT NULL,
	`floor` text NOT NULL,
	`room_number` text NOT NULL,
	`capacity` integer NOT NULL,
	`description` text NOT NULL,
	`image_url` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`operating_start` text DEFAULT '08:00' NOT NULL,
	`operating_end` text DEFAULT '18:00' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "room_capacity" CHECK("rooms"."capacity">0),
	CONSTRAINT "room_status" CHECK("rooms"."status" IN ('available','maintenance','unavailable')),
	CONSTRAINT "room_hours" CHECK("rooms"."operating_end">"rooms"."operating_start")
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);