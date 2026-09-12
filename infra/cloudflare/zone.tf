locals {
  zone_name = "betabook.ca"
}

resource "cloudflare_zone" "betabook" {
  account = { id = var.account_id }
  name    = local.zone_name
  type    = "full"

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_bot_management" "betabook" {
  zone_id               = cloudflare_zone.betabook.id
  is_robots_txt_managed = true
}
