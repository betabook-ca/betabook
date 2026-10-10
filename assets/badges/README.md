# Achievement badge artwork

Artwork for [#200 — Add fun achievements/badges](https://github.com/betabook-ca/betabook/issues/200).
This collection prepares the visual assets and candidate meanings; it does not award badges or display them on profiles yet.

The 17 individual images are 256 × 256 lossless WebP files, each below 50,000 bytes. Their circular backings are the same opaque `#EAF7EF` (RGB 234, 247, 239), with transparent exteriors. Antialiased edges naturally blend with neighboring artwork. Keep the name, grade, threshold, and earned date outside the image as interface text.

[manifest.json](manifest.json) lists stable asset IDs, display names, filenames, dimensions, and byte counts. The [badge concepts](../../.agents/skills/betabook-badges/references/badge-concepts.md) describe the candidate achievement criteria and motifs. Thresholds remain product proposals until implementation.

Use the [Betabook badge skill](../../.agents/skills/betabook-badges/SKILL.md) to generate or revise matching artwork. The illustrations were generated with the built-in image generation tool, then their backings were normalized with user-authorized pixel editing and exported losslessly. Full-resolution editing masters are retained locally outside this asset package.

Reviewed the exports at 48 px on light and dark backgrounds. Fine shoe wear and map details simplify at that size. Keep accompanying labels visible and use empty image alt text when the label already names the achievement.

Implementation needs to define privacy-aware eligibility and progress, distinguish sessions from journal rows, and distinguish crags from nested areas. Déjà Nope means failing a later repeat after a previous send; it must not remove or invalidate the original ascent. Rating-based personality badges should not encourage dishonest grade or star votes.

Tutorials remain unchanged because this asset package adds no product workflow.
