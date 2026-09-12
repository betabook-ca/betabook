# Cloudflare infrastructure

OpenTofu stack for the `betabook.ca` zone, DNS records, managed robots.txt, the `hello@betabook.ca` Email Routing rule, the `betabook-db` D1 database, and the Turnstile widget that guards the auth forms. Spacelift plans pull requests and applies merges to `main`.

Wrangler owns the Worker: code, bindings, observability, the custom domain and its apex records, secrets, and D1 migrations. `wrangler deploy` overwrites Worker settings, routes, and custom domains, so do not manage them here. Email Routing and its DNS records are configured in the dashboard.

The Worker's `TURNSTILE_SITE_KEY` var is the `turnstile_sitekey` output, and its `TURNSTILE_SECRET_KEY` secret is the sensitive `turnstile_secret` output.

## Spacelift

- Project root `infra/cloudflare`, OpenTofu, Spacelift-managed state, protected from deletion
- Environment: `CLOUDFLARE_API_TOKEN` (secret), `TF_VAR_account_id`, `TF_VAR_hello_forward_to` (secret)
- Not a required status check, because it reports only on changes to this directory

## API token

| Scope   | Permission          | Level |
| ------- | ------------------- | ----- |
| Account | D1                  | Edit  |
| Account | Turnstile           | Edit  |
| Zone    | Zone                | Edit  |
| Zone    | DNS                 | Edit  |
| Zone    | Bot Management      | Edit  |
| Zone    | Email Routing Rules | Edit  |

## Local checks

```bash
tofu -chdir=infra/cloudflare init -backend=false
tofu -chdir=infra/cloudflare validate
tofu -chdir=infra/cloudflare fmt -check
```

After changing the provider version:

```bash
tofu -chdir=infra/cloudflare providers lock -platform=linux_amd64 -platform=darwin_arm64
```
