from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.database import get_db
from app.main import app


@pytest.fixture(scope="session")
def test_engine():
    """テスト用のDBに接続するエンジン(本番用のDBには触れない)。"""
    if not settings.test_database_url:
        pytest.skip("TEST_DATABASE_URL が設定されていません")
    engine = create_engine(settings.test_database_url, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture
def db(test_engine) -> Iterator[Session]:
    session = sessionmaker(bind=test_engine, autoflush=False, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    """APIが使うDBを、テスト用のDBに差し替えたクライアント。"""
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()
