from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """環境変数または backend/.env から読み込む設定。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    # テスト用のDB。未設定ならテストは実行できない
    test_database_url: str | None = None
    # 画面(別オリジン)からのアクセスを許可するURL。カンマ区切りで複数指定できる
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
