# PLIT 스테이징 — AWS 서울(ap-northeast-2)
# 원칙: 최소 비용으로 운영과 같은 구조(Private DB, ALB+HTTPS, ECS Fargate, 비공개 S3, Secrets Manager)
# ⚠ apply 는 과금 리소스를 생성한다. 사전 승인 후에만 실행할 것.
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws    = { source = "hashicorp/aws", version = "~> 5.70" }
    random = { source = "hashicorp/random", version = "~> 3.6" }
  }
  # backend "s3" { bucket = "plit-terraform-state" key = "staging/terraform.tfstate" region = "ap-northeast-2" dynamodb_table = "plit-terraform-lock" encrypt = true }
}

provider "aws" {
  region = var.region
  default_tags { tags = { Project = "plit", Env = var.env, ManagedBy = "terraform" } }
}

locals {
  name = "plit-${var.env}"
  azs  = ["${var.region}a", "${var.region}c"]
}

data "aws_caller_identity" "me" {}
