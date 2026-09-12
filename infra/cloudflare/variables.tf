variable "account_id" {
  type = string
}

variable "hello_forward_to" {
  description = "Inbox that hello@betabook.ca forwards to."
  type        = string
  sensitive   = true
}
