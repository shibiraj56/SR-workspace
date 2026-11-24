CREATE TABLE `departments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`organisation_id` text,
	`name` text NOT NULL,
	`code` text NOT NULL,
	`description` text,
	`department_head_id` text,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `departments_tenant_idx` ON `departments` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `departments_tenant_code_unique` ON `departments` (`tenant_id`,`code`);--> statement-breakpoint
CREATE INDEX `departments_status_idx` ON `departments` (`status`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`organisation_id` text,
	`branch_id` text,
	`employee_code` text NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`work_email` text,
	`personal_email` text,
	`phone` text,
	`job_title` text,
	`department_id` text,
	`manager_employee_id` text,
	`user_id` text,
	`employment_type` text DEFAULT 'FULL_TIME' NOT NULL,
	`joining_date` integer NOT NULL,
	`employment_status` text DEFAULT 'ACTIVE' NOT NULL,
	`profile_image_url` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`created_by` text,
	`updated_by` text,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organisation_id`) REFERENCES `organisations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `employees_tenant_idx` ON `employees` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_tenant_code_unique` ON `employees` (`tenant_id`,`employee_code`);--> statement-breakpoint
CREATE INDEX `employees_department_idx` ON `employees` (`department_id`);--> statement-breakpoint
CREATE INDEX `employees_manager_idx` ON `employees` (`manager_employee_id`);--> statement-breakpoint
CREATE INDEX `employees_user_idx` ON `employees` (`user_id`);--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`employment_status`);--> statement-breakpoint
CREATE INDEX `employees_work_email_idx` ON `employees` (`work_email`);