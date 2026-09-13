CREATE TABLE `feature_announcement_dismissals` (
	`user_id` text NOT NULL,
	`feature_id` text NOT NULL,
	PRIMARY KEY(`user_id`, `feature_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
