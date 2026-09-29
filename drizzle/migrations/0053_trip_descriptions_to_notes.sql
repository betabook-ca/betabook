-- A description is one line of at most 160 characters (MAX_TRIP_DESCRIPTION).
-- One written longer cannot be saved again from the trip form, so it becomes
-- the trip's notes. `notes` is new in 0051, so no trip has any to overwrite.
UPDATE trips SET notes = description, description = NULL
WHERE length(description) > 160 AND notes IS NULL;
