-- Trip share links are back, at /trips/{token}. Rows left from the first
-- version (0050, read until #353) were made under different copy and have not
-- answered since that release, so none of them comes back to life: a climber
-- who wants a trip link makes a new one from the trip page. The table and its
-- trip_share_revoke_on_private trigger are otherwise unchanged.
DELETE FROM trip_share_links;
