# Delete once Spacelift has applied these imports.

data "cloudflare_zone" "betabook" {
  filter = {
    name    = local.zone_name
    account = { id = var.account_id }
  }
}

data "cloudflare_dns_records" "betabook" {
  zone_id = data.cloudflare_zone.betabook.zone_id
}

data "cloudflare_email_routing_rules" "betabook" {
  zone_id = data.cloudflare_zone.betabook.zone_id
}

locals {
  import_zone_id = data.cloudflare_zone.betabook.zone_id

  # TXT content may be stored quoted, so match on the unquoted value.
  existing_record_ids = {
    for r in data.cloudflare_dns_records.betabook.result :
    "${r.type} ${r.name} ${trim(r.content, "\"")}" => r.id
  }

  existing_hello_rule_id = one([
    for r in data.cloudflare_email_routing_rules.betabook.result : r.id
    if try(anytrue([for m in r.matchers : m.value == local.hello_address]), false)
  ])
}

import {
  to = cloudflare_zone.betabook
  id = local.import_zone_id
}

import {
  to = cloudflare_bot_management.betabook
  id = local.import_zone_id
}

import {
  for_each = local.dns_records
  to       = cloudflare_dns_record.betabook[each.key]
  id       = "${local.import_zone_id}/${local.existing_record_ids["${each.value.type} ${each.value.name} ${each.value.content}"]}"
}

import {
  to = cloudflare_email_routing_rule.hello
  id = "${local.import_zone_id}/${local.existing_hello_rule_id}"
}

import {
  to = cloudflare_d1_database.betabook
  id = "${var.account_id}/696bc9d0-52b8-4f50-8f4a-41e534000313"
}
