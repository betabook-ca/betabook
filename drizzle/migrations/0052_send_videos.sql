-- A send can carry one video: a link to a clip on YouTube or Instagram that
-- Betabook plays in place (lib/send-video.ts). The app only ever writes the
-- canonical form `sendVideoUrl` produces, and every reader re-parses it with
-- `readSendVideo` before building a player URL. These triggers are the backstop
-- for every other write path: whatever lands here points at one of the two
-- hosts and holds only URL-safe characters, so no stored value can smuggle
-- markup, a script scheme or a third host into a page.
--
-- The column is new and nullable, so the previously deployed worker keeps
-- writing sends without it while CI applies this ahead of the deploy.
ALTER TABLE `sends` ADD `video_url` text;--> statement-breakpoint
CREATE TRIGGER sends_reject_invalid_video_insert
BEFORE INSERT ON sends
WHEN new.video_url IS NOT NULL AND NOT (
  length(new.video_url) <= 120
  AND (new.video_url GLOB 'https://www.youtube.com/*' OR new.video_url GLOB 'https://www.instagram.com/*')
  AND new.video_url NOT GLOB '*[^A-Za-z0-9_/:.?=&-]*'
)
BEGIN
  SELECT RAISE(ABORT, 'send video must be a YouTube or Instagram link');
END;--> statement-breakpoint
CREATE TRIGGER sends_reject_invalid_video_update
BEFORE UPDATE OF video_url ON sends
WHEN new.video_url IS NOT NULL AND NOT (
  length(new.video_url) <= 120
  AND (new.video_url GLOB 'https://www.youtube.com/*' OR new.video_url GLOB 'https://www.instagram.com/*')
  AND new.video_url NOT GLOB '*[^A-Za-z0-9_/:.?=&-]*'
)
BEGIN
  SELECT RAISE(ABORT, 'send video must be a YouTube or Instagram link');
END;
