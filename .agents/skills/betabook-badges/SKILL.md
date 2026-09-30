---
name: betabook-badges
description: Generate fun, on-brand illustrated achievement badge images for Betabook profiles, including new badges and consistent sets or variants. Use for badge artwork and climbing personality stickers, not achievement logic, profile implementation, or changes to the existing vector logo and UI icons.
---

# Betabook badges

Create collectible climbing illustrations with dry humor, simple shapes, and the character of a small climbing club's printed stickers. The image should communicate one idea at profile size. Generate actual raster artwork when requested; do not stop at prompts or substitute emoji, HTML, or SVG placeholders. Prompt-only requests should return prompts without generating images.

## Brand and art direction

Betabook is a calm, practical climbing logbook with a paper/ink identity, condensed headings, and direct language. This badge illustration direction is a proposed extension of that identity, not an existing approved asset system.

When working in the Betabook repository, consult `app/globals.css` and `stories/foundations/brand-and-style.stories.tsx` for current brand decisions. Inspect relevant images in `assets/branding/` if needed. Outside the repository, use this baseline without requiring those files:

- Ink `#000000`, pale green paper `#eaf7ef`, green `#83ba73`, support blue `#557bb5`, muted rose `#a4585a`.
- Use ink and paper with one dominant accent; an occasional second accent is enough. Treat hex colors as generation targets, not verified exact pixel values.
- The logo contains a coral sun, but the current UI uses muted rose. Default badges to the UI palette; do not copy the logo or place a mountain/checkmark on every badge.
- Default medium: flat spot-color illustration, like a screenprinted climbing-club sticker. Confident thick contours, gently uneven curves, broad cut-paper shapes, generous negative space. Slight asymmetry should come from drawing decisions, not random distress.
- Background requirement: every badge uses the identical flat, opaque pale mint `#EAF7EF` (RGB 234, 247, 239) circular backing with a transparent exterior. No per-badge tints, gradients, lighting, grain, or color variation in that backing. Preserve foreground colors and black perimeter outlines. Check the actual decoded exports, not just the prompt; lossy export may shift colors, so prefer lossless compression when exact backing color is required.
- Default shape: a softly irregular circular paper field, consistent across the collection, with transparent exterior. Let the subject occupy roughly two-thirds of the canvas. Maintain enough inset that hands, arrows, and gear are never clipped.
- Design for 48–64 px profile display, with a recognizable silhouette at 32 px. A single main object and at most one supporting gesture usually suffice. Texture is optional and subtle; it must not be responsible for readability.
- Keep badge names, thresholds, and grades outside the illustration, rendered by the app. Default artwork contains no lettering, numbers, ribbons, or wordmarks. Honor explicit requests for lettering, but inspect it carefully.

Translate “not super AI looking” into these concrete choices. Avoid glossy 3D enamel, metallic bevels, dramatic light, gradients, glow, trophy shields, ornamental laurels, generic mountain sunsets, emoji-like stock characters, huge cute eyes, excessive sparkles, and decorative microdetail. Do not add grunge everywhere to simulate human drawing. User-supplied style references override this default direction.

## Concept selection

Use the requested badge name and meaning. If only a known name is provided, read [references/badge-concepts.md](references/badge-concepts.md) for its candidate meaning and visual starting point. These thresholds are brainstorming context, not implemented product rules.

Choose one visual joke tied to the behavior: a weighted grade tag for Sandbagger, an affectionately worn rock for Never Gets Old. Avoid using the same rock-with-a-face for the whole collection. Humor should feel affectionate toward the climber. It should not depend on humiliation, ability level, or an achievement caption to make the silhouette interesting.

For an unfamiliar badge, infer a reasonable concept from the user's description. Ask only when its meaning is essential and cannot be inferred. Do not require art-direction approval before fulfilling an already requested image or set.

## Generate and maintain a collection

Use the available built-in image generation tool and follow the installed imagegen skill when available. Do not invent model controls, output paths, or unsupported tool parameters. Do not silently switch to an API/CLI workflow if generation fails; report the limitation.

For one badge, generate one strong concept unless variants were requested. For a requested set, generate one asset per badge. Use the first successful badge as a style reference for subsequent assets, preserving field shape, contour weight, palette, subject scale, and texture restraint while changing the motif. A contact sheet is only a preview, not a substitute for individual deliverables.

Inspect local reference images before passing them to image generation. Identify each input as either a style reference or an edit target. When changing a badge, state what must stay fixed. Prefer a user's approved badge as the collection reference; do not describe an unreviewed result as approved.

Adapt this prompt skeleton:

```text
Use case: illustration-story
Asset type: small Betabook profile achievement badge, standalone raster illustration
Meaning: [badge name and behavior, for context only; do not print these words]
Subject: [one clear motif and one visual joke]
Medium: flat spot-color climbing-club sticker illustration; confident thick ink contours,
gently irregular cut-paper shapes, quiet asymmetry, minimal internal detail
Palette: black #000000, pale green paper #eaf7ef, [one brand accent and hex]
Composition: centered motif, consistent softly irregular circular paper field,
generous inset; square canvas; designed to read at 48 px
Background: identical solid #EAF7EF backing, no gradients or texture; actual transparent pixels outside the paper badge, no checkerboard artwork
Text: none
Constraints: [reference invariants if any]; plausible simplified climbing objects;
no gloss, 3D, gradients, bevels, glow, lettering, ornamental frames, or tiny decorative detail
```

Request a large square master, ideally 1024 × 1024, through supported tool inputs or the prompt. Keep the actual returned dimensions in delivery notes if different. Ask for real transparency; a checkerboard drawn into an opaque image is a failed result.

## Review and deliver

Inspect the actual output before calling it finished. Check the concept, unwanted text, awkward anatomy or gear, clipped edges, silhouette, and consistency with any supplied reference. Preview at profile size on both pale paper and dark ink backgrounds when tooling permits. Verify alpha and dimensions using available image metadata tools; do not claim verification from a prompt alone. Use the image generation tool for artwork edits, including background fixes.

If a result fails, make a targeted revision that preserves the successful parts. Avoid endless variations: after two focused revision attempts, show the best result and identify the unresolved issue instead of claiming it is production-ready.

For brainstorming, show the image inline. For project assets, copy the final output into the user's requested location or `output/badges/` in the current workspace, using descriptive versioned names such as `never-gets-old-v1.png`; preserve existing files. Save a short adjacent prompt note with the badge meaning, final prompt, style reference if used, and any review limitations so later badges can match it. Keep the transparent master. For this collection, each delivered badge image must be strictly below 50,000 bytes; keep larger archival masters separate. Prefer 512 px lossless WebP, reducing export dimensions if needed, and verify actual file size and decoded backing color. Use direct pixel editing for color normalization only when the user has authorized that method; otherwise use image generation and disclose any unresolved color drift. Do not wire images into the profile, change achievement rules, or publish anything unless that work was requested.

Deliver the image preview, file link, and a brief concept explanation. Distinguish generated artwork from any checks that could not be completed.
