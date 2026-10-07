ALTER TABLE `study_settings` ADD `content_version` text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_settings` ADD `last_streak_date` text;--> statement-breakpoint
ALTER TABLE `study_settings` ADD `reviewed_date` text;