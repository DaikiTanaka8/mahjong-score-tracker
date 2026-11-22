#!/bin/bash
# フロントエンドをビルドして EC2 にデプロイするスクリプト（手元のMacで実行）
#
# 使い方:
#   bash infra/scripts/deploy-frontend.sh --setup   # 初回: Nginxの構築 + デプロイ
#   bash infra/scripts/deploy-frontend.sh           # 2回目以降: ビルド + デプロイのみ
#
# 流れ: Macでビルド(out/ ができる) → S3にアップロード → SSM経由でEC2が取得 → Nginxの公開フォルダに配置
set -euo pipefail

source "$(dirname "$0")/lib.sh"

if [ "${1:-}" = "--setup" ]; then
  echo "== EC2の環境構築（setup-frontend.sh を実行） =="
  CONF_B64=$(gzip -c "${INFRA_DIR}/nginx/mahjong-score-tracker.conf" | base64 | tr -d '\n')
  run_script_on_ec2 "${INFRA_DIR}/scripts/setup-frontend.sh" "NGINX_CONF_B64=${CONF_B64}"
fi

echo "== フロントエンドをビルド =="
# NEXT_PUBLIC_API_BASE_URL を外す: 本番は、画面と同じサーバーの /api を使うため
( cd "${REPO_ROOT}/frontend" && npm ci --silent && env -u NEXT_PUBLIC_API_BASE_URL npm run build --silent )
[ -f "${REPO_ROOT}/frontend/out/index.html" ] || { echo "ビルドの結果(frontend/out/index.html)が見つかりません" >&2; exit 1; }

echo "== S3 にアップロード（out/ を丸ごと同期） =="
aws s3 sync "${REPO_ROOT}/frontend/out/" "s3://${BUCKET}/frontend/" --delete --region "${REGION}" --only-show-errors

echo "== EC2 に配置 =="
ssm_run "set -euo pipefail
mkdir -p /var/www/mahjong-score-tracker
aws s3 sync s3://${BUCKET}/frontend/ /var/www/mahjong-score-tracker/ --delete --region ${REGION} --only-show-errors
chmod -R a+rX /var/www/mahjong-score-tracker
systemctl reload nginx
ls /var/www/mahjong-score-tracker | head"
