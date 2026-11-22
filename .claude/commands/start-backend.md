ポート8000の競合を確認し、既存プロセスを停止してからFastAPIバックエンドを起動してください。

手順:
1. `lsof -ti:8000 | xargs kill -9 2>/dev/null || true` を実行してポートを解放
2. `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000` でサーバーを起動
