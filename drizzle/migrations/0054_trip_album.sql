-- Added in place, as 0051 was: rebuilding `trips` would drop the table, and
-- that drop cascades into trip_companions and deletes every tag.
ALTER TABLE `trips` ADD `album_url` text CONSTRAINT "trips_album_url" CHECK("album_url" IS NULL OR length("album_url") <= 300);
