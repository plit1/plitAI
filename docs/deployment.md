# 배포 가이드

## 환경
| 환경 | 구성 | 상태 |
|---|---|---|
| local | Postgres 16 + Redis (`docker compose up -d postgres redis` 또는 로컬 설치) | 사용 중 |
| staging | AWS 서울: VPC(2AZ) · ALB(HTTPS, ACM) · ECS Fargate · RDS PostgreSQL(비공개) · S3(비공개·KMS) · Secrets Manager · CloudWatch 알람 | Terraform 작성, **미적용** |
| production | staging 과 동일 구조 + Multi-AZ RDS, AZ별 NAT, WAF, AWS Backup, CloudFront | 미작성 |

## 스테이징 배포 절차 (승인 후 실행)
1. 상태 저장 S3 버킷·DynamoDB 락 생성 후 `main.tf` backend 주석 해제
2. `cd infra/terraform/staging && terraform init && terraform plan -out plan.out` → 예상 비용 검토 (대략 월 NAT·ALB·RDS·Fargate 합산) → **승인**
3. `terraform apply plan.out`
4. Secrets Manager `plit-staging/api` 에 `TOSS_SECRET_KEY`(테스트 키) 입력, 태스크 환경변수 `TOSS_CLIENT_KEY`는 결제위젯용 `test_gck_` 키 (live 키는 production 에서만 기동 허용)
5. 이미지: `docker build -f apps/api/Dockerfile -t <ecr>:<sha> . && docker push`
6. 마이그레이션: 같은 이미지로 ECS 일회성 태스크 `npx prisma migrate deploy`
6-1. 시드: 같은 이미지로 일회성 태스크 `node dist/seed/seed.js` (태스크 환경 `NODE_ENV=staging` 필수 — 이미지 기본값은 production)
   - 스테이징: 자격증·회차·정책 + **데모 채용공고·창업 지원사업·예시 문항**(화면에 '데모' 표시). 개발 계정(admin@plit.local)은 만들지 않음 → 첫 관리자 계정은 별도 절차로 생성
   - 데모 콘텐츠를 빼려면 `SEED_DEMO_CONTENT=false`. 운영(production)은 데모·개발 계정을 넣지 않음 (D-038)
   - 반복 실행 안전(upsert)
7. `terraform apply -var api_image_tag=<sha>` 또는 ECS 서비스 업데이트

## 웹(Next.js) 호스팅
미결정 — 후보: (a) 같은 ECS 클러스터에 web 서비스 추가 (b) Amplify Hosting. `API_ORIGIN` 환경변수로 API 프록시.

## 운영 배포 전 체크리스트 (Phase 9 에서 확정)
- [ ] 토스 실가맹 계약·live 키 (Secrets Manager)
- [ ] 소셜 로그인 앱 검수 (카카오 비즈앱, 네이버 검수, Google OAuth 동의 화면)
- [ ] 보상 정책 법률 검토 → `REWARDS_LIVE`
- [ ] 개인정보처리방침·이용약관 확정 (동의 버전 `CONSENT_VERSION` 갱신)
- [ ] 메일 발송(SES) 도메인 인증
- [ ] 관리자 MFA
- [ ] 부하·보안 점검
