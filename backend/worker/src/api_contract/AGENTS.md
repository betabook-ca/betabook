# Betabook HTTP API

The Rust Worker generates [the OpenAPI 3.1 document](../../../../openapi.json) from its route registry, response models and action descriptors. The release build also serves the document at `/openapi.json`. The browser uses generated TypeScript declarations at compile time.

Run `pnpm api:generate` after changing an API. Commit both the JSON document and the generated declarations. `pnpm api:check` regenerates them in memory and fails on differences or missing route coverage. Workerd smoke tests validate JSON responses against the same schemas, including responses from the deployed action dispatch code.

Use the typed `fetchApi` helper for JSON reads. Pass the OpenAPI path template, path parameters and query parameters. Streaming and file endpoints can use the typed URL builder with the existing stream reader. Component actions use named functions from the SPA action client. Each name maps to a documented POST with its own positional arguments and result. Profile photos use multipart form data.

Response schemas use Serde's serialization contract, and input schemas use its deserialization contract. When adding an endpoint that assembles JSON dynamically, declare its complete wire shape and exercise it through the real Worker. Keep test-only schema generation out of the release WASM.
