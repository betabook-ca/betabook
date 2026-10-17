-- Who can open a climber's trips: Only me, Friends or Members, like the
-- journal audience. Members matches what every trip showed before this column,
-- so existing climbers see no change. The column has a default, so the
-- previously deployed worker keeps inserting users without it.
ALTER TABLE `user` ADD `trip_visibility` text DEFAULT 'public' NOT NULL;
