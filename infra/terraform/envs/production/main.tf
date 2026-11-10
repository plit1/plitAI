# PLIT 정식 운영 (초기 구성) — AWS 서울. 스테이징과 다른 AWS 계정 사용 권장
# ⚠ 지금은 적용하지 않는다(설계만). 출시 준비 단계에서 비용·법무 검토와 사용자 승인 후 적용.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # 상태 파일: 부트스트랩이 만든 S3 버킷 (암호화·버전관리, S3 잠금). 버킷 이름은 init 때 -backend-config 로 전달
  backend "s3" {
    key          = "production/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}

variable "alarm_email" {
  type    = string
  default = ""
}
variable "github_oidc_provider_arn" {
  type    = string
  default = ""
}
variable "custom_domain" {
  type    = string
  default = ""
}
variable "custom_domain_ready" {
  type    = bool
  default = false
}

provider "aws" {
  region = "ap-northeast-2"
  default_tags { tags = { Project = "plit", Env = "production", ManagedBy = "terraform" } }
}
provider "aws" {
  alias  = "us_east_1" # CloudFront 인증서·웹 방화벽 전용
  region = "us-east-1"
  default_tags { tags = { Project = "plit", Env = "production", ManagedBy = "terraform" } }
}

module "plit" {
  source    = "../../modules/plit-stack"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  env                      = "production"
  instance_type            = "t4g.medium" # 2vCPU · 4GiB
  db_instance_class        = "db.t4g.small"
  db_multi_az              = true # DB 장애 시 다른 가용영역으로 자동 전환
  db_allocated_storage_gb  = 50
  db_backup_retention_days = 14
  db_export_logs           = true
  enable_waf               = true
  log_retention_days       = 90
  monthly_budget_usd       = 250
  protect_resources        = true

  alarm_email              = var.alarm_email
  github_oidc_provider_arn = var.github_oidc_provider_arn
  custom_domain            = var.custom_domain       # 예: plit.ai.kr (출시 승인 후)
  custom_domain_ready      = var.custom_domain_ready # 인증서 발급 확인 후 true
}

output "url" { value = module.plit.url }
output "instance_id" { value = module.plit.instance_id }
output "ecr_api" { value = module.plit.ecr_api }
output "ecr_web" { value = module.plit.ecr_web }
output "app_secret_name" { value = module.plit.app_secret_name }
output "deploy_role_arn" { value = module.plit.deploy_role_arn }
output "custom_domain_dns_records" { value = module.plit.custom_domain_dns_records }
