locals {
  hello_address = "hello@betabook.ca"
}

# Not cloudflare_email_routing_dns: it can't read its state, and its update
# unlocks the routing MX records.

resource "cloudflare_email_routing_rule" "hello" {
  zone_id = cloudflare_zone.betabook.id

  matchers = [{
    type  = "literal"
    field = "to"
    value = local.hello_address
  }]

  actions = [{
    type  = "forward"
    value = [var.hello_forward_to]
  }]

  lifecycle {
    # Hides a perpetual `tag` update (cloudflare/terraform-provider-cloudflare#7352).
    # Remove it to change the rule.
    ignore_changes = all
  }
}
