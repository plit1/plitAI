# 네트워크: 공개 서브넷(서버) 2개 + 비공개 서브넷(DB) 2개. NAT 게이트웨이 없음(월 $43 절감).
# 서버는 공인 IP 로 바깥(이미지·업데이트)에 나가고, 들어오는 연결은 CloudFront 에서만 허용한다.
locals {
  name = "plit-${var.env}"
  azs  = ["${var.region}a", "${var.region}c"]
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = local.name }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = local.name }
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.vpc_cidr, 8, count.index)
  map_public_ip_on_launch = false
  tags                    = { Name = "${local.name}-public-${count.index}" }
}

resource "aws_subnet" "private" {
  count             = 2
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.vpc_cidr, 8, count.index + 10)
  tags              = { Name = "${local.name}-private-${count.index}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public" }
}
resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# 비공개 서브넷: 인터넷 경로 없음 (DB 전용)
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-private" }
}
resource "aws_route_table_association" "private" {
  count          = 2
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# CloudFront 원본용 IP 대역 (AWS 관리형 목록)
data "aws_ec2_managed_prefix_list" "cloudfront" {
  count = var.cloudfront_prefix_list_id == null ? 1 : 0
  name  = "com.amazonaws.global.cloudfront.origin-facing"
}
locals {
  cloudfront_prefix_list_id = coalesce(var.cloudfront_prefix_list_id, try(data.aws_ec2_managed_prefix_list.cloudfront[0].id, null))
}

resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "PLIT app server: HTTP from CloudFront only, no SSH (SSM Session Manager)"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-app" }
}
resource "aws_vpc_security_group_ingress_rule" "app_from_cloudfront" {
  security_group_id = aws_security_group.app.id
  description       = "HTTP from CloudFront origin-facing servers only"
  prefix_list_id    = local.cloudfront_prefix_list_id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}
resource "aws_vpc_security_group_egress_rule" "app_all" {
  security_group_id = aws_security_group.app.id
  description       = "Outbound: image pulls, AWS APIs, OS updates"
  ip_protocol       = "-1"
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "db" {
  name        = "${local.name}-db"
  description = "PostgreSQL from app server only"
  vpc_id      = aws_vpc.this.id
  tags        = { Name = "${local.name}-db" }
}
resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "PostgreSQL from app server"
  referenced_security_group_id = aws_security_group.app.id
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
}
