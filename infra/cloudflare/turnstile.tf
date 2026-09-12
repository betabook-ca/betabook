# The Worker holds a copy of the secret, so a replacement fails every
# protected auth request until TURNSTILE_SECRET_KEY is updated.
resource "cloudflare_turnstile_widget" "auth" {
  account_id = var.account_id
  name       = "betabook.ca auth"
  domains    = [local.zone_name]
  mode       = "managed"
  region     = "world"

  lifecycle {
    prevent_destroy = true
  }
}

output "turnstile_sitekey" {
  value = cloudflare_turnstile_widget.auth.sitekey
}
