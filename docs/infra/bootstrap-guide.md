# 부트스트랩(1회성 준비) 실행 안내서

> 대상: AWS 를 처음 쓰는 운영자 · 소요: AWS 계정이 있으면 약 15분 · 비용: 사실상 0원
> 이 작업은 **서버·DB 를 만들지 않습니다.** GitHub 이 AWS 에 안전하게 로그인하기 위한 "출입증"과
> Terraform 이 작업 기록을 보관할 "금고(S3 버킷)"만 만듭니다.

## 이 작업이 만드는 것 (5개)

| 이름 | 무엇인가 | 비용 |
|---|---|---|
| `plit-terraform-state-<계정번호>` (S3 버킷) | Terraform 작업 기록(상태 파일) 보관. 비공개·암호화·버전 보관 | 몇 KB → 월 1원 미만 |
| 버킷 정책 | 암호화되지 않은(HTTP) 접근 차단 | 무료 |
| GitHub OIDC 공급자 | GitHub Actions 가 **비밀번호·액세스 키 없이** AWS 에 로그인하는 연결 | 무료 |
| `plit-terraform-plan` (역할) | 계획만 조회 (리소스 생성·변경 불가). GitHub 환경 `infra-plan` 에서만 사용 가능 | 무료 |
| `plit-terraform-apply` (역할) | 실제 생성. GitHub 환경 `infra-apply` 에서 **승인 버튼을 눌러야만** 사용 가능. IAM 은 `plit-*` 이름만 다룰 수 있게 제한 | 무료 |

---

## 0단계. AWS 계정 준비 (처음인 경우)

1. https://aws.amazon.com 접속 → **AWS 계정 생성**
   - 이메일·계정 이름(예: `plit-staging`) → 연락처(사업자면 '비즈니스') → 결제 카드 → 휴대폰 인증 → 지원 플랜 **기본(무료)** 선택
2. **루트 계정 2단계 인증(MFA) 설정 — 필수**
   - 오른쪽 위 계정 이름 클릭 → **보안 자격 증명** → **MFA 디바이스 할당** → 인증 앱 선택 → 휴대폰 인증 앱(Google Authenticator 등)으로 QR 스캔 → 연속된 코드 2개 입력
3. **일상 작업용 관리자 사용자 만들기 (권장)** — 루트 계정은 금고 열쇠처럼 보관만 합니다
   - 상단 검색창에 `IAM` → **사용자** → **사용자 생성**
   - 사용자 이름: `plit-admin` · **AWS Management Console 에 대한 사용자 액세스 권한 제공** 체크 → **IAM 사용자를 생성하고 싶음** 선택 → 사용자 지정 암호 입력
   - 권한: **직접 정책 연결** → `AdministratorAccess` 체크 → 생성
   - 생성 후 이 사용자에도 **MFA 할당**, 표시된 **콘솔 로그인 URL** 을 즐겨찾기
   - 이후 작업은 이 사용자로 로그인해서 진행
4. (선택) **결제 알림**: 검색창 `Billing` → 결제 기본 설정 → 프리 티어 사용 알림·청구 알림 받기 켜기

> AWS 화면 문구는 가끔 바뀝니다. 이름이 조금 달라도 같은 위치의 메뉴를 고르면 됩니다.

---

## 1단계. 템플릿 파일 내려받기

이 파일 하나만 필요합니다: **`infra/bootstrap/bootstrap.yaml`**

- GitHub 에서: 저장소 `plit1/plitAI` → 브랜치 **develop** 선택 → `infra/bootstrap/bootstrap.yaml` 클릭 → 오른쪽 위 **다운로드(↓ Download raw file)** 버튼
- 또는 이 대화에 첨부된 파일을 저장

파일 이름은 그대로 두세요. 내용은 수정하지 않습니다.

---

## 2단계. 리전을 서울로 바꾸기 ⚠ 가장 흔한 실수

AWS 콘솔 오른쪽 위의 지역 이름을 눌러 **아시아 태평양(서울) ap-northeast-2** 를 선택합니다.
(다른 리전에서 만들어도 동작은 하지만, 이후 서버·DB 와 같은 곳에 두어야 관리가 쉽습니다.)

---

## 3단계. CloudFormation 으로 실행

1. 상단 검색창에 `CloudFormation` 입력 → **CloudFormation** 클릭
2. **스택 생성** → **새 리소스 사용(표준)** 선택
3. **템플릿 준비**: '기존 템플릿 선택(템플릿이 준비됨)'
   **템플릿 소스**: **템플릿 파일 업로드** → **파일 선택** → 1단계의 `bootstrap.yaml` → **다음**
   - 여기서 오류가 나면 파일이 잘못 저장된 것입니다(웹 페이지 HTML 로 저장되는 경우). 'Download raw file' 로 다시 받으세요.
4. **스택 세부 정보 지정**
   - 스택 이름: **`plit-bootstrap`**
   - 파라미터
     - `GitHubRepo`: **`plit1/plitAI`** (기본값 그대로)
     - `CreateOidcProvider`: **`true`** (새 계정이면 그대로. 이미 GitHub 연동을 해 둔 계정이면 아래 '문제 해결' 참고)
   - **다음**
5. **스택 옵션 구성**: 아무것도 바꾸지 않고 맨 아래 **다음**
   - (선택) 태그에 `Project` = `plit` 추가하면 비용 보고서에서 구분하기 쉬움
6. **검토 및 생성**
   - 맨 아래 **"AWS CloudFormation 에서 사용자 지정 이름으로 IAM 리소스를 생성할 수 있음을 승인합니다"** 체크
     (역할 2개를 `plit-terraform-plan`, `plit-terraform-apply` 라는 이름으로 만들기 때문에 필요)
   - **전송(제출)**
7. 상태가 `CREATE_IN_PROGRESS` → 1~2분 뒤 **`CREATE_COMPLETE`** 가 되면 완료 (새로고침 ↻ 버튼)

---

## 4단계. 결과값 4개 메모

스택 `plit-bootstrap` 선택 → **출력** 탭에서 아래 4개의 **값**을 복사해 메모장에 저장합니다.

| 키 | 예시 | 어디에 쓰나 |
|---|---|---|
| `StateBucketName` | `plit-terraform-state-123456789012` | GitHub 저장소 변수 `TF_STATE_BUCKET` |
| `OidcProviderArn` | `arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com` | 저장소 변수 `AWS_OIDC_PROVIDER_ARN` |
| `PlanRoleArn` | `arn:aws:iam::123456789012:role/plit-terraform-plan` | 환경 `infra-plan` 의 `AWS_ROLE_ARN` |
| `ApplyRoleArn` | `arn:aws:iam::123456789012:role/plit-terraform-apply` | 환경 `infra-apply` 의 `AWS_ROLE_ARN` |

이 값들은 **비밀번호가 아닙니다** (주소에 해당). 이 대화에 붙여 주셔도 됩니다.
반대로 AWS 액세스 키·루트 비밀번호·MFA 코드는 어디에도 보내지 마세요 — 이 구성은 그런 키가 필요 없습니다.

---

## 5단계. GitHub 설정 (부트스트랩 직후)

GitHub 저장소 `plit1/plitAI` → **Settings**

### 5-1. 환경(Environments) 4개 만들기 — 왼쪽 메뉴 **Environments** → **New environment**

| 환경 이름 (정확히) | 설정 |
|---|---|
| `infra-plan` | Deployment branches and tags → **Selected branches and tags** → `develop`, `main` 추가 |
| `infra-apply` | **Required reviewers** 체크 → 본인 계정 추가 → Save protection rules. 배포 브랜치는 `develop`, `main` |
| `staging` | 배포 브랜치 `develop` (변수는 apply 후에 입력) |
| `production` | **Required reviewers** → 본인(또는 대표 승인자). 지금은 변수 없음 |

### 5-2. 변수(Variables) 입력

- 저장소 변수: **Settings → Secrets and variables → Actions → Variables 탭 → New repository variable**

| 이름 | 값 |
|---|---|
| `TF_STATE_BUCKET` | StateBucketName |
| `AWS_OIDC_PROVIDER_ARN` | OidcProviderArn |
| `ALARM_EMAIL` | 장애·예산 경보를 받을 이메일 |

- 환경 변수: **Environments → 해당 환경 클릭 → Environment variables → Add variable**

| 환경 | 이름 | 값 |
|---|---|---|
| `infra-plan` | `AWS_ROLE_ARN` | PlanRoleArn |
| `infra-apply` | `AWS_ROLE_ARN` | ApplyRoleArn |

> **Secrets 가 아니라 Variables** 에 넣습니다. 위 값들은 비밀이 아니고, 워크플로가 `vars.` 로 읽습니다.
> `STAGING_DEPLOY_ENABLED` 는 아직 만들지 않습니다 (서버가 생긴 뒤).

---

## 6단계. 실제 계획(plan) 확인 — 아무것도 만들지 않음

1. GitHub → **Actions** → 왼쪽 **Infra plan** → **Run workflow** → env: `staging` → **Run workflow**
2. 2~3분 뒤 실행 결과 화면 아래 **Summary** 에 `Plan: 57 to add, 0 to change, 0 to destroy.` 가 보이면 정상
3. 결과(또는 오류 화면)를 알려 주시면 함께 확인한 뒤 **apply 승인 여부**를 정합니다.

---

## 문제 해결

| 증상 | 원인·조치 |
|---|---|
| 3단계 '파일 선택' 뒤 템플릿 오류 | 파일이 HTML 로 저장됨 → GitHub 의 **Download raw file** 로 다시 받기 |
| `CREATE_FAILED` — OIDC 공급자 이미 있음 (`already exists`) | 계정에 GitHub 연동이 이미 있음 → 실패한 스택 **삭제** 후 다시 만들 때 `CreateOidcProvider` = **false** |
| `CREATE_FAILED` — 버킷 이름 이미 있음 | 이전 시도에서 버킷이 남음(삭제해도 보존되도록 설계) → S3 에서 `plit-terraform-state-…` 버킷이 비어 있으면 삭제 후 재시도, 또는 알려 주세요 |
| 'IAM 리소스 승인' 관련 오류 | 6단계 체크박스를 체크하지 않음 → 다시 생성 |
| `ROLLBACK_COMPLETE` | 이벤트 탭의 첫 번째 빨간 줄(상태 사유)을 복사해 알려 주세요 → 스택 삭제 후 재시도 |
| Infra plan 이 `Not authorized to perform sts:AssumeRoleWithWebIdentity` | 환경 이름 오타(`infra-plan`) 또는 `AWS_ROLE_ARN` 을 저장소 변수에 넣음 → **환경 변수**로 옮기기 |
| Infra plan 이 아무 작업 없이 건너뜀 | 저장소 변수 `TF_STATE_BUCKET` 이 비어 있음 |

## 되돌리는 방법

CloudFormation → `plit-bootstrap` → **삭제**. 역할·OIDC 공급자는 지워지고, **상태 버킷은 실수 방지를 위해 남습니다**
(서버를 만든 뒤에는 이 버킷을 지우면 안 됩니다 — Terraform 이 만든 리소스 기록이 들어 있음).
