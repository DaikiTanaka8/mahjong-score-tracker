from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.stats import PlayerStatsOut
from app.services import stats as stats_service

router = APIRouter(prefix="/stats", tags=["stats"])

DbSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=list[PlayerStatsOut])
def list_stats(db: DbSession):
    """A06 成績一覧(削除されていないプレイヤー全員)。並び替えは画面側で行う。"""
    return [PlayerStatsOut.from_player(p, s) for p, s in stats_service.list_player_stats(db)]
