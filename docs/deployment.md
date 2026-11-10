# 배포 가이드

상세 계획·비용·승인 요청: [`phase8-staging-plan.md`](phase8-staging-plan.md)

## 환경
| 환경 | 구성 | 상태 |
|---|---|---|
| local | Postgres 16 (`service postgresql start` 또는 docker compose) | 사용 중 |
| staging | CloudFront → EC2 1대(Caddy·웹·API 컨테이너) → RDS PostgreSQL(비공개) · S3 · ECR · Secrets Manager · CloudWatch | Terraform 작성·오프라인 plan 57건, **미적용 (승인 대기)** |
| production | 같은 모듈 + t4g.medium · RDS Multi-AZ · WAF · 도메인 (별도 계정 권장) | 설계만, 적용 금지 |

## 최초 준비 (1회, 사용자)
1. AWS 콘솔 CloudFormation 에서 `infra/bootstrap/bootstrap.yaml` 실행 → 출력 4개
2. GitHub 저장소·환경 변수 설정 (`phase8-staging-plan.md` ⑦-3)
3. GitHub Actions **Infra plan** → 결과 확인 → **Infra apply** (APPLY 입력 + 승인)
4. apply 출력값을 `staging` 환경 변수에 넣고 `STAGING_DEPLOY_ENABLED=true`
5. Actions **Deploy staging** 수동 실행(seed 체크) → 최초 관리자 생성(⑥)

## 배포 흐름
`develop` push → CI(테스트) → arm64 이미지(커밋 해시 태그) → ECR → SSM 으로 서버 `deploy.sh`
(마이그레이션 → 컨테이너 교체 → 상태 확인 → 실패 시 직전 태그로 자동 복귀) → CloudFront 주소 확인.
운영은 `deploy-production.yml` 수동 실행 + `production` 환경 승인자 승인.

## 서버 구성 (EC2)
- `/opt/plit/`: `deploy.sh`, `Caddyfile`, `create-admin.sh`, `api.env`(권한 600, 배포 때 Secrets Manager 에서 생성), `current_tag`
- 컨테이너: `plit-caddy`(80, 비밀 헤더 확인) · `plit-web` · `plit-api`, 네트워크 `plit`, 로그 → CloudWatch `/plit/<env>/app`
- 접속: SSM Session Manager (SSH 없음)

## 시크릿
- `plit-<env>/app` (Secrets Manager): JWT·MFA 키·원본 확인 헤더(자동 생성), 토스·Claude 키(콘솔 입력). Terraform 은 생성 후 덮어쓰지 않음
- DB 비밀번호: RDS 관리형 시크릿 (Terraform 상태에도 없음)
- `ORIGIN_VERIFY_SECRET` 을 바꾸면 CloudFront 헤더와 어긋남 → 바꾸지 말 것 (교체 시 Terraform 으로)

## 도메인
기존 `plit.ai.kr`·데모 DNS 는 변경하지 않는다. `custom_domain` 설정 시 Terraform 은 인증서 검증 레코드만 출력하고, 레코드 추가는 사용자가 도메인 관리처에서 직접 (승인 후).

## 운영 배포 전 체크리스트 (Phase 9 에서 확정)
- [ ] 별도 AWS 계정 · production 환경 승인자
- [ ] 토스 실가맹 계약·live 키 · 보상 정책 법률 검토 → `REWARDS_LIVE`
- [ ] 소셜 로그인 앱 검수 · SES 도메인 인증 · 개인정보처리방침·약관
- [ ] CloudFront ↔ 서버 구간 HTTPS(또는 ALB) 전환 검토 · 부하·보안 점검
