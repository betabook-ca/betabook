-- Restores user.image for OAuth profile avatars. Better Auth's Drizzle adapter
-- validates that any field provided during OAuth user creation exists in the
-- schema, so this nullable column avoids registration errors when Google
-- returns a profile picture.
ALTER TABLE `user` ADD `image` text;