from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.player import PlayerIn, PlayerOut
from app.schemas.stats import PlayerDetailOut
from app.services import players as player_service
from app.services import stats as stats_service

router = APIRouter(prefix="/players", tags=["players"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[PlayerOut])
def list_players(db: DbSession):
    """A01 プレイヤー一覧(削除済みを除く)。"""
    return player_service.list_active_players(db)


@router.get("/{player_id}", response_model=PlayerDetailOut)
def get_player_detail(player_id: int, db: DbSession):
    """A05 プレイヤー詳細(成績と、同卓者つきの対局履歴)。削除済みのプレイヤーも取得できる。"""
    return PlayerDetailOut.from_detail(stats_service.get_player_detail(db, player_id))


@router.post("", response_model=PlayerOut, status_code=status.HTTP_201_CREATED)
def create_player(body: PlayerIn, db: DbSession):
    """A02 プレイヤー登録。"""
    return player_service.create_player(db, body.name)


@router.put("/{player_id}", response_model=PlayerOut)
def rename_player(player_id: int, body: PlayerIn, db: DbSession):
    """A03 プレイヤー名の変更。"""
    return player_service.rename_player(db, player_id, body.name)


@router.delete("/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_player(player_id: int, db: DbSession):
    """A04 プレイヤー削除(論理削除)。"""
    player_service.delete_player(db, player_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
