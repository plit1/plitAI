# PHASE 8 — 스테이징 서버 구축 계획 (승인 요청)

- 작성일: 2026-11-10 · 대상: 스테이징(정식 출시 전 시험 서버)
- 상태: **설계·코드·로컬 검증 완료, AWS 적용 전** — `terraform apply`·유료 리소스 생성·DNS 변경은 하지 않았습니다.

---

## 한눈에 보기

| 항목 | 제안 |
|---|---|
| 구성 | **서버 1대(EC2) + 관리형 DB(RDS) + CloudFront(HTTPS)** — 고가 부품(NAT 게이트웨이·로드밸런서) 없이 보안 기능은 유지 |
| 스테이징 월 비용 | **약 $50 (VAT 포함 약 $56 ≈ 8만 원)** — 권장(보안 강화)형은 약 15만 원 |
| 주소 | 처음엔 `https://xxxx.cloudfront.net` (도메인 변경 없음) → 승인 후 `staging.plit.ai.kr` |
| 자동 배포 | `develop` 브랜치 → 테스트 통과 시에만 스테이징 배포. 운영은 수동 실행 + 승인 버튼 |
| 최초 관리자 | 서버에서 명령 1줄 → 임시 비밀번호 1회 표시 → 첫 로그인 시 비밀번호 변경 강제 → OTP 등록 후에만 관리자 기능 |

---

## ① 권장 AWS 아키텍처

```
 사용자(브라우저)
     │  HTTPS
     ▼
 CloudFront ─────────────── (선택) WAF 웹 방화벽
     │  CloudFront 서버 IP 에서만 + 비밀 헤더 확인
     ▼
 ┌─ VPC (서울 리전, 가용영역 2개) ─────────────────────────────┐
 │  공개 서브넷                                                  │
 │   EC2 서버 1대 (t4g.small, Amazon Linux 2023, SSH 포트 없음)  │
 │    ├ Caddy : 경로 라우팅 (/api·/socket.io → API, 나머지 → 웹)  │
 │    ├ 웹    : Next.js (PLIT 화면)                               │
 │    └ API   : NestJS (PLIT 서버)  ──→ S3 (합격 증빙 등 파일)     │
 │                     │                                          │
 │  비공개 서브넷      ▼                                          │
 │   RDS PostgreSQL 16 (인터넷 경로 없음, 서버에서만 접속)         │
 └────────────────────────────────────────────────────────────────┘
 그 외: ECR(이미지 보관) · Secrets Manager(비밀값) · CloudWatch(로그·알람) · 예산 경보
 GitHub Actions ──(비밀번호 없는 OIDC 로그인)──→ 이미지 업로드 → 서버에 배포 명령(SSM)
```

### 각 서비스가 하는 일 (쉬운 설명)

| 서비스 | 역할 | 비유 |
|---|---|---|
| **CloudFront** | 전 세계 접속 지점에서 HTTPS 를 처리하고, 정적 파일을 캐시하며, 서버 앞을 막아 줌 | 건물 정문·안내 데스크 |
| **WAF** (선택) | 해킹 시도·악성 IP·과도한 요청 차단 | 보안 검색대 |
| **VPC·서브넷·보안그룹** | AWS 안의 우리 전용 네트워크와 출입 규칙 | 건물 벽과 출입문 잠금 |
| **EC2** | PLIT 웹·API 프로그램이 실제로 돌아가는 서버 컴퓨터 | 사무실 |
| **RDS PostgreSQL** | 회원·챌린지·포인트 데이터를 저장하는 관리형 DB (자동 백업·암호화) | 금고 |
| **S3** | 합격 증빙 같은 업로드 파일 보관 (비공개·암호화) | 문서 보관 창고 |
| **ECR** | 배포할 프로그램 이미지 보관소 | 물품 창고 |
| **Secrets Manager** | DB 비밀번호·로그인 서명 키 등 비밀값 보관 (코드에 넣지 않음) | 열쇠 보관함 |
| **SSM (Systems Manager)** | SSH 없이 콘솔에서 서버 접속·배포 명령 실행 | 출입증 방식 관리실 |
| **CloudWatch·SNS·Budgets** | 로그 보관, 장애 알람, 예산 초과 경보 메일 | CCTV·경보기 |
| **ACM** | 도메인 HTTPS 인증서 (무료) | 신분증 |

### 비용을 줄인 방법과 그 대가

| 줄인 것 | 절감 (월) | 대가·보완 |
|---|---|---|
| NAT 게이트웨이 제거 (서버를 공개 서브넷에, 들어오는 연결은 CloudFront 만 허용) | 약 $48 | 서버에 공인 IP 가 있지만 보안그룹이 CloudFront 외 모든 접속 차단, SSH 포트 없음 |
| 로드밸런서(ALB) 대신 CloudFront → 서버 직접 | 약 $30 | 서버 1대 — 배포 때 수 초 중단, 하드웨어 장애 시 자동 복구 알람으로 재기동 |
| 컨테이너 서비스(Fargate) 대신 EC2 1대에 웹·API 함께 | 약 $17~ | 메모리 2GiB + 스왑 2GiB, 부족하면 t4g.medium 으로 한 줄 변경 |
| 스테이징 DB 단일 AZ, WAF 끔 | 약 $28 | 테스트 데이터만 다루는 스테이징 한정. 운영 설계는 Multi-AZ·WAF 켬 |

### 그대로 유지한 보안·데이터 보호

- HTTPS 전용 · 서버는 CloudFront 서버 IP 목록 + 비밀 헤더 둘 다 맞아야 응답 (로컬에서 헤더 없음/틀림 → 403 확인)
- SSH 없음, 서버 접속은 AWS 로그인 + SSM 으로만 · 서버 메타데이터 IMDSv2 강제
- 디스크·DB·S3·백업 모두 암호화 · DB 는 인터넷 경로 없는 비공개 서브넷 · DB 접속은 SSL 강제
- DB 자동 백업 7일(운영 14일), 삭제 보호, 삭제 시 최종 스냅샷 · S3 버전 관리
- 비밀값은 Secrets Manager (DB 비밀번호는 RDS 가 직접 생성·관리 — 코드·Terraform 상태에도 없음)
- 서버·배포 권한 최소화 (이 환경의 시크릿·버킷만) · 보안 업데이트 자동 적용
- 관리자 기능은 2단계 인증(OTP) 필수 · 예산 80%/초과 예상 시 이메일

### 알고 있는 한계 (정직하게)

- CloudFront ↔ 서버 구간은 HTTP 입니다. CloudFront IP 만 허용 + 비밀 헤더로 막았지만, 운영 단계에서 개인정보가 늘면 서버 인증서(HTTPS) 또는 로드밸런서 구성으로 바꾸는 것을 권장합니다.
- CloudFront 기본 주소(`*.cloudfront.net`)는 AWS 정책상 오래된 TLS 버전도 허용합니다. 도메인 연결 후에는 TLS 1.2 이상만 허용하도록 설정되어 있습니다.
- 서버 1대 구조라 배포 중 수 초 접속이 끊길 수 있습니다 (스테이징에선 허용, 운영 확장 경로는 아래 D안).
- 보안 자동 점검(Checkov) 결과 155개 통과·33개 지적 — 대부분 오탐(설정이 시작 템플릿에 있음 등) 또는 위 비용 절감 항목. 두 가지는 바로 반영(EBS 최적화, 운영 DB 로그 내보내기).

### 스테이징과 정식 운영의 구분

| 구분 | 스테이징 | 정식 운영 |
|---|---|---|
| Terraform | `infra/terraform/envs/staging` | `infra/terraform/envs/production` (설계만, 적용 금지) |
| 상태 파일 | `staging/terraform.tfstate` | `production/terraform.tfstate` |
| AWS 계정 | 같은 계정으로 시작 가능 | **별도 계정 권장** (AWS Organizations, 무료) |
| 배포 | `develop` push → 테스트 통과 → 자동 | 수동 실행 → 승인자 승인 → 배포 |
| 데이터 | 테스트·데모 데이터만 (개발 계정 없음) | 실사용자 데이터 (데모 콘텐츠 없음 — 시드가 막음) |
| 결제 키 | 토스 test 키만 (live 키는 서버가 기동 거부) | live 키 |
| 보상 | `REWARDS_LIVE=false` | 법률 검토·승인 후 |

---

## ② 서비스별 월 예상 비용

기준: **AWS Price List API 공식 요금 (서울 리전, 2026-10~11월 게시본)**, 한 달 730시간, 온디맨드(약정 없음).
원화는 **1 USD = 1,450원 가정** (이 환경에서 환율 사이트 접근 불가 — 실제 청구는 카드사 환율). 한국 사업자는 **부가세 10% 별도**.
사용량(스테이징): 전송 20GB·요청 200만·업로드 5GB·로그 2GB/월 가정.

### A. 스테이징 최소 구성 — **추천**

| 서비스 | 단가 (공식) | 월 |
|---|---|---|
| EC2 t4g.small | $0.0208/시간 | $15.18 |
| EBS gp3 30GB | $0.0912/GB | $2.74 |
| 공인 IPv4 1개 | $0.005/시간 | $3.65 |
| RDS PostgreSQL db.t4g.micro 단일 AZ | $0.025/시간 | $18.25 |
| RDS 저장소 gp3 20GB (백업은 저장소 크기까지 무료) | $0.131/GB | $2.62 |
| S3 5GB + 요청 | $0.025/GB | $0.17 |
| CloudFront 20GB + 요청 200만 | $0.120/GB, $0.012/만 건 | $4.80 |
| ECR 3GB | $0.10/GB | $0.30 |
| Secrets Manager 2개 | $0.40/개 | $0.80 |
| CloudWatch 로그 2GB·알람 4개 | $0.76/GB, $0.10/알람 | $1.95 |
| SSM·IAM·KMS(AWS 관리형 키)·예산 경보·SNS 메일 | 무료 범위 | $0 |
| **합계** | | **$50.47 (VAT 포함 $55.51 ≈ 8만 원)** |

### B. 스테이징 권장 구성 (보안·여유 강화)

A 에서 서버 t4g.medium(4GiB, $30.37), DB db.t4g.small($37.23), WAF 켬($10.20) → **$94.83 (VAT 포함 $104.31 ≈ 15만 원)**

### 비교 · 참고

| 구성 | 월 (VAT 제외) | VAT 포함 원화 |
|---|---|---|
| **A. 스테이징 최소 (추천)** | **$50** | **약 8만 원** |
| B. 스테이징 권장 | $95 | 약 15만 원 |
| C. 정식 운영 초기 (`envs/production`: t4g.medium, DB Multi-AZ 50GB, WAF, 전송 200GB) | $188 | 약 30만 원 |
| D. 고가용 운영형 (로드밸런서 + 컨테이너 4개 + NAT + DB Multi-AZ) | $295 | **약 47만 원** |
| E. 기존 초안 (로드밸런서 + 컨테이너 1개 + NAT, 웹 호스팅 미포함) | $118 | 약 19만 원 |

A 는 기존 초안(E)보다 **57% 저렴**하면서 웹 호스팅까지 포함합니다.

### 월 30만 원을 넘는 경우 (C 경계, D 초과) — 이유와 절감 방안

- **이유**: ① DB Multi-AZ(대기 DB 1대 추가로 DB 비용 2배, $74) ② NAT 게이트웨이($48) ③ 로드밸런서($30) ④ 컨테이너 4개 상시 실행($66) ⑤ 운영 트래픽 증가에 따른 전송비.
- **절감 방안**
  1. 스테이징은 A 로 시작, 운영도 C(서버 1대 + Multi-AZ DB)로 시작하고 사용자 증가 시 D 로 확장
  2. 1년 약정(Savings Plans / RDS 예약 인스턴스)으로 서버·DB 비용 절감 — 할인율은 구매 화면에서 확인 (보통 수십 % 수준)
  3. 스테이징은 야간·주말 정지 (EC2 정지 시 서버 요금 0, RDS 는 최대 7일 정지 가능) — 필요하면 자동 정지 스케줄 추가
  4. NAT 대신 현재 방식 유지, 로그 보관 기간 단축, CloudFront 무료 사용량 확인
  5. 매달 예산 경보(이미 포함)로 이상 비용 조기 발견

> 포함되지 않은 비용: 도메인 등록비(보유 중), 토스 결제 수수료, Claude API 사용료, 이메일 발송(SES), 신규 계정 크레딧·무료 사용량(있다면 더 저렴해짐).

---

## ③ Terraform 실행 계획

- 코드: `infra/terraform/modules/plit-stack` (공용) + `envs/staging` + `envs/production`
- **오프라인 plan 실행 결과 (AWS 계정 없이 구성 검증)**: `terraform validate` 통과
  - staging: **Plan: 57 to add, 0 to change, 0 to destroy** (전체 목록: `docs/infra/terraform-plan-staging.md`)
  - production(참고): 58 to add (WAF 1개 추가) — 적용하지 않음
  - 기존 AWS 리소스가 없으므로 **변경·삭제 0건**. 기존 미적용 초안은 코드에서만 삭제(AWS 에 만든 적 없음)

| 묶음 | 생성 리소스 |
|---|---|
| 네트워크 (15) | VPC, 인터넷 게이트웨이, 서브넷 4, 라우팅 2 + 연결 4, 보안그룹 2 + 규칙 3 |
| 서버 (7) | 시작 템플릿, EC2, 고정 IP, ECR 저장소 2 + 보관 정책 2 |
| DB (3) | RDS PostgreSQL, 서브넷 그룹, 파라미터 그룹(SSL 강제) |
| 파일·비밀 (13) | S3 버킷 + 보안 설정 6, 시크릿 + 값, SSM 설정값, 무작위 키 4 |
| 앞단 (1) | CloudFront 배포 |
| 권한 (7) | 서버 역할·프로필·정책 3, GitHub 배포 역할·정책 |
| 운영 (8) | 로그 그룹, 알람 4, SNS 주제·메일 구독, 예산 경보 |

- **실제 AWS 계정으로 plan**: 부트스트랩(⑦) 후 GitHub Actions **Infra plan** 실행 → 조회 전용 역할이라 아무것도 만들지 않음 → 결과를 함께 확인
- **apply (승인 후에만)**: GitHub Actions **Infra apply** → `APPLY` 입력 → GitHub 'infra-apply' 승인자 승인 버튼 → 같은 실행에서 plan 확인 후 적용
- 적용 시간 약 15~25분 (DB·CloudFront 생성이 대부분)

---

## ④ 웹 호스팅 · 도메인 연결

### 추천: 같은 서버에서 웹·API 를 같은 주소로 제공 (컨테이너)

| 후보 | 판단 |
|---|---|
| **EC2 + Docker (추천)** | Next.js 서버 기능 그대로, 로그인 쿠키(SameSite=Strict)·실시간 채팅(socket.io)이 같은 주소에서 동작, 추가 비용 없음 |
| AWS Amplify Hosting | Next.js 지원하지만 API 와 주소가 갈라져 쿠키·실시간 연결 추가 작업 + 별도 요금 |
| Vercel 등 외부 | 개인정보가 AWS 밖을 경유, 상업용 요금제 필요 |
| S3 정적 호스팅 | PLIT 웹은 서버 기능을 써서 부적합 |

- **프론트엔드**: Next.js 15 → `standalone` 빌드 Docker 이미지 (`apps/web/Dockerfile`)
- **백엔드**: NestJS → Docker 이미지 (`apps/api/Dockerfile`), Prisma 마이그레이션은 배포 때 자동
- **DB**: RDS PostgreSQL 16 (비공개), 업로드 파일은 S3
- **라우팅**: 서버 안 Caddy 가 `/api/*`·`/socket.io/*` → API, 나머지 → 웹

### 도메인 (기존 데모 도메인·DNS 는 변경하지 않음)

1. **지금**: CloudFront 기본 주소 `https://xxxx.cloudfront.net` 으로 HTTPS 운영 → **DNS 변경 0건**
2. **승인 후 스테이징 도메인** (`staging.plit.ai.kr`):
   GitHub 변수 `CUSTOM_DOMAIN` 설정 → Infra apply → 출력된 **레코드 2개**(인증서 검증용 CNAME, 서비스 연결 CNAME)를
   plit.ai.kr 을 관리하는 곳(가비아 등)에 **사용자가 직접 추가** → 인증서 발급(수 분~수십 분) 확인 → `CUSTOM_DOMAIN_READY=true` → Infra apply
   - `staging` 하위 이름만 추가하므로 기존 `plit.ai.kr`·데모 연결에는 영향 없음
3. **정식 출시 때** `plit.ai.kr`: 운영 환경에서 같은 방식 (출시 승인 시점에 진행)

---

## ⑤ GitHub 자동 배포 (CD)

```
develop 에 push
  └─ CI 재사용: API 테스트(실제 PostgreSQL) + 웹 타입체크·빌드   ── 실패 → 중단
       └─ 이미지 빌드 (ARM, 커밋 해시 태그, 덮어쓰기 금지) → ECR
            └─ SSM 으로 서버에서 deploy.sh
                 마이그레이션 → 컨테이너 교체 → 상태 확인 → 실패 시 직전 버전 자동 복귀
                 └─ CloudFront 주소로 외부 접속 확인
```

| 워크플로 | 실행 조건 | 하는 일 |
|---|---|---|
| `ci.yml` | 모든 push·PR | 테스트 (배포 워크플로가 재사용) |
| `deploy-staging.yml` | `develop` push / 수동 | 테스트 통과 시 스테이징 배포 (`STAGING_DEPLOY_ENABLED=true` 전에는 테스트만) |
| `deploy-production.yml` | **수동만** | 활성화 변수 + **production 환경 승인자 승인** 후 배포. 자동 배포 없음 |
| `infra-plan.yml` | 수동 / infra 변경 PR | 조회 전용 plan |
| `infra-apply.yml` | **수동만** (`APPLY` 입력) | infra-apply 승인자 승인 후 적용 (현재 staging 만 선택 가능) |

- AWS 로그인은 **OIDC (저장된 액세스 키 없음)**, 각 역할은 지정 GitHub 환경에서만 사용 가능
- 로컬 리허설: 실제 이미지 + Postgres + Caddy 로 deploy.sh 실행 → 마이그레이션·시드·헤더 차단·라우팅·자동 되돌림 확인 (→ `docs/testing.md`)

---

## ⑥ 최초 관리자 계정 생성 절차 (직접 수행)

이메일·비밀번호는 소스코드·환경변수 어디에도 넣지 않습니다. 이메일은 실행할 때 입력하고, 비밀번호는 서버가 무작위로 만들어 **화면에 한 번만** 보여줍니다(DB 에는 암호화 해시만).

1. AWS 콘솔 → **EC2 → 인스턴스 → `plit-staging-app` 선택 → [연결] → [Session Manager] → [연결]**
2. 열린 검은 화면에 입력:
   ```
   sudo /opt/plit/create-admin.sh 본인이메일@회사도메인
   ```
3. 표시된 **임시 비밀번호**를 바로 사용 (캡처·메신저 전송 금지). 이 화면을 닫으면 다시 볼 수 없습니다.
4. 스테이징 주소 → 로그인 → **비밀번호 변경 화면으로 자동 이동** (변경 전에는 다른 기능 사용 불가)
5. 새 비밀번호로 다시 로그인 → **계정 설정 → 2단계 인증 설정** → 휴대폰 인증 앱(Google Authenticator 등)으로 QR/설정 키 등록
6. 로그아웃 → 다시 로그인(OTP 6자리 입력) → **관리자** 메뉴 사용 가능

- 이미 최고관리자가 있으면 명령이 거부됩니다(실수·악용 방지). 추가 관리자는 기존 관리자가 관리자 화면에서 권한을 부여하세요.
- 기록: 생성(ADMIN_BOOTSTRAP)·비밀번호 변경(PASSWORD_CHANGE)이 감사 로그에 남습니다.
- 주의: 같은 명령을 'Run Command' 로 실행하면 출력(임시 비밀번호)이 AWS 에 저장되므로 **반드시 Session Manager 화면에서** 실행하세요.

---

## ⑦ 사용자가 직접 준비할 것

### 1) AWS 계정 (약 30분)
- [ ] AWS 계정 가입·결제 카드 등록 (사업자 정보 입력 시 세금계산서)
- [ ] **루트 계정 MFA 설정**, 일상 작업은 별도 관리자 사용자(IAM Identity Center)로
- [ ] 리전: **아시아 태평양(서울) ap-northeast-2**
- [ ] (권장) AWS Organizations 로 스테이징·운영 계정 분리 — 지금은 스테이징 계정만 있어도 됨
- [ ] 비용·장애 알림을 받을 이메일 주소 결정

### 2) 1회성 준비 — CloudFormation (약 10분, 비용 사실상 0원)
- [ ] 콘솔 → CloudFormation → 스택 생성 → `infra/bootstrap/bootstrap.yaml` 업로드 → 이름 `plit-bootstrap`
- [ ] 완료 후 **출력(Outputs) 4개** 를 메모: `StateBucketName`, `OidcProviderArn`, `PlanRoleArn`, `ApplyRoleArn`

### 3) GitHub 설정 (약 15분) — Settings → Environments / Variables
| 위치 | 이름 | 값 |
|---|---|---|
| 저장소 변수 | `TF_STATE_BUCKET` | StateBucketName |
| 저장소 변수 | `AWS_OIDC_PROVIDER_ARN` | OidcProviderArn |
| 저장소 변수 | `ALARM_EMAIL` | 알림 이메일 |
| 환경 `infra-plan` (배포 브랜치: develop, main) | `AWS_ROLE_ARN` | PlanRoleArn |
| 환경 `infra-apply` (**승인자: 본인**) | `AWS_ROLE_ARN` | ApplyRoleArn |
| 환경 `staging` (배포 브랜치: develop) | `AWS_DEPLOY_ROLE_ARN`, `ECR_API`, `ECR_WEB`, `INSTANCE_ID`, `APP_URL` | apply 후 출력값 (제가 정리해 드림) |
| 환경 `production` (**승인자 지정**) | — | 운영 단계에서 |
| 저장소 변수 | `STAGING_DEPLOY_ENABLED` | apply 후 `true` |

### 4) 도메인
- [ ] plit.ai.kr 을 어디서 관리하는지 확인 (가비아·후이즈·Route 53 등) — **지금은 변경하지 않음**

### 5) 나중에 (스테이징 기능 확인용, 각각 테스트 키)
- [ ] 토스페이먼츠 테스트 키(`test_gck_`/`test_sk_`) → Secrets Manager `plit-staging/app` 에 입력
- [ ] Claude API 키 (AI 코칭), 소셜 로그인 앱의 리디렉트 주소에 스테이징 주소 추가, SES(이메일), 공공데이터 키

---

## 승인 현황 (2026-11-11)

- ✅ 구성안 **A(최소)** 승인 → 부트스트랩 안내: [`infra/bootstrap-guide.md`](infra/bootstrap-guide.md)
- ✅ 알림 이메일: 대표 이메일 (GitHub 변수 `ALARM_EMAIL` 로만 보관 — 공개 저장소라 문서·코드에 적지 않음)
- ✅ 승인자: GitHub 계정 `plit1` (환경 `infra-apply`, `production`)
- ⏳ 부트스트랩 실행(사용자) → 실제 plan 확인 → apply 승인 대기

## 승인 요청 (최초)

다음 항목에 대해 결정·승인을 부탁드립니다.

1. **구성안**: A(최소, 월 약 8만 원) / B(권장, 월 약 15만 원) 중 선택 — 제안: **A 로 시작**
2. **부트스트랩 실행**: ⑦-2 를 직접 실행 (무료 수준)
3. **스테이징 apply**: 실제 plan 결과를 함께 확인한 뒤 Infra apply 실행 승인 (월 비용 발생 시작)
4. **도메인**: 당분간 `*.cloudfront.net` 사용 — `staging.plit.ai.kr` 연결은 별도 승인 시 진행
5. 운영(production)은 이번에 적용하지 않음 — 출시 준비 단계에서 다시 보고
