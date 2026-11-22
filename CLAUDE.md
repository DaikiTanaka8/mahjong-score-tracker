# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

麻雀の成績を記録・管理する Web アプリ（複数人で利用可能）。RaiseTech AI エンジニアコースの最終課題として、アプリ作成から AWS デプロイまでを行う。

## 技術スタック

- **バックエンド:** Python + FastAPI（SQLAlchemy + Alembic）
- **フロントエンド:** Next.js + TypeScript（静的エクスポート `output: 'export'` で Nginx から配信）
- **データベース:** MySQL 8.0
- **インフラ:** AWS（EC2 1台 + Nginx + Terraform + SSM）。TaskManagement と同じ構成

## プロジェクト構成（予定）

```
mahjong-score-tracker/
├── backend/          # FastAPI アプリケーション（ポート 8000）
│   ├── app/
│   │   ├── routers/      # API ルーター
│   │   ├── services/     # ビジネスロジック
│   │   ├── models/       # SQLAlchemy モデル
│   │   └── schemas/      # Pydantic スキーマ（リクエスト/レスポンス）
│   ├── alembic/          # DB マイグレーション
│   └── requirements.txt
├── frontend/         # Next.js アプリケーション（ポート 3000）
├── infra/            # Terraform / デプロイスクリプト
└── docs/             # 設計ドキュメント（要件定義書など）
```

## バックエンドのコマンド

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000   # 開発サーバー起動
pytest                                      # 全テスト実行
pytest tests/test_xxx.py                    # 特定のテストのみ実行
ruff check .                                # リント
```

## フロントエンドのコマンド

```bash
cd frontend
npm run dev      # 開発サーバー起動（ポート 3000）
npm run lint     # ESLint
npm run build    # 静的ファイルのビルド
```

## GitHub ワークフロールール（厳守）

### 大原則
- **main ブランチへの直接プッシュは絶対禁止**
- 作業は必ずイシュー起票 → ブランチ作成 → PR → レビュー → マージの順で行う

### イシュー登録ルール
- 作業を始める前に必ずイシューを登録する
- タイトルは日本語で、何をするかが一目でわかるように書く
- ラベルを必ず1つ以上付ける（下記参照）
- 作業内容・完了条件を本文に記載する

### ラベル一覧
| ラベル | 用途 |
|--------|------|
| `feature` | 新機能の追加 |
| `bug` | バグ修正 |
| `refactor` | リファクタリング |
| `docs` | ドキュメント更新 |
| `test` | テスト追加・修正 |
| `chore` | 依存関係更新・設定変更など |

### ブランチ命名規則
```
{type}/#{issue番号}-{内容を英語で短く}
```
例：
- `feature/#5-game-create-api`
- `bug/#12-fix-null-pointer`
- `refactor/#8-extract-service-layer`

### プルリクエストルール
- タイトルは `[#イシュー番号] 日本語でやったこと` の形式
- 本文に `Closes #イシュー番号` を記載してイシューと紐付ける
- main への直接プッシュは禁止（ブランチ保護により強制）

### Claude Code での作業手順
1. `gh issue create` でイシューを起票
2. `git checkout -b feature/#N-description` でブランチ作成
3. 実装・コミット
4. `gh pr create` でPRを作成
5. PRをマージしてブランチを削除

### コミットメッセージ規則
フォーマット: `{type}: {日本語で内容を簡潔に}`

| type | 用途 |
|------|------|
| `feat` | 新機能の追加 |
| `fix` | バグ修正 |
| `refactor` | リファクタリング |
| `docs` | ドキュメント更新 |
| `test` | テスト追加・修正 |
| `chore` | 依存関係更新・設定変更など |

例：
- `feat: 対局登録APIを追加`
- `fix: 順位計算の誤りを修正`
- `docs: 要件定義書を更新`

## サーバー起動ルール（厳守）

### 使用ポート
| サーバー | ポート |
|---------|--------|
| バックエンド（FastAPI / uvicorn） | 8000 |
| フロントエンド（Next.js） | 3000 |

### ポート競合時の対応（必須）

サーバーを起動する前に必ずポートの使用状況を確認し、**競合している場合は既存プロセスを停止してから起動すること。**
別ポートで一時的に起動することは禁止。必ず上記の指定ポートで起動すること。

```bash
# バックエンド起動（ポート 8000）
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000

# フロントエンド起動（ポート 3000）
lsof -ti:3000 | xargs kill -9 2>/dev/null || true
cd frontend && npm run dev
```

## Claude Code への必須ルール（絶対に守ること）

以下のルールはいかなる場合も例外なく守ること。

1. **コードの変更を伴う作業は必ずイシューを起票してから始める**
2. **作業は必ず専用ブランチを切って行う（main ブランチへの直接コミット・プッシュは絶対禁止）**
3. **ブランチ名は命名規則 `{type}/#{issue番号}-{英語で内容}` に従う**
4. **実装完了後は必ず PR を作成する（main への直接マージ禁止）**
5. **コミットメッセージは上記の規則に従い日本語で記載する**
6. **サーバー起動前にポート競合を確認し、競合があれば既存プロセスを停止してから指定ポートで起動する**
7. **コマンドを実行する前に、何をするコマンドなのかを日本語で説明する**
