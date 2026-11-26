CREATE TABLE `tree_version` (
	`version` integer PRIMARY KEY NOT NULL,
	`computed_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
INSERT INTO `tree_version` (`version`) VALUES (0);
