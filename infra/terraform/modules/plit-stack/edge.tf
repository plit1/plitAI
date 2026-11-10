# 앞단: CloudFront (HTTPS, 정적 파일 캐시, DDoS 기본 보호). 도메인 없이도 xxxx.cloudfront.net 으로 HTTPS 제공.
# 기존 도메인(plit.ai.kr) DNS 는 Terraform 이 건드리지 않는다 — custom_domain 사용 시 인증서 검증 레코드만 출력해 안내.
locals {
  use_custom_domain = var.custom_domain != "" && var.custom_domain_ready
  app_origin        = local.use_custom_domain ? "https://${var.custom_domain}" : "https://${aws_cloudfront_distribution.this.domain_name}"
  # AWS 관리형 정책 (고정 ID)
  cache_disabled                = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_optimized               = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  origin_all_viewer_except_host = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # Managed-AllViewerExceptHostHeader
  security_headers              = "67f7725c-6f97-4210-82d7-5512b31e9d03" # Managed-SecurityHeadersPolicy
}

resource "aws_acm_certificate" "custom" {
  count             = var.custom_domain != "" ? 1 : 0
  provider          = aws.us_east_1 # CloudFront 인증서는 버지니아 리전이어야 함 (무료)
  domain_name       = var.custom_domain
  validation_method = "DNS"
  lifecycle { create_before_destroy = true }
}

resource "aws_cloudfront_distribution" "this" {
  enabled         = true
  comment         = "PLIT ${var.env}"
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = "PriceClass_200" # 한국·아시아 포함, 남미·오세아니아 제외
  aliases         = local.use_custom_domain ? [var.custom_domain] : []
  web_acl_id      = var.enable_waf ? aws_wafv2_web_acl.this[0].arn : null

  origin {
    origin_id   = "app"
    domain_name = aws_eip.app.public_dns
    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only" # 서버는 CloudFront IP 만 허용 + 비밀 헤더 확인
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }
    custom_header {
      name  = "X-Origin-Verify"
      value = random_password.origin_verify.result
    }
  }

  # 기본: 캐시 안 함, 쿠키·헤더·쿼리 전달 (로그인·API·실시간 연결)
  default_cache_behavior {
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_disabled
    origin_request_policy_id   = local.origin_all_viewer_except_host
    response_headers_policy_id = local.security_headers
    compress                   = true
  }
  # Next.js 빌드 정적 파일: 엣지 캐시 (파일명에 해시 포함 → 배포 시 자동 교체)
  ordered_cache_behavior {
    path_pattern               = "/_next/static/*"
    target_origin_id           = "app"
    viewer_protocol_policy     = "redirect-to-https"
    allowed_methods            = ["GET", "HEAD"]
    cached_methods             = ["GET", "HEAD"]
    cache_policy_id            = local.cache_optimized
    origin_request_policy_id   = local.origin_all_viewer_except_host
    response_headers_policy_id = local.security_headers
    compress                   = true
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }
  viewer_certificate {
    cloudfront_default_certificate = !local.use_custom_domain
    acm_certificate_arn            = local.use_custom_domain ? aws_acm_certificate.custom[0].arn : null
    ssl_support_method             = local.use_custom_domain ? "sni-only" : null
    minimum_protocol_version       = local.use_custom_domain ? "TLSv1.2_2021" : null
  }
}

# 웹 방화벽 (선택): 일반 공격 패턴·알려진 악성 IP·과다 요청 차단
resource "aws_wafv2_web_acl" "this" {
  count    = var.enable_waf ? 1 : 0
  provider = aws.us_east_1
  name     = "${local.name}-web"
  scope    = "CLOUDFRONT"
  default_action {
    allow {}
  }

  rule {
    name     = "common"
    priority = 1
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesCommonRuleSet"
        # 시험 일정 CSV·합격 증빙 업로드(8KB 초과 본문)가 막히지 않도록 본문 크기 규칙은 기록만
        rule_action_override {
          name = "SizeRestrictions_BODY"
          action_to_use {
            count {}
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "common"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "bad-inputs"
    priority = 2
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesKnownBadInputsRuleSet"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "bad-inputs"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "ip-reputation"
    priority = 3
    override_action {
      none {}
    }
    statement {
      managed_rule_group_statement {
        vendor_name = "AWS"
        name        = "AWSManagedRulesAmazonIpReputationList"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "ip-reputation"
      sampled_requests_enabled   = true
    }
  }
  rule {
    name     = "rate-limit"
    priority = 4
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit              = 1000 # 같은 IP 5분 1,000회 초과 차단
        aggregate_key_type = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "rate-limit"
      sampled_requests_enabled   = true
    }
  }
  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${local.name}-web"
    sampled_requests_enabled   = true
  }
}
