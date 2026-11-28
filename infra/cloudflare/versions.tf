terraform {
  required_version = ">= 1.7"

  # No backend block: Spacelift manages state.

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
  }
}

provider "cloudflare" {}
