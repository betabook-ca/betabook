CREATE TABLE `admin_area_scopes` (
	`user_id` text NOT NULL,
	`area_id` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `area_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `admin_area_scopes_area_idx` ON `admin_area_scopes` (`area_id`);--> statement-breakpoint
CREATE TABLE `change_request_approvals` (
	`request_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	PRIMARY KEY(`request_id`, `user_id`),
	FOREIGN KEY (`request_id`) REFERENCES `change_requests`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `change_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`payload` text NOT NULL,
	`requested_by` text,
	`requested_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`review_note` text,
	FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `change_requests_status_idx` ON `change_requests` (`status`);--> statement-breakpoint
CREATE INDEX `change_requests_entity_idx` ON `change_requests` (`type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `change_requests_requested_by_idx` ON `change_requests` (`requested_by`);--> statement-breakpoint
CREATE UNIQUE INDEX `change_requests_pending_unique` ON `change_requests` (`type`,`entity_id`,`requested_by`) WHERE status = 'pending';