resource "cloudflare_d1_database" "betabook" {
  account_id       = var.account_id
  name             = "betabook-db"
  read_replication = { mode = "disabled" }

  lifecycle {
    # A rename or relocation replaces the database and loses its data.
    prevent_destroy = true
    ignore_changes  = [jurisdiction, primary_location_hint]
  }
}
