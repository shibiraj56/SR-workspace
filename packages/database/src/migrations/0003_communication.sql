CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`message_id` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`file_size` integer NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploaded_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_tenant_idx` ON `attachments` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `attachments_msg_idx` ON `attachments` (`message_id`);--> statement-breakpoint
CREATE TABLE `conversation_members` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'MEMBER' NOT NULL,
	`last_read_at` integer,
	`muted_at` integer,
	`is_active` integer DEFAULT true NOT NULL,
	`joined_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conv_members_tenant_idx` ON `conversation_members` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `conv_members_conv_idx` ON `conversation_members` (`conversation_id`);--> statement-breakpoint
CREATE INDEX `conv_members_user_idx` ON `conversation_members` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conv_members_unique_idx` ON `conversation_members` (`tenant_id`,`conversation_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_type` text NOT NULL,
	`name` text,
	`description` text,
	`project_id` text,
	`direct_user1_id` text,
	`direct_user2_id` text,
	`created_by` text NOT NULL,
	`last_message_at` integer,
	`last_message_preview` text,
	`is_archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`direct_user1_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`direct_user2_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversations_tenant_idx` ON `conversations` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `conversations_type_idx` ON `conversations` (`tenant_id`,`conversation_type`);--> statement-breakpoint
CREATE INDEX `conversations_last_msg_idx` ON `conversations` (`tenant_id`,`last_message_at`);--> statement-breakpoint
CREATE INDEX `conversations_project_idx` ON `conversations` (`project_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_direct_canonical_idx` ON `conversations` (`tenant_id`,`direct_user1_id`,`direct_user2_id`);--> statement-breakpoint
CREATE TABLE `message_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`message_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reaction` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `msg_reactions_tenant_idx` ON `message_reactions` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `msg_reactions_msg_idx` ON `message_reactions` (`message_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `msg_reactions_unique_idx` ON `message_reactions` (`tenant_id`,`message_id`,`user_id`,`reaction`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`sender_user_id` text NOT NULL,
	`message_type` text DEFAULT 'TEXT' NOT NULL,
	`content` text NOT NULL,
	`reply_to_message_id` text,
	`edited_at` integer,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_tenant_idx` ON `messages` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `messages_conv_created_idx` ON `messages` (`tenant_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `messages_sender_idx` ON `messages` (`sender_user_id`);--> statement-breakpoint
CREATE INDEX `messages_reply_idx` ON `messages` (`reply_to_message_id`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`recipient_user_id` text NOT NULL,
	`actor_user_id` text,
	`type` text NOT NULL,
	`conversation_id` text,
	`message_id` text,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`is_read` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`message_id`) REFERENCES `messages`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_tenant_recipient_idx` ON `notifications` (`tenant_id`,`recipient_user_id`,`is_read`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_conv_idx` ON `notifications` (`conversation_id`);