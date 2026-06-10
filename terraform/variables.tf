variable "db_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "peakr"
}

variable "db_password" {
  description = "Master password for the RDS instance (use a long random value)"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.db_password) >= 16
    error_message = "db_password must be at least 16 characters. Generate one with: openssl rand -base64 24"
  }
}

variable "allowed_cidr_blocks" {
  description = <<-EOT
    CIDR blocks permitted to reach Postgres (port 5432). Narrow this to the
    Mac Mini's static IP (and any admin IPs) instead of the public internet.
    Vercel functions use dynamic egress IPs — reach RDS from Vercel via a
    connection pooler/proxy or Vercel Secure Compute rather than opening 0.0.0.0/0.
    See docs/runbooks/rds-hardening.md.
  EOT
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "db_publicly_accessible" {
  description = "Whether the RDS instance gets a public endpoint. Set false once a private connectivity path (proxy/PrivateLink) is in place."
  type        = bool
  default     = true
}

variable "backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}
