# Betabook

[Betabook](https://betabook.ca) is a climbing logbook and community crag database for bouldering, sport, and trad climbing.

- Search climbs and explore the area hierarchy, with community ratings and suggested grades.
- Log ascents, repeats, climb sessions, and training in a journal with notes and tags.
- Track open projects and view send history, grade progression, and activity analytics.
- Import sends directly from a Sendage, KAYA or Mountain Project profile, or a CSV, export sends as CSV, and control profile and journal visibility separately.
- Contribute areas, climbs, and descriptions; structural changes go through moderation by admins assigned to the affected areas.
- Learn the logging workflow through an interactive Journal tutorial.

Betabook runs a Rust Cloudflare Worker backed by D1 and R2. A Vite-built React Router app provides the member workspace and public catalog. Rust verifies existing account credentials and signed session cookies.

## Repository layout

- [Frontend](frontend/) contains the SPA, React components, hooks, styles, assets, and Storybook.
- [Backend](backend/) contains the Rust Worker, domain and database crates, and D1 migrations.
- [Shared](shared/) contains the tutorial step registry consumed by the SPA and the Worker. The [OpenAPI contract](api/README.md) describes the HTTP routes and types consumed by the SPA.
- [Reference tests](test/reference/) preserve the previous server for migration parity checks.

## Local development

Activate mise in your shell to use the project’s pinned Node.js, pnpm, and Rust tools.

```bash
mise install
pnpm install --frozen-lockfile
pnpm setup
mise run dev
```

Open [localhost:3000](http://localhost:3000) and sign in with **`dev@example.com` / `password`**. On subsequent runs, `mise run dev` (or `pnpm dev`) is enough. Saving Rust or frontend code rebuilds the affected side and reloads the browser. For React Fast Refresh, leave Wrangler running on 3000 and run `pnpm dev:spa` in another terminal, then open port 3001.

Environment, seeded test accounts, checks, UI tests and deployment are documented in the
[`betabook-dev` skill](.agents/skills/betabook-dev/SKILL.md). Architecture and conventions are in
[the repository guide](docs/repository-guide.md); [AGENTS.md](AGENTS.md) indexes the rest.

## License

Betabook is source available under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Use is permitted for the purposes defined in that license; commercial use outside
those permissions requires a separate license from the copyright holder.
