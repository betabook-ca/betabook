# The apex A/AAAA records belong to the Worker custom domain in wrangler.jsonc,
# and the MX, SPF and cf2024-1 DKIM records to Email Routing.
locals {
  dns_records = {
    google_site_verification = {
      type     = "TXT"
      name     = "betabook.ca"
      content  = "google-site-verification=-XqrNrzK_yZ5ABtu-k35DeNm2qCI8IQMqIQBzTQL3P0"
      priority = null
      ttl      = 3600
    }
    dmarc = {
      type     = "TXT"
      name     = "_dmarc.betabook.ca"
      content  = "v=DMARC1; p=none; rua=mailto:2cae843be4a5451db3ccd10fd6ade6a8@dmarc-reports.cloudflare.net"
      priority = null
      ttl      = 1
    }
    resend_dkim = {
      type     = "TXT"
      name     = "resend._domainkey.betabook.ca"
      content  = "p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDSkzdXrwqlGAce/mCyj6MaVMnzFW+5tS1L8v4ofhAb3RTy6Bg9sjVgbtc/xtPxSBNhjEbxn2a9THPpzyHB5lcmOyzbQrLV9fpb2pHPqYSmgZi40BOxV+FW5KA+1uCEzXiamyLzaspmaeZZUVV7wb12VcBlD+wvgyc2FIQ5wRFg5QIDAQAB"
      priority = null
      ttl      = 3600
    }
    resend_bounce_mx = {
      type     = "MX"
      name     = "send.betabook.ca"
      content  = "feedback-smtp.us-east-1.amazonses.com"
      priority = 10
      ttl      = 3600
    }
    resend_spf = {
      type     = "TXT"
      name     = "send.betabook.ca"
      content  = "v=spf1 include:amazonses.com ~all"
      priority = null
      ttl      = 3600
    }
  }
}

resource "cloudflare_dns_record" "betabook" {
  for_each = local.dns_records

  zone_id = cloudflare_zone.betabook.id
  type    = each.value.type
  name    = each.value.name
  # Cloudflare stores TXT content quoted.
  content  = each.value.type == "TXT" ? "\"${each.value.content}\"" : each.value.content
  priority = each.value.priority
  ttl      = each.value.ttl
}
