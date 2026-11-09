resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                   = local.name
  engine                       = "postgres"
  engine_version               = "16"
  instance_class               = var.db_instance_class
  allocated_storage            = 20
  max_allocated_storage        = 100
  storage_encrypted            = true
  db_name                      = "plit"
  username                     = "plit"
  manage_master_user_password  = true # 비밀번호는 Secrets Manager 가 생성·회전
  db_subnet_group_name         = aws_db_subnet_group.this.name
  vpc_security_group_ids       = [aws_security_group.db.id]
  publicly_accessible          = false
  backup_retention_period      = 7
  deletion_protection          = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
  performance_insights_enabled = true
  auto_minor_version_upgrade   = true
}

# 합격 증빙 등 개인 업로드 — 비공개, 암호화, 버전관리
resource "aws_s3_bucket" "uploads" { bucket = "${local.name}-uploads-${data.aws_caller_identity.me.account_id}" }
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
  }
}
resource "aws_s3_bucket_versioning" "uploads" {
  bucket = aws_s3_bucket.uploads.id
  versioning_configuration { status = "Enabled" }
}

resource "random_password" "jwt" {
  length  = 64
  special = false
}

# 앱 시크릿 (JWT, 토스 키 등). 토스 키는 콘솔에서 수동 입력 — 코드/상태파일에 실키 금지
resource "aws_secretsmanager_secret" "app" { name = "${local.name}/api" }
resource "aws_secretsmanager_secret_version" "app" {
  secret_id = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    JWT_ACCESS_SECRET = random_password.jwt.result
    TOSS_SECRET_KEY   = "SET_IN_CONSOLE"
  })
  lifecycle { ignore_changes = [secret_string] }
}
