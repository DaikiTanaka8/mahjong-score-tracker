#!/bin/bash
# EC2(Amazon Linux 2023)にバックエンド(FastAPI)の実行環境を作るスクリプト
#
# 使い方（EC2上で root として実行。通常は deploy-backend.sh --setup が実行する）:
#   DB_PASSWORD='パスワード' bash setup-backend.sh
#
# - uv の導入 / Python 3.15 の導入 / 仮想環境 / サービスユーザー / systemd サービス登録
# - 何度実行しても同じ結果になる（すでにあるものは作り直さない）
# - アプリは 127.0.0.1:8000 のみで待ち受ける（外部には公開しない）
#
# Python 3.15 は Amazon Linux 2023 の標準(dnf)に無いため、uv(Python の管理ツール)で入れる。
# ローカルでテストをしたバージョン(3.15)と、同じにするため。
set -euo pipefail

: "${DB_PASSWORD:?環境変数 DB_PASSWORD を指定してください}"

PYTHON_VERSION=3.15
APP_USER=mahjong
APP_DIR=/opt/mahjong
ENV_FILE=/etc/mahjong-score-tracker.env
SERVICE_NAME=mahjong-score-tracker
SERVICE_FILE=/etc/systemd/system/${SERVICE_NAME}.service
DB_NAME=mahjong_score_tracker
DB_USER=mahjong_app

# SSM から実行すると HOME が無いことがあるため、uv の置き場所を明示する
export UV_UNMANAGED_INSTALL=/usr/local/bin        # uv 本体の置き場所(シェルの設定は変更しない)
export UV_PYTHON_INSTALL_DIR=/opt/uv/python       # Python の置き場所(サービス用ユーザーも読める場所)
export UV_CACHE_DIR=/var/cache/uv
umask 022

echo "== 1. uv をインストール =="
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
fi
uv --version

echo "== 2. Python ${PYTHON_VERSION} をインストール =="
uv python install "${PYTHON_VERSION}"

echo "== 3. サービス用ユーザーとフォルダ =="
id "${APP_USER}" >/dev/null 2>&1 || useradd --system --shell /sbin/nologin "${APP_USER}"
mkdir -p "${APP_DIR}/app"
chown "${APP_USER}:${APP_USER}" "${APP_DIR}/app"

echo "== 4. 仮想環境(ライブラリの置き場所)を作成 =="
if [ ! -x "${APP_DIR}/venv/bin/python" ]; then
  uv venv --python "${PYTHON_VERSION}" "${APP_DIR}/venv"
fi
"${APP_DIR}/venv/bin/python" --version

echo "== 5. 環境変数ファイル（root のみ読める） =="
(
  umask 077
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=mysql+pymysql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:3306/${DB_NAME}
EOF
)
chmod 600 "${ENV_FILE}"

echo "== 6. systemd サービスを登録 =="
# 起動のたびに alembic upgrade head(テーブルを最新の形にする)を実行してから、uvicorn を起動する。
# すでに最新なら何も変更しないので、何度実行してもよい。
cat > "${SERVICE_FILE}" <<EOF
[Unit]
Description=mahjong-score-tracker backend (FastAPI)
After=network.target mysqld.service
Requires=mysqld.service

[Service]
User=${APP_USER}
WorkingDirectory=${APP_DIR}/app
EnvironmentFile=${ENV_FILE}
ExecStartPre=${APP_DIR}/venv/bin/alembic upgrade head
ExecStart=${APP_DIR}/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "== 完了（ソースが配置されたら deploy-backend.sh が起動します） =="
