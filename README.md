# Betabook

[Betabook](https://betabook.ca) is a climbing logbook and community crag database for bouldering, sport, and trad climbing.

- Search climbs and explore the area hierarchy, with community ratings and suggested grades.
- Log ascents, repeats, climb sessions, and training in a journal with notes and tags.
- Track open projects and view send history, grade progression, and activity analytics.
- Import sends directly from a Sendage, KAYA or Mountain Project profile, or a CSV, export sends as CSV, and control profile and journal visibility separately.
- Contribute areas, climbs, and descriptions; structural changes go through moderation by admins assigned to the affected areas.
- Learn the logging workflow through an interactive Journal tutorial.

Built with Next.js 16 App Router, React 19, TypeScript, HeroUI, and Tailwind CSS. [vinext](https://vinext.dev) builds it with Vite and runs it on Cloudflare Workers; Cloudflare D1 stores data through Drizzle ORM. Better Auth handles email/password and optional Google sign-in, and Resend delivers email.

## Local development

Use Node.js 26 and the pnpm version pinned in [`package.json`](package.json).

```bash
pnpm install --frozen-lockfile
pnpm setup
pnpm dev
```

Open [localhost:3000](http://localhost:3000) and sign in with **`dev@example.com` / `password`**.

Environment, seeded test accounts, checks, UI tests and deployment are documented in the
[`betabook-dev` skill](.agents/skills/betabook-dev/SKILL.md). Architecture and conventions are in
[the repository guide](docs/repository-guide.md); [AGENTS.md](AGENTS.md) indexes the rest.

## License

Betabook is source available under the [PolyForm Noncommercial License 1.0.0](LICENSE).
Use is permitted for the purposes defined in that license; commercial use outside
those permissions requires a separate license from the copyright holder.
