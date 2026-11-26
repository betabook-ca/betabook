CREATE TABLE `user_product_tours` (
	`user_id` text NOT NULL,
	`tour_id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	PRIMARY KEY(`user_id`, `tour_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `product_tour_returning` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- Existing accounts get the shorter introduction, independently of their history.
UPDATE `user` SET `product_tour_returning` = 1;
