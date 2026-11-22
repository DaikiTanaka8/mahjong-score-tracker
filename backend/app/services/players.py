from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.errors import ConflictError, NotFoundError, ValidationFailed
from app.models import Player

NAME_MAX_LENGTH = 20

NOT_FOUND_MESSAGE = "プレイヤーが見つかりません"
DUPLICATE_MESSAGE = "その名前はすでに登録されています"


def list_active_players(db: Session) -> list[Player]:
    """削除されていないプレイヤーを、登録が古い順に返す。"""
    return list(
        db.scalars(select(Player).where(Player.deleted_at.is_(None)).order_by(Player.id))
    )


def create_player(db: Session, name: str) -> Player:
    name = _validate_name(name)
    _ensure_not_duplicated(db, name)

    player = Player(name=name)
    db.add(player)
    _commit(db)
    return player


def rename_player(db: Session, player_id: int, name: str) -> Player:
    player = _get_active_player(db, player_id)
    name = _validate_name(name)
    _ensure_not_duplicated(db, name, excluding_id=player.id)

    player.name = name
    _commit(db)
    return player


def delete_player(db: Session, player_id: int) -> None:
    """論理削除する。過去の対局は残り、新しい対局には選べなくなる。"""
    player = _get_active_player(db, player_id)
    player.deleted_at = func.now()
    db.commit()


def _get_active_player(db: Session, player_id: int) -> Player:
    player = db.get(Player, player_id)
    if player is None or player.deleted_at is not None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return player


def _validate_name(name: str) -> str:
    """前後の空白(全角も含む)を取り除き、未入力・長すぎる名前を弾く。"""
    name = name.strip()
    if not name:
        raise ValidationFailed.single("name", "名前を入力してください")
    if len(name) > NAME_MAX_LENGTH:
        raise ValidationFailed.single("name", f"名前は{NAME_MAX_LENGTH}文字以内で入力してください")
    return name


def _ensure_not_duplicated(db: Session, name: str, excluding_id: int | None = None) -> None:
    """削除されていないプレイヤーの中に、同じ名前がいないことを確認する。"""
    query = select(Player.id).where(Player.deleted_at.is_(None), Player.name == name)
    if excluding_id is not None:
        query = query.where(Player.id != excluding_id)
    if db.scalar(query) is not None:
        raise ConflictError(DUPLICATE_MESSAGE, field="name")


def _commit(db: Session) -> None:
    """保存する。確認の直後に同時に登録された場合は、DBのユニーク制約が最後の砦になる。"""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise ConflictError(DUPLICATE_MESSAGE, field="name") from None
