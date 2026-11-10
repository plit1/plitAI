# PLIT 앱 스택 (스테이징·운영 공용). 환경별 값은 envs/<환경>/main.tf 에서 정한다.

variable "env" {
  type        = string
  description = "환경 이름 (staging | production)"
  validation {
    condition     = contains(["staging", "production"], var.env)
    error_message = "env 는 staging 또는 production 이어야 합니다."
  }
}
variable "region" {
  type    = string
  default = "ap-northeast-2"
}
variable "vpc_cidr" {
  type    = string
  default = "10.20.0.0/16"
}

# ── 서버 (EC2 1대: Caddy + 웹 + API 컨테이너) ──
variable "instance_type" {
  type    = string
  default = "t4g.small" # ARM(Graviton) 2vCPU · 2GiB
}
variable "root_volume_gb" {
  type    = number
  default = 30
}

# ── 데이터베이스 (RDS PostgreSQL) ──
variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}
variable "db_multi_az" {
  type    = bool
  default = false
}
variable "db_allocated_storage_gb" {
  type    = number
  default = 20
}
variable "db_export_logs" {
  type        = bool
  default     = false
  description = "PostgreSQL 로그를 CloudWatch 로 내보내기 (운영 true, 로그량만큼 과금)"
}
variable "db_backup_retention_days" {
  type    = number
  default = 7
}

# ── 보안·도메인 ──
variable "enable_waf" {
  type        = bool
  default     = false
  description = "CloudFront 앞단 웹 방화벽 (월 약 $9~). 운영은 true"
}
variable "custom_domain" {
  type        = string
  default     = ""
  description = "연결할 도메인 (예: staging.plit.ai.kr). 비우면 CloudFront 기본 주소(xxxx.cloudfront.net)로 HTTPS 제공"
}
variable "custom_domain_ready" {
  type        = bool
  default     = false
  description = "custom_domain 의 인증서 검증 DNS 레코드를 도메인 관리처에 추가해 인증서가 발급된 뒤 true 로 바꿔 연결"
}

# ── 운영 ──
variable "log_retention_days" {
  type    = number
  default = 14
}
variable "alarm_email" {
  type        = string
  default     = ""
  description = "장애 알람·예산 경보를 받을 이메일 (비우면 알림 없음)"
}
variable "monthly_budget_usd" {
  type        = number
  default     = 80
  description = "AWS 월 예산 경보 기준 (USD). 80% 사용·100% 예상 시 이메일"
}
variable "protect_resources" {
  type        = bool
  default     = true
  description = "DB 삭제 보호·서버 종료 보호"
}

# ── GitHub Actions 배포 ──
variable "github_repo" {
  type    = string
  default = "plit1/plitAI"
}
variable "github_oidc_provider_arn" {
  type        = string
  default     = ""
  description = "부트스트랩(CloudFormation)이 만든 GitHub OIDC 공급자 ARN. 비우면 배포 역할을 만들지 않음"
}

# ── 오프라인 plan 용 (AWS 계정 없이 구성 검증) ──
variable "cloudfront_prefix_list_id" {
  type        = string
  default     = null
  description = "CloudFront 원본용 관리형 프리픽스 리스트 ID. null 이면 AWS 에서 조회"
}
