-- Who can open a climber's trips: Only me, Friends or Members, like the
-- journal audience. Every climber, existing and new, starts at Friends; before
-- this column any member could open them, so a climber who wants that back
-- chooses Members in Account settings. The profile share link opens trips
-- whatever this says; it is checked in SQL, not stored here. The column
-- has a default, so the previously deployed worker keeps inserting users
-- without it.
ALTER TABLE `user` ADD `trip_visibility` text DEFAULT 'friends' NOT NULL;
