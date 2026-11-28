# VAPID key for web push. Every browser subscription is bound to its public
# key, so a replacement silently ends push on every subscribed device until
# each one subscribes again. The Worker holds a copy as VAPID_PRIVATE_KEY.
resource "tls_private_key" "vapid" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"

  lifecycle {
    prevent_destroy = true
  }
}

output "vapid_private_key" {
  value     = tls_private_key.vapid.private_key_pem_pkcs8
  sensitive = true
}
