from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import settings

# pool_pre_ping: 使う前に接続が生きているか確認する(MySQL側で切断されても復旧できる)
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    """全てのテーブル(モデル)の親クラス。"""


def get_db() -> Iterator[Session]:
    """APIごとにDBセッションを1つ作り、終わったら閉じる。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
