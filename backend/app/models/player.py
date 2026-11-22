from datetime import datetime

from sqlalchemy import Computed, DateTime, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Player(Base):
    """プレイヤー。削除は論理削除(deleted_at に日時を入れる)。"""

    __tablename__ = "players"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(20), nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # 削除されていないときだけ name と同じ値、削除済みなら NULL になる生成列。
    # これにユニーク制約をつけることで「削除されていないプレイヤーの間でだけ名前の重複を禁止」する
    # (MySQL は NULL どうしを重複とみなさないため、削除済みの名前は何件あってもよい)
    active_name: Mapped[str | None] = mapped_column(
        String(20),
        Computed("IF(deleted_at IS NULL, name, NULL)", persisted=True),
        unique=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=text("CURRENT_TIMESTAMP")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
