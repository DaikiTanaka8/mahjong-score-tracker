#!/bin/bash
# EC2(Amazon Linux 2023)に MySQL 8.0 をセットアップするスクリプト
#
# 使い方（EC2上で root として実行。通常は deploy-database.sh が実行する）:
#   DB_PASSWORD='パスワード' bash setup-mysql.sh
#
# - パスワードはスクリプトに書かず、環境変数 DB_PASSWORD で渡す
# - 何度実行しても同じ結果になる（すでにあるものは作り直さない）
# - MySQL は 127.0.0.1 のみで待ち受ける（外部には公開しない）
# - メモリ 1GB の EC2 で動くように、メモリ設定を小さくする
set -euo pipefail

: "${DB_PASSWORD:?環境変数 DB_PASSWORD を指定してください}"

DB_NAME=mahjong_score_tracker   # backend/.env.example の DATABASE_URL に合わせる
DB_USER=mahjong_app

echo "== 1. スワップ(1GB)を作成（メモリ不足対策。初回のみ） =="
if ! swapon --show | grep -q /swapfile; then
  if [ ! -f /swapfile ]; then
    dd if=/dev/zero of=/swapfile bs=1M count=1024 status=none
    chmod 600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
swapon --show

echo "== 2. MySQL 8.0 のリポジトリを追加 =="
# Amazon Linux 2023 の標準リポジトリには MySQL が無い。MySQL 公式の EL9 用を使う。
# 公式のリポジトリ設定パッケージを使うと 8.4 が選ばれるため、8.0 を指定して自分で書く。
# 署名キーは 2025 年版を使う（2023 年版は 2025-10-22 に期限切れ）。
rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2025
cat > /etc/yum.repos.d/mysql-community.repo <<'EOF'
[mysql80-community]
name=MySQL 8.0 Community Server
baseurl=https://repo.mysql.com/yum/mysql-8.0-community/el/9/$basearch/
enabled=1
gpgcheck=1
gpgkey=https://repo.mysql.com/RPM-GPG-KEY-mysql-2025
EOF

echo "== 3. MySQL 8.0 をインストール =="
dnf install -y mysql-community-server
mysqld --version

echo "== 4. 設定ファイル（メモリを小さく・外部に公開しない） =="
cat > /etc/my.cnf <<'EOF'
[mysqld]
datadir=/var/lib/mysql
socket=/var/lib/mysql/mysql.sock
log-error=/var/log/mysqld.log
pid-file=/var/run/mysqld/mysqld.pid

# 外部に公開しない（同じEC2の中のアプリからだけ接続できる）
bind-address=127.0.0.1
mysqlx=OFF

character-set-server=utf8mb4
collation-server=utf8mb4_0900_ai_ci

# メモリ 1GB の EC2 向けに小さくする
performance_schema=OFF
innodb_buffer_pool_size=128M
max_connections=30
EOF

echo "== 5. データの初期化（初回のみ）と、起動・自動起動の設定 =="
# --initialize-insecure: root のパスワードを空で作る(すぐ次の手順で設定する。外部には公開していない)
if [ ! -d /var/lib/mysql/mysql ]; then
  mysqld --initialize-insecure --user=mysql
fi
systemctl enable mysqld
systemctl restart mysqld

echo "== 6. root のパスワードを設定（初回のみ。root だけが読める /root/.my.cnf に保存） =="
if [ ! -f /root/.my.cnf ]; then
  ROOT_PW=$(openssl rand -hex 16)
  mysql -uroot -e "ALTER USER 'root'@'localhost' IDENTIFIED BY '${ROOT_PW}';"
  (
    umask 077
    printf '[client]\nuser=root\npassword=%s\n' "${ROOT_PW}" > /root/.my.cnf
  )
fi

echo "== 7. アプリ用のDBとユーザーを作成 =="
# SSM から実行すると HOME が無く、~/.my.cnf が読まれないため、ファイルを明示的に指定する
MYSQL_ROOT=(mysql --defaults-extra-file=/root/.my.cnf)
# パスワードは hex 文字(0-9a-f)のみの想定なので、SQL に埋め込んでも安全
"${MYSQL_ROOT[@]}" <<SQL
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
SQL

echo "== 完了 =="
systemctl is-active mysqld
"${MYSQL_ROOT[@]}" -e "SELECT VERSION();"
