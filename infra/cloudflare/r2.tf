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

# Holds one square WebP profile photo per climber, written by the upload
# action and read back through /api/avatars. Deliberately not the exports
# bucket: this one holds user data that has to leave with the account, while
# the snapshot is regenerable and may yet be published on a domain of its
# own — a boundary worth drawing at the bucket rather than at a key prefix.
resource "cloudflare_r2_bucket" "avatars" {
  account_id = var.account_id
  name       = "betabook-avatars"

  lifecycle {
    # A rename or relocation replaces the bucket and drops every photo.
    prevent_destroy = true
    ignore_changes  = [location, jurisdiction]
  }
}
