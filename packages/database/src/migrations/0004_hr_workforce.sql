CREATE TABLE `attendance_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`shift_id` text,
	`date` text NOT NULL,
	`punch_in_time` integer,
	`punch_out_time` integer,
	`total_work_minutes` integer DEFAULT 0 NOT NULL,
	`total_break_minutes` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'PRESENT' NOT NULL,
	`punch_in_ip` text,
	`punch_out_ip` text,
	`punch_in_note` text,
	`punch_out_note` text,
	`remarks` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_tenant_emp_date_uidx` ON `attendance_records` (`tenant_id`,`employee_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_tenant_date_idx` ON `attendance_records` (`tenant_id`,`date`);--> statement-breakpoint
CREATE INDEX `attendance_tenant_emp_idx` ON `attendance_records` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `attendance_status_idx` ON `attendance_records` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `attendance_regularizations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`attendance_record_id` text,
	`employee_id` text NOT NULL,
	`date` text NOT NULL,
	`requested_punch_in` integer NOT NULL,
	`requested_punch_out` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewed_by_employee_id` text,
	`review_notes` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attendance_record_id`) REFERENCES `attendance_records`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `regularization_tenant_emp_idx` ON `attendance_regularizations` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `regularization_record_idx` ON `attendance_regularizations` (`attendance_record_id`);--> statement-breakpoint
CREATE INDEX `regularization_status_idx` ON `attendance_regularizations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `employee_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`shift_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`assigned_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`shift_id`) REFERENCES `shifts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `emp_shifts_tenant_emp_idx` ON `employee_shifts` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `emp_shifts_shift_idx` ON `employee_shifts` (`shift_id`);--> statement-breakpoint
CREATE INDEX `emp_shifts_dates_idx` ON `employee_shifts` (`tenant_id`,`effective_from`,`effective_to`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`holiday_type` text DEFAULT 'MANDATORY' NOT NULL,
	`description` text,
	`applicable_branch_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`applicable_branch_id`) REFERENCES `branches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `holidays_tenant_idx` ON `holidays` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_tenant_date_uidx` ON `holidays` (`tenant_id`,`date`);--> statement-breakpoint
CREATE TABLE `hr_document_metadata` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`document_type` text NOT NULL,
	`document_number` text,
	`issued_date` text,
	`expiry_date` text,
	`verification_status` text DEFAULT 'PENDING' NOT NULL,
	`verified_by_employee_id` text,
	`verified_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`verified_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `doc_meta_emp_idx` ON `hr_document_metadata` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `doc_meta_type_idx` ON `hr_document_metadata` (`tenant_id`,`document_type`);--> statement-breakpoint
CREATE INDEX `doc_meta_status_idx` ON `hr_document_metadata` (`tenant_id`,`verification_status`);--> statement-breakpoint
CREATE TABLE `hr_exit_checklists` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`resignation_id` text NOT NULL,
	`department` text NOT NULL,
	`item` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`cleared_by_employee_id` text,
	`cleared_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resignation_id`) REFERENCES `hr_resignations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cleared_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `exit_checklists_resig_idx` ON `hr_exit_checklists` (`tenant_id`,`resignation_id`);--> statement-breakpoint
CREATE INDEX `exit_checklists_status_idx` ON `hr_exit_checklists` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `hr_lifecycle_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`event_type` text NOT NULL,
	`previous_state` text,
	`new_state` text NOT NULL,
	`effective_date` text NOT NULL,
	`remarks` text,
	`recorded_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `lifecycle_events_emp_idx` ON `hr_lifecycle_events` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `lifecycle_events_type_idx` ON `hr_lifecycle_events` (`tenant_id`,`event_type`);--> statement-breakpoint
CREATE TABLE `hr_onboarding_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'DOCUMENTATION' NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`assigned_to_employee_id` text,
	`due_date` text,
	`completed_at` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_to_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `onboarding_tasks_emp_idx` ON `hr_onboarding_tasks` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `onboarding_tasks_status_idx` ON `hr_onboarding_tasks` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `hr_resignations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`resignation_date` text NOT NULL,
	`proposed_last_working_date` text NOT NULL,
	`actual_last_working_date` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'SUBMITTED' NOT NULL,
	`manager_comments` text,
	`exit_interview_notes` text,
	`reviewed_by_employee_id` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewed_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `resignations_emp_idx` ON `hr_resignations` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `resignations_status_idx` ON `hr_resignations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `leave_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`year` integer NOT NULL,
	`allocated_days` real DEFAULT 0 NOT NULL,
	`used_days` real DEFAULT 0 NOT NULL,
	`pending_days` real DEFAULT 0 NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leave_alloc_tenant_emp_type_year_uidx` ON `leave_allocations` (`tenant_id`,`employee_id`,`leave_type_id`,`year`);--> statement-breakpoint
CREATE INDEX `leave_alloc_tenant_emp_idx` ON `leave_allocations` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE TABLE `leave_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`leave_type_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`total_days` real NOT NULL,
	`is_half_day` integer DEFAULT false NOT NULL,
	`half_day_period` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reviewed_by_employee_id` text,
	`review_notes` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`leave_type_id`) REFERENCES `leave_types`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`reviewed_by_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `leave_requests_tenant_emp_idx` ON `leave_requests` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `leave_requests_tenant_status_idx` ON `leave_requests` (`tenant_id`,`status`);--> statement-breakpoint
CREATE INDEX `leave_requests_dates_idx` ON `leave_requests` (`tenant_id`,`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `leave_types` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_days_per_year` real DEFAULT 0 NOT NULL,
	`is_paid` integer DEFAULT true NOT NULL,
	`requires_proof` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leave_types_tenant_idx` ON `leave_types` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `leave_types_tenant_code_uidx` ON `leave_types` (`tenant_id`,`code`);--> statement-breakpoint
CREATE TABLE `performance_cycles` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `perf_cycles_tenant_code_uidx` ON `performance_cycles` (`tenant_id`,`code`);--> statement-breakpoint
CREATE INDEX `perf_cycles_tenant_status_idx` ON `performance_cycles` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `performance_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`cycle_id` text NOT NULL,
	`employee_id` text NOT NULL,
	`reviewer_employee_id` text,
	`self_rating` real,
	`self_feedback` text,
	`manager_rating` real,
	`manager_feedback` text,
	`goals_met` text,
	`final_score` real,
	`status` text DEFAULT 'PENDING_SELF_REVIEW' NOT NULL,
	`self_submitted_at` integer,
	`manager_submitted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cycle_id`) REFERENCES `performance_cycles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reviewer_employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `perf_reviews_cycle_emp_uidx` ON `performance_reviews` (`tenant_id`,`cycle_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `perf_reviews_tenant_emp_idx` ON `performance_reviews` (`tenant_id`,`employee_id`);--> statement-breakpoint
CREATE INDEX `perf_reviews_reviewer_idx` ON `performance_reviews` (`tenant_id`,`reviewer_employee_id`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`grace_period_minutes` integer DEFAULT 15 NOT NULL,
	`half_day_threshold_minutes` integer DEFAULT 240 NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shifts_tenant_idx` ON `shifts` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `shifts_tenant_code_uidx` ON `shifts` (`tenant_id`,`code`);