CREATE TABLE `user_analytics_layouts` (
	`user_id` text PRIMARY KEY NOT NULL,
	`layout` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
