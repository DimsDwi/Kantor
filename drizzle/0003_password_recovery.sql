CREATE TABLE `password_reset_tokens` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `password_reset_tokens_user_id_unique` ON `password_reset_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_reset_expiry` ON `password_reset_tokens` (`expires_at`);