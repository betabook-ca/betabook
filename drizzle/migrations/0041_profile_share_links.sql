CREATE TABLE `profile_share_links` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profile_share_links_token_unique` ON `profile_share_links` (`token`);--> statement-breakpoint
-- drizzle-kit generates this reference without its ON DELETE action.
ALTER TABLE `user` ADD `referred_by` text REFERENCES `user`(`id`) ON DELETE set null;--> statement-breakpoint
CREATE INDEX `user_referred_by_idx` ON `user` (`referred_by`);--> statement-breakpoint
INSERT INTO profile_share_links (user_id, token)
SELECT id, lower(hex(randomblob(16))) FROM user;
--> statement-breakpoint
CREATE TRIGGER profile_share_link_issue AFTER INSERT ON user
BEGIN
  INSERT INTO profile_share_links (user_id, token) VALUES (NEW.id, lower(hex(randomblob(16))));
END;
--> statement-breakpoint
-- Links issued before a profile went private must stay dead once it is public again.
CREATE TRIGGER profile_share_link_revoke_on_private AFTER UPDATE OF is_private ON user
WHEN NEW.is_private AND NOT OLD.is_private
BEGIN
  UPDATE profile_share_links SET token = lower(hex(randomblob(16))) WHERE user_id = NEW.id;
END;
