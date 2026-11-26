CREATE TABLE `year_review_share_links` (
	`token` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`user_id` text NOT NULL,
	`year` integer NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "year_review_share_links_year" CHECK("year_review_share_links"."year" BETWEEN 1950 AND 9999),
	CONSTRAINT "year_review_share_links_expires_at_format" CHECK("year_review_share_links"."expires_at" IS NULL OR "year_review_share_links"."expires_at" = datetime("year_review_share_links"."expires_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `year_review_share_links_year_idx` ON `year_review_share_links` (`user_id`,`year`);
--> statement-breakpoint
-- Going private revokes every year-in-review link, the same way it revokes
-- project, trip and list links. The predicate in
-- db/queries/year-review-shares.ts also refuses a private owner, which covers
-- a link written in the same moment the profile was closing.
CREATE TRIGGER year_review_share_revoke_on_private AFTER UPDATE OF is_private ON user
WHEN NEW.is_private AND NOT OLD.is_private
BEGIN
  DELETE FROM year_review_share_links WHERE user_id = NEW.id;
END;