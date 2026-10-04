-- A send can carry up to five videos: links to clips on YouTube or Instagram
-- that Betabook plays in place (lib/send-video.ts), stored in order as a JSON
-- array of strings, or NULL when there are none. The app only ever writes the
-- canonical form `sendVideoUrl` produces, and every reader re-parses each link
-- with `readSendVideo` before building a player URL. These triggers are the
-- backstop for every other write path: whatever lands here is a non-empty
-- array of at most five strings, each pointing at one of the two hosts and
-- holding only URL-safe characters, so no stored value can smuggle markup, a
-- script scheme or a third host into a page.
--
-- The column is new and nullable, so the previously deployed worker keeps
-- writing sends without it while CI applies this ahead of the deploy.
ALTER TABLE `sends` ADD `videos` text;--> statement-breakpoint
CREATE TRIGGER sends_reject_invalid_videos_insert
BEFORE INSERT ON sends
WHEN new.videos IS NOT NULL AND NOT (
  json_valid(new.videos) AND json_type(new.videos) = 'array'
  AND json_array_length(new.videos) BETWEEN 1 AND 5
  AND NOT EXISTS (
    SELECT 1 FROM json_each(new.videos) AS link
    WHERE link.type <> 'text' OR length(link.value) > 120
      OR NOT (link.value GLOB 'https://www.youtube.com/*' OR link.value GLOB 'https://www.instagram.com/*')
      OR link.value GLOB '*[^A-Za-z0-9_/:.?=&-]*'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'send videos must be up to five YouTube or Instagram links');
END;--> statement-breakpoint
CREATE TRIGGER sends_reject_invalid_videos_update
BEFORE UPDATE OF videos ON sends
WHEN new.videos IS NOT NULL AND NOT (
  json_valid(new.videos) AND json_type(new.videos) = 'array'
  AND json_array_length(new.videos) BETWEEN 1 AND 5
  AND NOT EXISTS (
    SELECT 1 FROM json_each(new.videos) AS link
    WHERE link.type <> 'text' OR length(link.value) > 120
      OR NOT (link.value GLOB 'https://www.youtube.com/*' OR link.value GLOB 'https://www.instagram.com/*')
      OR link.value GLOB '*[^A-Za-z0-9_/:.?=&-]*'
  )
)
BEGIN
  SELECT RAISE(ABORT, 'send videos must be up to five YouTube or Instagram links');
END;
