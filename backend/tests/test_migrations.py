from sqlalchemy import inspect
from sqlalchemy.engine import Engine

from alembic import command
from app.config import settings
from tests.conftest import alembic_config

TABLES = {"players", "games", "game_results"}


def table_names(engine: Engine) -> set[str]:
    return set(inspect(engine).get_table_names()) - {"alembic_version"}


def test_upgradeで3つのテーブルができる(test_engine: Engine):
    assert table_names(test_engine) == TABLES


def test_downgradeで全テーブルが消え_もう一度upgradeで戻せる(test_engine: Engine):
    config = alembic_config(settings.test_database_url)

    command.downgrade(config, "base")
    assert table_names(test_engine) == set()

    command.upgrade(config, "head")
    assert table_names(test_engine) == TABLES
