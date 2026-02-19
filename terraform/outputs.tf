output "rds_endpoint" {
  description = "RDS instance endpoint (host:port)"
  value       = aws_db_instance.peakr.endpoint
}

output "database_url" {
  description = "Full PostgreSQL connection string for .env.local"
  value       = "postgresql://${var.db_username}:${var.db_password}@${aws_db_instance.peakr.endpoint}/peakr"
  sensitive   = true
}
