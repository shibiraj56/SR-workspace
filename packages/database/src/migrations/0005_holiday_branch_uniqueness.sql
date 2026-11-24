DROP INDEX `holidays_tenant_date_uidx`;--> statement-breakpoint
CREATE INDEX `holidays_branch_idx` ON `holidays` (`applicable_branch_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_global_uidx` ON `holidays` (`tenant_id`, `date`) WHERE `applicable_branch_id` IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_branch_uidx` ON `holidays` (`tenant_id`, `date`, `applicable_branch_id`) WHERE `applicable_branch_id` IS NOT NULL;
