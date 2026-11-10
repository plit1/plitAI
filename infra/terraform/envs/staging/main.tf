# PLIT 스테이징 (최소 비용 구성) — AWS 서울
# ⚠ apply 는 과금 리소스를 만든다. 사용자 승인 후 GitHub Actions 'infra-apply'(승인 버튼) 또는 로컬에서만 실행.
terraform {
  required_version = ">= 1.10"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 6.0" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # 상태 파일: 부트스트랩이 만든 S3 버킷 (암호화·버전관리, S3 잠금). 버킷 이름은 init 때 -backend-config 로 전달
  backend "s3" {
    key          = "staging/terraform.tfstate"
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
  default_tags { tags = { Project = "plit", Env = "staging", ManagedBy = "terraform" } }
}
provider "aws" {
  alias  = "us_east_1" # CloudFront 인증서·웹 방화벽 전용
  region = "us-east-1"
  default_tags { tags = { Project = "plit", Env = "staging", ManagedBy = "terraform" } }
}

module "plit" {
  source    = "../../modules/plit-stack"
  providers = { aws = aws, aws.us_east_1 = aws.us_east_1 }

  env                      = "staging"
  instance_type            = "t4g.small"
  db_instance_class        = "db.t4g.micro"
  db_multi_az              = false
  db_allocated_storage_gb  = 20
  db_backup_retention_days = 7
  enable_waf               = false # 테스트 데이터만 다루는 스테이징은 끔 (월 약 $9 절감). 필요 시 true
  log_retention_days       = 14
  monthly_budget_usd       = 80
  protect_resources        = true

  alarm_email              = var.alarm_email
  github_oidc_provider_arn = var.github_oidc_provider_arn
  custom_domain            = var.custom_domain       # 예: staging.plit.ai.kr (승인 후)
  custom_domain_ready      = var.custom_domain_ready # 인증서 발급 확인 후 true
}

output "url" { value = module.plit.url }
output "instance_id" { value = module.plit.instance_id }
output "ecr_api" { value = module.plit.ecr_api }
output "ecr_web" { value = module.plit.ecr_web }
output "app_secret_name" { value = module.plit.app_secret_name }
output "deploy_role_arn" { value = module.plit.deploy_role_arn }
output "custom_domain_dns_records" { value = module.plit.custom_domain_dns_records }
