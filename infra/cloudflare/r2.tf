# Holds the weekly public catalog snapshot written by the Worker cron
# (lib/catalog-export.ts). wrangler.jsonc binds the bucket by name, so the
# two must stay in sync, and this must be applied before the first deploy
# that carries the binding: wrangler validates bindings at deploy time.
resource "cloudflare_r2_bucket" "exports" {
  account_id = var.account_id
  name       = "betabook-exports"

  lifecycle {
    # A rename or relocation replaces the bucket and drops the snapshot.
    prevent_destroy = true
    ignore_changes  = [location, jurisdiction]
  }
}
