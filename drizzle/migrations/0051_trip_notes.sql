-- Added in place. Rebuilding `trips` to add the CHECK would drop the table,
-- and that drop cascades into trip_share_links and deletes every link.
ALTER TABLE `trips` ADD `notes` text CONSTRAINT "trips_notes" CHECK("notes" IS NULL OR length("notes") <= 50000);
