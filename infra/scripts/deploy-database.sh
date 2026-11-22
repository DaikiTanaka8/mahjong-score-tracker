#!/bin/bash
# EC2 に MySQL をセットアップする（手元のMacで実行）
#
# 使い方:
#   bash infra/scripts/deploy-database.sh
#
# - infra/db-password.txt が無ければ、ランダムなパスワードを作る（Git には載らない）
# - setup-mysql.sh を SSM 経由で EC2 に送って実行する（何度実行しても同じ結果になる）
set -euo pipefail

source "$(dirname "$0")/lib.sh"

PASSWORD_FILE="${INFRA_DIR}/db-password.txt"
if [ ! -f "${PASSWORD_FILE}" ]; then
  echo "== DBのパスワードを作成（infra/db-password.txt。チャットやコードに貼らないこと） =="
  (umask 077; openssl rand -hex 16 > "${PASSWORD_FILE}")
fi
PW=$(cat "${PASSWORD_FILE}")
SECRET="${PW}"   # EC2 の出力にパスワードが出ても、伏せ字にする

echo "== EC2 に MySQL をセットアップ（setup-mysql.sh を実行） =="
run_script_on_ec2 "${INFRA_DIR}/scripts/setup-mysql.sh" "DB_PASSWORD=${PW}"
