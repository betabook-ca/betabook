ALTER TABLE `climbs` ADD `lft` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `climbs` ADD `rght` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `climbs` ADD `send_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `climbs` ADD `rating_sum` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `climbs` ADD `rating_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `climbs` ADD `avg_rating` real GENERATED ALWAYS AS (CASE WHEN rating_count > 0 THEN CAST(rating_sum AS REAL) / rating_count ELSE NULL END) VIRTUAL;