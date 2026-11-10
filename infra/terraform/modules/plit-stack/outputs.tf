output "url" {
  description = "접속 주소"
  value       = local.app_origin
}
output "cloudfront_domain" { value = aws_cloudfront_distribution.this.domain_name }
output "instance_id" { value = aws_instance.app.id }
output "ecr_api" { value = aws_ecr_repository.app["api"].repository_url }
output "ecr_web" { value = aws_ecr_repository.app["web"].repository_url }
output "app_secret_name" { value = aws_secretsmanager_secret.app.name }
output "db_endpoint" { value = aws_db_instance.this.address }
output "uploads_bucket" { value = aws_s3_bucket.uploads.bucket }
output "deploy_role_arn" { value = try(aws_iam_role.deploy[0].arn, "") }
output "custom_domain_dns_records" {
  description = "도메인 관리처에 직접 추가할 레코드 (Terraform 은 DNS 를 바꾸지 않음)"
  value = var.custom_domain == "" ? [] : concat(
    [for o in aws_acm_certificate.custom[0].domain_validation_options : { purpose = "인증서 검증", type = o.resource_record_type, name = o.resource_record_name, value = o.resource_record_value }],
    [{ purpose = "서비스 연결 (인증서 발급 후)", type = "CNAME", name = var.custom_domain, value = aws_cloudfront_distribution.this.domain_name }]
  )
}
