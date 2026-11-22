#!/bin/bash
# デプロイ用スクリプト(Mac側)の共通部品。deploy-*.sh から `source` して使う。
#
# 提供するもの:
#   REGION / REPO_ROOT / INFRA_DIR / BUCKET / INSTANCE_ID  … 設定値
#   ssm_run 'シェルスクリプトの文字列'                     … EC2 でコマンドを実行して結果を表示
#   run_script_on_ec2 ファイル 'VAR=値 ...'                … Mac のスクリプトファイルを EC2 で実行
#
# 環境変数 SECRET に値(パスワード)を入れておくと、EC2 の出力に含まれていても「********」に置き換える。

REGION=ap-northeast-1
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INFRA_DIR="${REPO_ROOT}/infra"

BUCKET=$(terraform -chdir="${INFRA_DIR}" output -raw deploy_bucket)
INSTANCE_ID=$(terraform -chdir="${INFRA_DIR}" output -raw instance_id)

# 出力に含まれる SECRET を伏せ字にする
mask() {
  if [ -n "${SECRET:-}" ]; then sed "s/${SECRET}/********/g"; else cat; fi
}

# SSM(Session Manager の仲間のコマンド実行機能)で、EC2 にシェルスクリプトを送って実行し、
# 終わるまで待って出力を表示する。EC2 側で失敗したら、このスクリプトも失敗にする。
#   $1: EC2 で実行するシェルスクリプト(複数行でもよい)
ssm_run() {
  local params cid status
  # JSON は python で作る(引用符や改行を自分で扱うと、間違えやすいため)
  params=$(python3 -I -c 'import json,sys; print(json.dumps({"commands": [sys.argv[1]]}))' "$1")
  cid=$(aws ssm send-command --region "${REGION}" --instance-ids "${INSTANCE_ID}" \
    --document-name AWS-RunShellScript --timeout-seconds 900 \
    --parameters "${params}" --query 'Command.CommandId' --output text)
  for _ in $(seq 1 180); do
    status=$(aws ssm get-command-invocation --region "${REGION}" --command-id "${cid}" \
      --instance-id "${INSTANCE_ID}" --query 'Status' --output text 2>/dev/null || echo Pending)
    case "${status}" in InProgress|Pending|Delayed) sleep 5 ;; *) break ;; esac
  done
  aws ssm get-command-invocation --region "${REGION}" --command-id "${cid}" \
    --instance-id "${INSTANCE_ID}" --query '[StandardOutputContent,StandardErrorContent]' --output text | mask
  [ "${status}" = "Success" ] || { echo "失敗: ${status}" >&2; exit 1; }
}

# Mac にあるスクリプトファイルを、EC2 に送って実行する。
#   $1: スクリプトファイルのパス
#   $2: 実行するときに渡す環境変数(例: "DB_PASSWORD=xxxx")。なくてもよい
run_script_on_ec2() {
  local name b64
  name=$(basename "$1")
  b64=$(gzip -c "$1" | base64 | tr -d '\n')
  # bash の終了コードを覚えておき、一時ファイルを消してから、その終了コードで終わる
  # (最後のコマンドが rm だと、スクリプトが失敗しても「成功」になってしまうため)
  ssm_run "echo ${b64} | base64 -d | gunzip > /tmp/${name}
${2:-} bash /tmp/${name}
rc=\$?
rm -f /tmp/${name}
exit \$rc"
}
