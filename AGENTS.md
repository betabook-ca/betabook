<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Agent guide contents

- [Setup, local accounts, scripts and deployment](README.md)
- [Cloudflare infrastructure (OpenTofu and Spacelift)](infra/cloudflare/README.md)
- [Working on Betabook](docs/repository-guide.md)
  - [Code map](docs/repository-guide.md#code-map)
  - [Runtime (vinext)](docs/repository-guide.md#runtime)
  - [Boundaries and conventions](docs/repository-guide.md#boundaries-and-conventions)
  - [Data invariants, migrations and bindings](docs/repository-guide.md#data-rules-to-preserve)
  - [Routes and metadata](docs/repository-guide.md#routes-and-metadata)
  - [UI and story requirements](docs/repository-guide.md#design-system-and-ui-regressions)
  - [Tutorial requirements](docs/repository-guide.md#product-tutorials)
  - [Testing workflow and required checks](docs/repository-guide.md#testing-and-validation)
- [Choosing and writing tests](docs/component-testing.md)
  - [Path and filename rules](docs/component-testing.md#match-the-path-and-suffix)
  - [jsdom tests](docs/component-testing.md#jsdom-rules)
  - [Workers and D1 tests](docs/component-testing.md#workers-rules)
  - [Browser tests](docs/component-testing.md#browser-rules)
  - [Stories](docs/component-testing.md#story-rules)
- [Design system and visual review](docs/design-system.md)
- [Product tour implementation](docs/product-tours.md)
- [Component test instructions](components/AGENTS.md)
- [Browser test instructions](tests/ui/AGENTS.md)

- [Journal goal invariants](docs/goals.md)
