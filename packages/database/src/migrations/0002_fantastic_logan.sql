CREATE TABLE `project_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`project_role` text DEFAULT 'MEMBER' NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_members_tenant_idx` ON `project_members` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `project_members_project_idx` ON `project_members` (`project_id`);--> statement-breakpoint
CREATE INDEX `project_members_employee_idx` ON `project_members` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_members_project_employee_idx` ON `project_members` (`project_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'PLANNING' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`owner_employee_id` text NOT NULL,
	`department_id` text,
	`start_date` integer,
	`due_date` integer,
	`completed_at` integer,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`department_id`) REFERENCES `departments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `projects_tenant_idx` ON `projects` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `projects_tenant_code_idx` ON `projects` (`tenant_id`,`project_code`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_employee_id`);--> statement-breakpoint
CREATE INDEX `projects_department_idx` ON `projects` (`department_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `projects_priority_idx` ON `projects` (`priority`);--> statement-breakpoint
CREATE INDEX `projects_due_date_idx` ON `projects` (`due_date`);--> statement-breakpoint
CREATE TABLE `task_activity` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`task_id` text NOT NULL,
	`actor_user_id` text,
	`action` text NOT NULL,
	`old_value` text,
	`new_value` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `task_activity_tenant_idx` ON `task_activity` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `task_activity_task_idx` ON `task_activity` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_activity_created_idx` ON `task_activity` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `task_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`task_id` text NOT NULL,
	`author_user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`task_id`) REFERENCES `tasks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_comments_tenant_idx` ON `task_comments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `task_comments_task_idx` ON `task_comments` (`task_id`);--> statement-breakpoint
CREATE INDEX `task_comments_author_idx` ON `task_comments` (`author_user_id`);--> statement-breakpoint
CREATE INDEX `task_comments_created_idx` ON `task_comments` (`task_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_code` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'TODO' NOT NULL,
	`priority` text DEFAULT 'MEDIUM' NOT NULL,
	`assignee_employee_id` text,
	`reporter_employee_id` text,
	`parent_task_id` text,
	`start_date` integer,
	`due_date` integer,
	`completed_at` integer,
	`position` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`updated_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reporter_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `tasks_tenant_idx` ON `tasks` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `tasks_project_idx` ON `tasks` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `tasks_tenant_code_idx` ON `tasks` (`tenant_id`,`task_code`);--> statement-breakpoint
CREATE INDEX `tasks_assignee_idx` ON `tasks` (`assignee_employee_id`);--> statement-breakpoint
CREATE INDEX `tasks_reporter_idx` ON `tasks` (`reporter_employee_id`);--> statement-breakpoint
CREATE INDEX `tasks_status_idx` ON `tasks` (`status`);--> statement-breakpoint
CREATE INDEX `tasks_priority_idx` ON `tasks` (`priority`);--> statement-breakpoint
CREATE INDEX `tasks_due_date_idx` ON `tasks` (`due_date`);--> statement-breakpoint
CREATE INDEX `tasks_position_idx` ON `tasks` (`project_id`,`status`,`position`);--> statement-breakpoint
CREATE INDEX `tasks_parent_task_idx` ON `tasks` (`parent_task_id`);