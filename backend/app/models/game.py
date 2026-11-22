from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, Date, DateTime, Integer, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.game_result import GameResult


class Game(Base):
    """対局。結果(4人分)は game_results に持つ。"""

    __tablename__ = "games"
    __table_args__ = (
        CheckConstraint("kyotaku >= 0 AND MOD(kyotaku, 100) = 0", name="ck_games_kyotaku"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    played_on: Mapped[date] = mapped_column(Date, nullable=False)
    # 供託(場に残った点数)。0でなければ「供託が残って終了した対局」
    kyotaku: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    )

    # 対局を削除したら、結果の行もDB側(ON DELETE CASCADE)で一緒に消える
    results: Mapped[list["GameResult"]] = relationship(
        back_populates="game",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="GameResult.rank_from, GameResult.player_id",
    )
