# DB: RDS PostgreSQL 16 — 비공개 서브넷, 암호화, 자동 백업, 삭제 보호. 비밀번호는 RDS 가 Secrets Manager 에서 직접 관리(코드·상태 파일에 없음)
resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = aws_subnet.private[*].id
}

resource "aws_db_parameter_group" "this" {
  name   = "${local.name}-pg16"
  family = "postgres16"
  parameter {
    name  = "rds.force_ssl" # 암호화 연결만 허용
    value = "1"
  }
  parameter {
    name  = "log_min_duration_statement" # 1초 넘는 느린 쿼리 기록
    value = "1000"
  }
}

resource "aws_db_instance" "this" {
  identifier                      = local.name
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.db_instance_class
  multi_az                        = var.db_multi_az
  allocated_storage               = var.db_allocated_storage_gb
  max_allocated_storage           = var.db_allocated_storage_gb * 5 # 자동 확장 상한
  storage_type                    = "gp3"
  storage_encrypted               = true
  db_name                         = "plit"
  username                        = "plit"
  manage_master_user_password     = true
  db_subnet_group_name            = aws_db_subnet_group.this.name
  parameter_group_name            = aws_db_parameter_group.this.name
  vpc_security_group_ids          = [aws_security_group.db.id]
  publicly_accessible             = false
  backup_retention_period         = var.db_backup_retention_days
  backup_window                   = "18:00-18:30" # 한국 시간 새벽 3시
  maintenance_window              = "sun:19:00-sun:19:30"
  copy_tags_to_snapshot           = true
  deletion_protection             = var.protect_resources
  skip_final_snapshot             = false
  final_snapshot_identifier       = "${local.name}-final"
  auto_minor_version_upgrade      = true
  apply_immediately               = false
  enabled_cloudwatch_logs_exports = []
}
