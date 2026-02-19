variable "db_username" {
  description = "Master username for the RDS instance"
  type        = string
  default     = "peakr"
}

variable "db_password" {
  description = "Master password for the RDS instance"
  type        = string
  sensitive   = true
}
