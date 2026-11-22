from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from alembic import command
from app.config import settings
from app.database import get_db
from app.main import app

ALEMBIC_INI = Path(__file__).resolve().parent.parent / "alembic.ini"


def alembic_config(url: str) -> Config:
    """指定したDBに対して、マイグレーションを実行するための設定。"""
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("sqlalchemy.url", url)
    return config


@pytest.fixture(scope="session")
def test_engine() -> Iterator[Engine]:
    """テスト用のDBに接続するエンジン(本番用のDBには触れない)。

    テスト開始時に、マイグレーションで全テーブルを作り直す。
    """
    if not settings.test_database_url:
        pytest.skip("TEST_DATABASE_URL が設定されていません")
    config = alembic_config(settings.test_database_url)
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db(test_engine: Engine) -> Iterator[Session]:
    """テストごとのDBセッション。テストが終わったら、行った変更を全て取り消す。"""
    connection = test_engine.connect()
    transaction = connection.begin()
    # アプリ側で commit されても、外側のトランザクションで最終的に取り消せるようにする
    session = Session(
        bind=connection,
        autoflush=False,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """APIが使うDBを、テスト用のDBに差し替えたクライアント。"""
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
