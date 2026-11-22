from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.mysql import TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.game import Game
from app.models.player import Player


class GameResult(Base):
    """1対局における、1人分の結果(1対局につき4行)。"""

    __tablename__ = "game_results"
    __table_args__ = (
        UniqueConstraint("game_id", "player_id", name="uq_game_results_game_player"),
        CheckConstraint(
            "rank_from >= 1 AND rank_to <= 4 AND rank_from <= rank_to",
            name="ck_game_results_rank",
        ),
        CheckConstraint("MOD(points, 100) = 0", name="ck_game_results_points"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("players.id"), nullable=False, index=True
    )
    # 素点(100点単位。トビでマイナスになることもある)
    points: Mapped[int] = mapped_column(Integer, nullable=False)
    # 占める順位の範囲。同点でなければ rank_from = rank_to。
    # 例: 1位・2位が同点なら 1〜2(表示は 1.5位)
    rank_from: Mapped[int] = mapped_column(TINYINT, nullable=False)
    rank_to: Mapped[int] = mapped_column(TINYINT, nullable=False)
    # 最終スコア = (素点 − 30,000) ÷ 1,000 + ウマ。登録時に計算して保存する
    final_score: Mapped[Decimal] = mapped_column(Numeric(5, 1), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    )

    game: Mapped[Game] = relationship(back_populates="results")
    player: Mapped[Player] = relationship()
