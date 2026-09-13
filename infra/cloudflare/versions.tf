terraform {
  # import blocks with for_each need OpenTofu 1.7.
  required_version = ">= 1.7"

  # No backend block: Spacelift manages state.

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
  }
}

provider "cloudflare" {}
