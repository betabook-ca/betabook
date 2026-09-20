CREATE TABLE `project_share_links` (
	`token` text PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))) NOT NULL,
	`user_id` text NOT NULL,
	`climb_id` integer NOT NULL,
	`audience` text NOT NULL,
	`expires_at` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`climb_id`) REFERENCES `pinned_projects`(`user_id`,`climb_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_share_links_audience" CHECK("project_share_links"."audience" IN ('everyone', 'public', 'friends')),
	CONSTRAINT "project_share_links_expires_at_format" CHECK("project_share_links"."expires_at" IS NULL OR "project_share_links"."expires_at" = datetime("project_share_links"."expires_at"))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `project_share_links_project_idx` ON `project_share_links` (`user_id`,`climb_id`);--> statement-breakpoint
-- A link is the owner's standing consent to show one project to a stranger.
-- Going private withdraws it, and 0041 established that the withdrawal has to
-- survive the profile becoming public again: there, the token is rotated so
-- links already handed out stay dead. Here the whole row goes, because the
-- audience and expiry were chosen for a profile that was public and should not
-- silently come back into force months later.
--
-- Deleting rather than rotating means the action, not this trigger, has to
-- know which paths to purge: `setUserPrivate` reads the tokens before it
-- writes. Keep the body flat -- the remote D1 migration parser differs from
-- the local statement splitter on nested CASE/END blocks.
CREATE TRIGGER project_share_revoke_on_private AFTER UPDATE OF is_private ON user
WHEN NEW.is_private AND NOT OLD.is_private
BEGIN
  DELETE FROM project_share_links WHERE user_id = NEW.id;
END;
