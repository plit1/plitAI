# 파일 저장소: 합격 증빙 등 개인 업로드 — 비공개, 암호화(SSE-KMS, AWS 관리형 키), 버전 관리, HTTPS 전용
resource "random_id" "suffix" { byte_length = 4 }

resource "aws_s3_bucket" "uploads" { bucket = "${local.name}-uploads-${random_id.suffix.hex}" }
resource "aws_s3_bucket_ownership_controls" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule { object_ownership = "BucketOwnerEnforced" }
}
resource "aws_s3_bucket_public_access_block" "uploads" {
  bucket                  = aws_s3_bucket.uploads.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "aws:kms" }
    bucket_key_enabled = true # KMS 요청 비용 절감
  }
}
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 90 }
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}
data "aws_iam_policy_document" "uploads_tls_only" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    principals {
      type        = "*"
      identifiers = ["*"]
    }
    resources = [aws_s3_bucket.uploads.arn, "${aws_s3_bucket.uploads.arn}/*"]
    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}
resource "aws_s3_bucket_policy" "uploads" {
  bucket     = aws_s3_bucket.uploads.id
  policy     = data.aws_iam_policy_document.uploads_tls_only.json
  depends_on = [aws_s3_bucket_public_access_block.uploads]
}

# 앱 시크릿: 자동 생성 값 + 나중에 콘솔에서 넣을 외부 키(토스·AI 등). 콘솔 수정분은 Terraform 이 덮어쓰지 않음
resource "random_password" "jwt" {
  length  = 64
  special = false
}
resource "random_id" "mfa_key" { byte_length = 32 }
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}
resource "aws_secretsmanager_secret" "app" {
  name                    = "${local.name}/app"
  description             = "PLIT ${var.env} 앱 시크릿 (JWT·MFA 암호화 키·CloudFront 원본 확인값·외부 연동 키)"
  recovery_window_in_days = 7
}
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_ACCESS_SECRET     = random_password.jwt.result
    MFA_ENC_KEY           = random_id.mfa_key.hex
    ORIGIN_VERIFY_SECRET  = random_password.origin_verify.result
    PAYMENT_PROVIDER      = "MOCK"
    TOSS_CLIENT_KEY       = ""
    TOSS_SECRET_KEY       = ""
    ANTHROPIC_API_KEY     = ""
    REWARDS_LIVE          = "false"
    AD_CONTACT_COLLECTION = "false"
  })
  lifecycle { ignore_changes = [secret_string] }
}

# 서버가 읽는 설정 (비밀 아님) — deploy.sh 가 사용
resource "aws_ssm_parameter" "config" {
  name = "/plit/${var.env}/config"
  type = "String"
  value = jsonencode({
    api_repo       = aws_ecr_repository.app["api"].repository_url
    web_repo       = aws_ecr_repository.app["web"].repository_url
    app_secret_arn = aws_secretsmanager_secret.app.arn
    db_secret_arn  = aws_db_instance.this.master_user_secret[0].secret_arn
    db_host        = aws_db_instance.this.address
    db_name        = aws_db_instance.this.db_name
    app_origin     = local.app_origin
    uploads_bucket = aws_s3_bucket.uploads.bucket
    log_group      = aws_cloudwatch_log_group.app.name
  })
}
