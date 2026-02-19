terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"
}

# Use the default VPC
data "aws_vpc" "default" {
  default = true
}

# Security group: allow PostgreSQL from anywhere (Vercel uses dynamic IPs)
resource "aws_security_group" "peakr_rds" {
  name        = "peakr-rds-sg"
  description = "Allow PostgreSQL inbound from anywhere"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "PostgreSQL"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name    = "peakr-rds-sg"
    Project = "peakr"
  }
}

# RDS PostgreSQL 16 instance (free tier eligible)
resource "aws_db_instance" "peakr" {
  identifier     = "peakr-db"
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.t4g.micro"

  allocated_storage = 20
  storage_type      = "gp3"

  db_name  = "peakr"
  username = var.db_username
  password = var.db_password

  publicly_accessible    = true
  skip_final_snapshot    = true
  vpc_security_group_ids = [aws_security_group.peakr_rds.id]

  backup_retention_period = 1
  storage_encrypted       = true

  tags = {
    Name    = "peakr-db"
    Project = "peakr"
  }
}
