-- Web push subscriptions for friend send alerts. A browser's endpoint is the
-- key: a device belongs to whoever subscribed on it last, so signing in as
-- someone else on a shared device moves its alerts to that account. The
-- endpoint is a capability URL; it is never logged.
CREATE TABLE `push_subscriptions` (
	`endpoint` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "push_subscriptions_endpoint_https" CHECK("push_subscriptions"."endpoint" LIKE 'https://%' AND length("push_subscriptions"."endpoint") <= 1024),
	CONSTRAINT "push_subscriptions_keys" CHECK(length("push_subscriptions"."p256dh") BETWEEN 80 AND 100 AND length("push_subscriptions"."auth") BETWEEN 16 AND 32)
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);
