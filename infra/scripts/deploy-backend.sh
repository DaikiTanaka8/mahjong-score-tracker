#!/bin/bash
# バックエンドを EC2 にデプロイするスクリプト（手元のMacで実行）
#
# 使い方:
#   bash infra/scripts/deploy-backend.sh --setup   # 初回: EC2の環境構築 + デプロイ
#   bash infra/scripts/deploy-backend.sh           # 2回目以降: デプロイのみ
#
# 前提: deploy-database.sh を実行済み（MySQL と db-password.txt がある）
# 流れ: backend/ のソースを固める → S3 にアップロード → SSM 経由で EC2 が取得
#       → ライブラリをインストール → サービス再起動(起動時にテーブルを最新の形にする)
set -euo pipefail

source "$(dirname "$0")/lib.sh"

APP_DIR=/opt/mahjong
SERVICE=mahjong-score-tracker

if [ "${1:-}" = "--setup" ]; then
  echo "== EC2の環境構築（setup-backend.sh を実行） =="
  PW=$(cat "${INFRA_DIR}/db-password.txt")
  SECRET="${PW}"
  run_script_on_ec2 "${INFRA_DIR}/scripts/setup-backend.sh" "DB_PASSWORD=${PW}"
  SECRET=""
fi

echo "== backend/ のソースを固める（テスト・仮想環境・.env は含めない） =="
WORK_DIR=$(mktemp -d)
trap 'rm -rf "${WORK_DIR}"' EXIT
# COPYFILE_DISABLE: Mac が付ける余計なファイル(._*)を入れない
COPYFILE_DISABLE=1 tar -czf "${WORK_DIR}/backend.tar.gz" -C "${REPO_ROOT}/backend" \
  --exclude '__pycache__' --exclude '*.pyc' \
  app alembic alembic.ini requirements.txt

echo "== S3 にアップロード =="
aws s3 cp "${WORK_DIR}/backend.tar.gz" "s3://${BUCKET}/backend/backend.tar.gz" \
  --region "${REGION}" --only-show-errors

echo "== EC2 に配置して再起動 =="
# --only-binary: ビルド済みのライブラリだけを入れる(メモリ1GBでのコンパイルを避ける)
ssm_run "set -euo pipefail
aws s3 cp s3://${BUCKET}/backend/backend.tar.gz /tmp/backend.tar.gz --region ${REGION} --only-show-errors
systemctl stop ${SERVICE} 2>/dev/null || true
rm -rf ${APP_DIR}/app
mkdir -p ${APP_DIR}/app
tar -xzf /tmp/backend.tar.gz --no-same-owner -C ${APP_DIR}/app
rm -f /tmp/backend.tar.gz
UV_CACHE_DIR=/var/cache/uv /usr/local/bin/uv pip install --python ${APP_DIR}/venv/bin/python --only-binary :all: -r ${APP_DIR}/app/requirements.txt
chown -R mahjong:mahjong ${APP_DIR}/app
systemctl restart ${SERVICE}
for i in \$(seq 1 30); do
  curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1 && break
  sleep 2
done
journalctl -u ${SERVICE} -n 15 --no-pager
systemctl is-active ${SERVICE}
curl -fsS http://127.0.0.1:8000/api/health"
