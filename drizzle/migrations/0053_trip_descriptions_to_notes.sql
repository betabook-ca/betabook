-- A description was written when only its owner could see a trip, under a
-- prompt asking who came along. Anyone who can see the trip reads it now, so
-- what was written then becomes the trip's notes, which follow the journal's
-- audience. `notes` is new in 0051, so no trip has any to overwrite.
UPDATE trips SET notes = description, description = NULL
WHERE description IS NOT NULL AND notes IS NULL;
