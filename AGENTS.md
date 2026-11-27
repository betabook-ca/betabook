# Betabook

Betabook is a climbing logbook and community crag database. The [Rust backend](backend/AGENTS.md) serves a [React SPA](frontend/AGENTS.md) on Cloudflare. See the [license](LICENSE) for terms of use.

## Find the relevant guidance

- For setup, seeded accounts or deployment, use the [development skill](.agents/skills/betabook-dev/SKILL.md). Infrastructure changes have a [Cloudflare guide](infra/cloudflare/AGENTS.md).
- For changes to product behavior, read the matching [feature reference](docs/features/). For tests, use the [runner selection guide](docs/testing/selection.md).
- Keep instructions that apply to a directory in its nearest `AGENTS.md`. Put detailed feature rules and procedures in ordinary reference files and link them where the task begins.

## Verification

For behavior changes, run a focused test red and then green. When adding coverage for existing behavior, demonstrate the failure with a temporary regression, restore the implementation and confirm green. Record the focused commands and outcomes in the PR.

Run `pnpm check` before committing. Run `pnpm build` for runtime, dependency, route or Cloudflare configuration changes. For documentation edits, check formatting and references.
