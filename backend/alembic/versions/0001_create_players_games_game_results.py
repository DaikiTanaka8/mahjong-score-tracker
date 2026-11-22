"""create players games game_results

Revision ID: 0001
Revises:
Create Date: 2026-11-22

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import mysql

from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CREATED_AT_DEFAULT = sa.text("CURRENT_TIMESTAMP")
UPDATED_AT_DEFAULT = sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP")


def upgrade() -> None:
    op.create_table(
        "players",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(length=20), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        # 削除されていないときだけ name と同じ値、削除済みなら NULL になる生成列
        sa.Column(
            "active_name",
            sa.String(length=20),
            sa.Computed("IF(deleted_at IS NULL, name, NULL)", persisted=True),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(), server_default=CREATED_AT_DEFAULT, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=UPDATED_AT_DEFAULT, nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("active_name"),
    )
    op.create_table(
        "games",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("played_on", sa.Date(), nullable=False),
        sa.Column("kyotaku", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=CREATED_AT_DEFAULT, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=UPDATED_AT_DEFAULT, nullable=False),
        sa.CheckConstraint("kyotaku >= 0 AND MOD(kyotaku, 100) = 0", name="ck_games_kyotaku"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "game_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("points", sa.Integer(), nullable=False),
        sa.Column("rank_from", mysql.TINYINT(), nullable=False),
        sa.Column("rank_to", mysql.TINYINT(), nullable=False),
        sa.Column("final_score", sa.Numeric(precision=5, scale=1), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=CREATED_AT_DEFAULT, nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=UPDATED_AT_DEFAULT, nullable=False),
        sa.CheckConstraint("MOD(points, 100) = 0", name="ck_game_results_points"),
        sa.CheckConstraint(
            "rank_from >= 1 AND rank_to <= 4 AND rank_from <= rank_to",
            name="ck_game_results_rank",
        ),
        # 対局を削除したら、その結果の行も一緒に消す
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_id"], ["players.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "player_id", name="uq_game_results_game_player"),
    )
    op.create_index(op.f("ix_game_results_player_id"), "game_results", ["player_id"], unique=False)


def downgrade() -> None:
    # インデックス(ix_game_results_player_id)は、テーブルと一緒に消える。
    # 外部キーが使っているインデックスは、単独では消せない(MySQLの仕様)
    op.drop_table("game_results")
    op.drop_table("games")
    op.drop_table("players")
