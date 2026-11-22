from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.game import GameIn, GameOut
from app.services import games as game_service

router = APIRouter(prefix="/games", tags=["games"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[GameOut])
def list_games(db: DbSession):
    """A07 対局一覧(対局日の新しい順)。"""
    return [GameOut.from_model(g) for g in game_service.list_games(db)]


@router.get("/{game_id}", response_model=GameOut)
def get_game(game_id: int, db: DbSession):
    """A08 対局1件の取得。"""
    return GameOut.from_model(game_service.get_game(db, game_id))


@router.post("", response_model=GameOut, status_code=status.HTTP_201_CREATED)
def create_game(body: GameIn, db: DbSession):
    """A09 対局登録。順位とスコアは素点から計算する。"""
    return GameOut.from_model(game_service.create_game(db, body))


@router.put("/{game_id}", response_model=GameOut)
def update_game(game_id: int, body: GameIn, db: DbSession):
    """A10 対局編集。結果は丸ごと置き換える。"""
    return GameOut.from_model(game_service.update_game(db, game_id, body))


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_game(game_id: int, db: DbSession):
    """A11 対局削除。"""
    game_service.delete_game(db, game_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
