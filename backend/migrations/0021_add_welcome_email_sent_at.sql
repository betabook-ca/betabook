-- Marks an account as already welcomed, so the afterEmailVerification hook
-- sends at most one welcome email per user. Nullable and unindexed: it is only
-- ever read by id, on the verification request that also writes it.
--
-- CI applies migrations before the worker deploy, so this has to be readable
-- by the currently-deployed code too — a nullable ADD COLUMN is invisible to it.
ALTER TABLE `user` ADD `welcome_email_sent_at` integer;--> statement-breakpoint
-- Everyone already verified predates the welcome email and is long past being
-- welcomed. Stamping them now is what keeps a later email change — the other
-- path through afterEmailVerification — from mailing an established user.
UPDATE `user` SET `welcome_email_sent_at` = cast(unixepoch('subsecond') * 1000 as integer) WHERE `email_verified` = 1;
