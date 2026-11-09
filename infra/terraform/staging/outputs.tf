output "api_url" { value = "https://${var.api_subdomain}.${var.domain}" }
output "ecr_repository" { value = aws_ecr_repository.api.repository_url }
output "db_endpoint" {
  value     = aws_db_instance.postgres.address
  sensitive = true
}
output "uploads_bucket" { value = aws_s3_bucket.uploads.bucket }
