#!/usr/bin/env bash
# GitHub Actions → 서버(EC2)에서 deploy.sh 실행 (SSM Run Command — SSH 포트 없이)
#   ssm-deploy.sh <instance-id> <image-tag> [--seed]
# 배포 파일(deploy/staging)을 압축해 명령과 함께 보내고, 끝날 때까지 기다려 결과를 출력한다.
set -euo pipefail
INSTANCE="${1:?instance id}"; TAG="${2:?image tag}"; SEED="${3:-}"
REGION="${AWS_REGION:-ap-northeast-2}"
B64="$(tar -C "$(dirname "$0")/../staging" -cz Caddyfile deploy.sh create-admin.sh | base64 -w0)"
PARAMS="$(jq -n --arg b "$B64" --arg t "$TAG" --arg s "$SEED" '{commands: [
  "set -euo pipefail",
  "install -d -m 700 /opt/plit && cd /opt/plit",
  ("echo " + $b + " | base64 -d | tar -xz -C /opt/plit"),
  "chmod 700 /opt/plit/deploy.sh /opt/plit/create-admin.sh",
  ("PLIT_ENV=$(cat /opt/plit/environment) /opt/plit/deploy.sh " + $t + " " + $s)
], executionTimeout: ["1500"]}')"
CMD="$(aws ssm send-command --region "$REGION" --instance-ids "$INSTANCE" --document-name AWS-RunShellScript \
  --comment "plit deploy $TAG" --parameters "$PARAMS" --query Command.CommandId --output text)"
echo "SSM 명령 $CMD"
for _ in $(seq 1 180); do
  sleep 10
  STATUS="$(aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query Status --output text 2>/dev/null || echo Pending)"
  case "$STATUS" in Pending|InProgress|Delayed) continue ;; esac
  aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query StandardOutputContent --output text
  aws ssm get-command-invocation --region "$REGION" --command-id "$CMD" --instance-id "$INSTANCE" --query StandardErrorContent --output text | tail -40
  [[ "$STATUS" == "Success" ]] && exit 0
  echo "배포 실패: $STATUS"; exit 1
done
echo "시간 초과"; exit 1
