-- The analytics Flash card's id was "firstTry", from when it counted flashes
-- and onsights together. Onsight is now its own card, so the flash card is
-- "flash". Saved layouts are JSON text and "firstTry" appears in them only as
-- that id, so a string replace is exact. parseAnalyticsLayout also maps the old
-- id on read, so a layout read before this runs keeps its card.
UPDATE user_analytics_layouts
SET layout = replace(layout, '"firstTry"', '"flash"')
WHERE layout LIKE '%"firstTry"%';
