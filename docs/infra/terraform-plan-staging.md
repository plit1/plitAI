# Terraform 오프라인 plan 결과 — staging (AWS 계정 없이 실행, 2026-11-10)

실행: terraform 1.16.7 / hashicorp/aws 6.72.0 / random 3.7.2 (체크섬 확인), 데이터 소스 대신 고정값 사용

Plan: 57 to add, 0 to change, 0 to destroy.

| # | 리소스 |
|---|---|
| 1 | `aws_budgets_budget.monthly[0]` |
| 2 | `aws_cloudfront_distribution.this` |
| 3 | `aws_cloudwatch_log_group.app` |
| 4 | `aws_cloudwatch_metric_alarm.db_cpu` |
| 5 | `aws_cloudwatch_metric_alarm.db_storage` |
| 6 | `aws_cloudwatch_metric_alarm.ec2_instance` |
| 7 | `aws_cloudwatch_metric_alarm.ec2_system` |
| 8 | `aws_db_instance.this` |
| 9 | `aws_db_parameter_group.this` |
| 10 | `aws_db_subnet_group.this` |
| 11 | `aws_ecr_lifecycle_policy.app["api"]` |
| 12 | `aws_ecr_lifecycle_policy.app["web"]` |
| 13 | `aws_ecr_repository.app["api"]` |
| 14 | `aws_ecr_repository.app["web"]` |
| 15 | `aws_eip.app` |
| 16 | `aws_iam_instance_profile.app` |
| 17 | `aws_iam_role.app` |
| 18 | `aws_iam_role.deploy[0]` |
| 19 | `aws_iam_role_policy.app` |
| 20 | `aws_iam_role_policy.deploy[0]` |
| 21 | `aws_iam_role_policy_attachment.app_ecr` |
| 22 | `aws_iam_role_policy_attachment.app_ssm` |
| 23 | `aws_instance.app` |
| 24 | `aws_internet_gateway.this` |
| 25 | `aws_launch_template.app` |
| 26 | `aws_route_table.private` |
| 27 | `aws_route_table.public` |
| 28 | `aws_route_table_association.private[0]` |
| 29 | `aws_route_table_association.private[1]` |
| 30 | `aws_route_table_association.public[0]` |
| 31 | `aws_route_table_association.public[1]` |
| 32 | `aws_s3_bucket.uploads` |
| 33 | `aws_s3_bucket_lifecycle_configuration.uploads` |
| 34 | `aws_s3_bucket_ownership_controls.uploads` |
| 35 | `aws_s3_bucket_policy.uploads` |
| 36 | `aws_s3_bucket_public_access_block.uploads` |
| 37 | `aws_s3_bucket_server_side_encryption_configuration.uploads` |
| 38 | `aws_s3_bucket_versioning.uploads` |
| 39 | `aws_secretsmanager_secret.app` |
| 40 | `aws_secretsmanager_secret_version.app` |
| 41 | `aws_security_group.app` |
| 42 | `aws_security_group.db` |
| 43 | `aws_sns_topic.alerts` |
| 44 | `aws_sns_topic_subscription.email[0]` |
| 45 | `aws_ssm_parameter.config` |
| 46 | `aws_subnet.private[0]` |
| 47 | `aws_subnet.private[1]` |
| 48 | `aws_subnet.public[0]` |
| 49 | `aws_subnet.public[1]` |
| 50 | `aws_vpc.this` |
| 51 | `aws_vpc_security_group_egress_rule.app_all` |
| 52 | `aws_vpc_security_group_ingress_rule.app_from_cloudfront` |
| 53 | `aws_vpc_security_group_ingress_rule.db_from_app` |
| 54 | `random_id.mfa_key` |
| 55 | `random_id.suffix` |
| 56 | `random_password.jwt` |
| 57 | `random_password.origin_verify` |
