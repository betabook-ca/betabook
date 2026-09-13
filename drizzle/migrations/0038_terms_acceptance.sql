CREATE TABLE `user_terms_acceptances` (
	`user_id` text NOT NULL,
	`version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `version`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user` ADD `terms_version` text;--> statement-breakpoint
ALTER TABLE `user` ADD `terms_accepted_at` integer;
--> statement-breakpoint
CREATE TRIGGER user_terms_acceptance_insert AFTER INSERT ON user
WHEN NEW.terms_version IS NOT NULL AND NEW.terms_accepted_at IS NOT NULL
BEGIN
  INSERT INTO user_terms_acceptances (user_id, version, accepted_at)
  VALUES (NEW.id, NEW.terms_version, NEW.terms_accepted_at)
  ON CONFLICT (user_id, version) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER user_terms_acceptance_update AFTER UPDATE OF terms_version, terms_accepted_at ON user
WHEN NEW.terms_version IS NOT NULL AND NEW.terms_accepted_at IS NOT NULL
BEGIN
  INSERT INTO user_terms_acceptances (user_id, version, accepted_at)
  VALUES (NEW.id, NEW.terms_version, NEW.terms_accepted_at)
  ON CONFLICT (user_id, version) DO NOTHING;
END;
--> statement-breakpoint
CREATE TRIGGER user_terms_acceptance_immutable BEFORE UPDATE ON user_terms_acceptances
BEGIN
  SELECT RAISE(ABORT, 'Terms acceptance history cannot be changed');
END;
