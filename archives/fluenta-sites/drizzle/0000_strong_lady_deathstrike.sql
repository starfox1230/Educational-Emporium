CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`deck_id` text NOT NULL,
	`english` text NOT NULL,
	`spanish` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`state` text DEFAULT 'new' NOT NULL,
	`due` text NOT NULL,
	`interval` text DEFAULT 'new' NOT NULL,
	`reviews` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`last_reviewed` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`language` text DEFAULT 'es' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `review_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`reviewed_at` text NOT NULL,
	`rating` text NOT NULL,
	`duration` integer DEFAULT 0 NOT NULL,
	`previous_due` text NOT NULL,
	`resulting_due` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `study_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`retention` real DEFAULT 0.9 NOT NULL,
	`timer_enabled` integer DEFAULT true NOT NULL,
	`question_seconds` integer DEFAULT 20 NOT NULL,
	`answer_seconds` integer DEFAULT 12 NOT NULL,
	`streak_enabled` integer DEFAULT true NOT NULL,
	`boost_enabled` integer DEFAULT true NOT NULL,
	`sound_enabled` integer DEFAULT false NOT NULL,
	`haptics_enabled` integer DEFAULT true NOT NULL,
	`reduced_effects` integer DEFAULT false NOT NULL,
	`streak` integer DEFAULT 0 NOT NULL,
	`longest_streak` integer DEFAULT 0 NOT NULL,
	`boosts` integer DEFAULT 3 NOT NULL,
	`reviewed_today` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
