variable "account_id" {
  type = string
}

variable "hello_forward_to" {
  description = "Inbox that hello@betabook.ca and support@betabook.ca forward to."
  type        = string
  sensitive   = true
}
