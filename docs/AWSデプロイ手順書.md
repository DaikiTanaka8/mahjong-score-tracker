# AWSデプロイ手順書

麻雀成績管理アプリを AWS の EC2 1台にデプロイする手順です。Terraform で環境を作り、スクリプトでアプリを配置します。
2026-11-22 に、この手順で実際にデプロイして、動作を確認しました(スクリーンショットは [README](../README.md#aws-上での動作確認) を参照)。

## 1. 構成

```
Mac のブラウザ ──(HTTP 80番)──> Nginx ─┬─ /     → Next.js の静的ファイル(frontend/out の中身)
                                        └─ /api/ → FastAPI (127.0.0.1:8000) → MySQL 8.0 (127.0.0.1:3306)
                                 （すべて EC2 1台の中）
```

| 項目 | 内容 |
|---|---|
| リージョン | ap-northeast-1(東京) |
| EC2 | t3.micro / Amazon Linux 2023 / ディスク 10GB(暗号化)/ デフォルト VPC |
| DB | EC2 内の MySQL 8.0(RDS は使わない。コスト削減のため) |
| バックエンド | Python 3.15(uv で導入)+ FastAPI。systemd で uvicorn を起動 |
| フロントエンド | Next.js の静的エクスポート。Nginx が配信 |
| 転送用 S3 | ソースと画面のファイルを EC2 に渡すためのバケット(`destroy` で中身ごと削除) |
| 接続方法 | SSH は使わず、SSM(22番ポートは開けない) |
| セキュリティグループ | **自分の IP からの 80 番のみ**許可(22 / 3306 / 8000 は開けない) |

### Terraform が作るもの(10個)

- `infra/main.tf`: EC2、セキュリティグループ(入出力ルール)、SSM 用の IAM ロール・プロファイル
- `infra/s3.tf`: 転送用 S3 バケット(公開ブロック付き)と、EC2 ロールへの読み取り権限

### 主なファイル

| ファイル | 役割 | 実行場所 |
|---|---|---|
| `infra/scripts/lib.sh` | 共通部品(SSM でのコマンド実行、結果待ち、パスワードの伏せ字) | Mac |
| `infra/scripts/setup-mysql.sh` | MySQL 8.0 の導入、アプリ用の DB・ユーザー作成 | EC2 |
| `infra/scripts/deploy-database.sh` | DB のパスワードを作り、`setup-mysql.sh` を EC2 で実行 | Mac |
| `infra/scripts/setup-backend.sh` | uv・Python 3.15・仮想環境・systemd サービスの設定 | EC2 |
| `infra/scripts/deploy-backend.sh` | ソースを固めて S3 経由で EC2 に配置、ライブラリ導入、再起動 | Mac |
| `infra/scripts/setup-frontend.sh` | Nginx の導入と設定 | EC2 |
| `infra/scripts/deploy-frontend.sh` | 画面をビルドして S3 経由で EC2 に配置 | Mac |
| `infra/nginx/mahjong-score-tracker.conf` | Nginx 設定(`/api/` を FastAPI に転送) | EC2 に配置 |

## 2. 事前準備(初回のみ)

1. AWS アカウント・IAM ユーザーの作成、`aws configure` での認証設定
2. ツールのインストール: AWS CLI、Terraform、Node.js、Python 3
3. **session-manager-plugin**(SSM での接続に必要。`brew install --cask session-manager-plugin`)
4. 認証の確認: `aws sts get-caller-identity` で IAM ユーザーが表示されること

## 3. 構築手順

> コマンドはすべてリポジトリのルートで実行します。作成すると **EC2 の課金が始まります**(目安: 1時間あたり 3円前後)。

### 手順1: 自分の IP を設定

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# terraform.tfvars の my_ip_cidr を、自分の IP に書き換える(例: "203.0.113.5/32")
curl checkip.amazonaws.com   # 自分の IP の調べ方
```

`terraform.tfvars` は `.gitignore` で除外されています(コミットしません)。

### 手順2: AWS リソースの作成

```bash
cd infra
terraform init
terraform plan     # 何が作られるか確認(課金なし)。「10 to add」と出ること
terraform apply    # 実際に作成(課金開始)
```

`terraform apply` の出力に、`instance_id`・`public_ip`・`deploy_bucket` が表示されます。
作成の直後は、EC2 が SSM につながるまで 1〜2 分かかります。

### 手順3: MySQL のセットアップ

```bash
bash infra/scripts/deploy-database.sh
```

- DB のパスワードを `infra/db-password.txt` に作ります(`.gitignore` で除外。**チャットやコードに貼らない**)
- DB `mahjong_score_tracker` とユーザー `mahjong_app` を作ります(`backend/.env.example` と同じ名前)
- MySQL は `127.0.0.1` のみで待ち受けます(外部公開しない)

### 手順4: バックエンドのデプロイ

```bash
bash infra/scripts/deploy-backend.sh --setup   # 初回: EC2 の環境構築 + デプロイ
bash infra/scripts/deploy-backend.sh           # 2回目以降: デプロイのみ
```

- `--setup` で、uv と Python 3.15、サービス用ユーザー、systemd サービスを用意します
- サービスの起動時に `alembic upgrade head` が実行され、テーブルが作られます
- 最後に `/api/health` が `{"status":"ok"}` を返すことまで確認します

### 手順5: フロントエンドのデプロイ

```bash
bash infra/scripts/deploy-frontend.sh --setup   # 初回: Nginx の構築 + デプロイ
bash infra/scripts/deploy-frontend.sh           # 2回目以降: ビルド + デプロイのみ
```

## 4. 動作確認

### 4-1. EC2 の中から確認(SSM)

```bash
ID=$(terraform -chdir=infra output -raw instance_id)
aws ssm send-command --region ap-northeast-1 --instance-ids "$ID" --document-name AWS-RunShellScript \
  --parameters 'commands=["systemctl is-active nginx mysqld mahjong-score-tracker","curl -s -o /dev/null -w \"%{http_code}\\n\" http://127.0.0.1/","curl -s http://127.0.0.1/api/health"]'
```

3つのサービスが `active`、画面が `200`、API が `{"status":"ok"}` なら正常です。

### 4-2. ブラウザで確認

`http://<EC2 の公開 IP>/`(公開 IP は `terraform -chdir=infra output public_ip`)を開きます。

- 確認項目: プレイヤーの登録、対局の登録(入力チェック含む)、成績一覧への反映、再読み込み後にデータが残ること
- つながらない場合は、使用中のネットワークが 80 番の通信を妨げている可能性があります。SSM のポートフォワードを使います。

  ```bash
  aws ssm start-session --region ap-northeast-1 \
    --target "$(terraform -chdir=infra output -raw instance_id)" \
    --document-name AWS-StartPortForwardingSession \
    --parameters '{"portNumber":["80"],"localPortNumber":["8081"]}'
  ```

  開いたまま、ブラウザで `http://localhost:8081/` を開きます。

## 5. トラブルシューティング

実際のデプロイで見つかった問題と、対処です。

| 症状 | 原因 | 対処 |
|---|---|---|
| `mysql` が「Access denied for user 'root'@'localhost' (using password: NO)」になる | SSM から実行すると `HOME` が設定されず、`~/.my.cnf`(root のパスワード)が読まれない | `mysql --defaults-extra-file=/root/.my.cnf` と、ファイルを明示する(対応済み) |
| `aws s3 sync` が「Skipping file ... poweredby.png」で終了コード 2 になる | Nginx 標準のフォルダ(`/usr/share/nginx/html`)に、参照先のない壊れたリンクがある | このアプリ専用のフォルダ `/var/www/mahjong-score-tracker` を使う(対応済み) |
| MySQL のインストールで署名キーのエラー | MySQL 公式の署名キー(2023年版)は 2025-10-22 に期限切れ | 2025年版のキー `RPM-GPG-KEY-mysql-2025` を指定(対応済み)。公式のリポジトリ設定パッケージは 8.4 が選ばれるため、8.0 は自分で書く |
| Python 3.15 を `dnf` で入れられない | Amazon Linux 2023 の標準にあるのは 3.13 / 3.14 まで | uv で 3.15 を導入(テストをしたバージョンと同じにするため) |
| EC2 側のスクリプトが失敗したのに「成功」と表示される | 最後のコマンド(`rm`)の終了コードが、全体の結果になる | 終了コードを覚えておき、`rm` のあとで、その終了コードで終わる(`lib.sh`) |
| 自分の IP が変わってつながらない | セキュリティグループは、登録した IP のみ許可 | `terraform.tfvars` の IP を更新して `terraform apply` |
| EC2 を再起動したら IP が変わった | 固定 IP(Elastic IP)を使っていない | `terraform output public_ip` で再確認 |

## 6. 終了時(消し忘れ防止)

**確認を終えたら、必ず削除します。** 起動したままだと課金が続きます。

```bash
cd infra
terraform destroy         # EC2・S3・IAM・SG をすべて削除
terraform state list      # 何も表示されなければ削除済み
```

- S3 は `force_destroy = true` のため、中にファイルがあっても削除されます
- **EC2 内のデータ(登録した対局など)も消えます**
- 再開するときは、手順2〜5をやり直します(スクリプトで同じ環境を再現できます)
- `infra/db-password.txt` は、削除後に不要になります(次回の `deploy-database.sh` が作り直します)

## 7. コストの目安(東京、概算)

| 項目 | 目安 |
|---|---|
| EC2 t3.micro | 約 2円/時間(起動中のみ) |
| 公開 IPv4 アドレス | 約 0.8円/時間(EC2 起動中のみ) |
| EBS 10GB | 月約 190円(EC2 を停止しても課金される。`destroy` で削除) |
| 転送用 S3 | 月 1円未満 |
| RDS / ALB / NAT / CloudFront | 作らない(常時課金のため) |

正確な料金は、AWS の料金ページと請求ダッシュボードで確認してください。**課金アラート(Budgets)の設定を推奨します。**

## 8. 注意事項

- HTTP のみ・認証なしです。アクセスは自分の IP に限定しています。パスワードや個人情報は入力しないでください
- DB のパスワードは、デプロイ時に SSM のコマンドとして送られるため、AWS 側の SSM の実行履歴に残ります。使い捨ての環境のためこの方法にしています(長く運用する場合は、SSM パラメータストアなどに変更します)
- アプリのソースコードは、デプロイのために変更していません(本番の API の宛先は、最初から `/api` です)
- TaskManagement との差分: Java → Python(uv)、PostgreSQL → MySQL 8.0、ソースを S3 に置いて EC2 側でライブラリを導入、SSM の共通処理を `lib.sh` にまとめた
