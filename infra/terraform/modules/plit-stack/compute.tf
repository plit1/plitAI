# 서버: EC2 1대 (Amazon Linux 2023, ARM). SSH 포트 없이 SSM Session Manager 로만 접속.
resource "aws_launch_template" "app" {
  name_prefix   = "${local.name}-app-"
  image_id      = "resolve:ssm:/aws/service/ami-amazon-linux-latest/al2023-ami-kernel-default-arm64" # 최신 공식 이미지 (교체 시에만 반영)
  instance_type = var.instance_type
  ebs_optimized = true
  user_data     = base64encode(templatefile("${path.module}/user_data.sh.tftpl", { env = var.env }))

  iam_instance_profile { name = aws_iam_instance_profile.app.name }
  vpc_security_group_ids = [aws_security_group.app.id]

  metadata_options {
    http_tokens                 = "required" # IMDSv2 강제
    http_put_response_hop_limit = 2          # 컨테이너 안 API 가 서버 역할(S3 접근)을 쓰기 위해 필요
    instance_metadata_tags      = "disabled"
  }
  block_device_mappings {
    device_name = "/dev/xvda"
    ebs {
      volume_size           = var.root_volume_gb
      volume_type           = "gp3"
      encrypted             = true
      delete_on_termination = true
    }
  }
  monitoring { enabled = false } # 상세 모니터링(유료) 끔 — 기본 5분 지표로 충분
  tag_specifications {
    resource_type = "instance"
    tags          = { Name = "${local.name}-app", Role = "app" }
  }
}

resource "aws_instance" "app" {
  subnet_id               = aws_subnet.public[0].id
  disable_api_termination = var.protect_resources
  launch_template {
    id      = aws_launch_template.app.id
    version = aws_launch_template.app.latest_version
  }
  lifecycle {
    ignore_changes = [launch_template] # 템플릿 수정이 서버 교체로 이어지지 않게 (교체는 의도적으로만)
  }
}

# 고정 공인 IP: CloudFront 원본 주소가 서버 재시작 후에도 바뀌지 않게
resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id
  tags     = { Name = "${local.name}-app" }
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(["api", "web"])
  name                 = "${local.name}-${each.key}"
  image_tag_mutability = "IMMUTABLE" # 같은 태그(git sha) 덮어쓰기 금지
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration { encryption_type = "AES256" }
}
resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({ rules = [{
    rulePriority = 1, description = "최근 15개 이미지만 보관",
    selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 15 },
    action       = { type = "expire" }
  }] })
}
