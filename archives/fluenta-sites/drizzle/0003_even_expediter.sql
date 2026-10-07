ALTER TABLE `study_settings` ADD `daily_due_date` text;--> statement-breakpoint
ALTER TABLE `study_settings` ADD `daily_due_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `study_settings` ADD `daily_reviewed_ids` text DEFAULT '[]' NOT NULL;