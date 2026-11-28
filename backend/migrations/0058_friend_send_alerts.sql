-- Friend send alerts. A climber's new dated send alerts each accepted friend
-- once per climber per send date; later sends that day refresh the same row.
-- The row stores no send facts: reads join the climber's current sends,
-- friendship, privacy and both settings, so unfriending, going private or
-- switching alerts off hides an alert at once. Both user columns have
-- defaults, so the previously deployed worker keeps inserting users without
-- them.
ALTER TABLE `user` ADD `send_alerts_to_friends` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `receive_friend_send_alerts` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE TABLE `send_alerts` (
	`recipient_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`day` text NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`read_at` integer,
	PRIMARY KEY(`recipient_id`, `actor_id`, `day`),
	FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "send_alerts_day_format" CHECK("send_alerts"."day" = date("send_alerts"."day")),
	CONSTRAINT "send_alerts_not_self" CHECK("send_alerts"."recipient_id" <> "send_alerts"."actor_id")
);
--> statement-breakpoint
CREATE INDEX `send_alerts_recipient_updated_idx` ON `send_alerts` (`recipient_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `send_alerts_actor_idx` ON `send_alerts` (`actor_id`);--> statement-breakpoint
CREATE INDEX `send_alerts_unread_idx` ON `send_alerts` (`recipient_id`) WHERE `read_at` IS NULL;
