from datetime import date
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, PlainSerializer

from app.models import Game, GameResult

# Decimal を、JSONでは文字列ではなく数値(例: 42.5)で返す
JsonNumber = Annotated[Decimal, PlainSerializer(float, return_type=float, when_used="json")]


class GameResultIn(BaseModel):
    """1人分の入力。足りない項目は、サービス層で日本語のメッセージを返す。"""

    player_id: int | None = None
    points: int | None = None


class GameIn(BaseModel):
    """対局の登録・編集のリクエスト。

    played_on は、日付として不正な場合も「対局日を入力してください」を返したいので、
    文字列で受け取って、サービス層で日付に変換する。
    """

    played_on: str | None = None
    kyotaku: int = 0
    results: list[GameResultIn] = []


class GameResultOut(BaseModel):
    player_id: int
    player_name: str
    player_deleted: bool
    points: int
    rank_from: int
    rank_to: int
    rank: JsonNumber  # 表示用の順位。同点なら 1.5 などの小数
    final_score: JsonNumber

    @classmethod
    def from_model(cls, result: GameResult) -> "GameResultOut":
        return cls(
            player_id=result.player_id,
            player_name=result.player.name,
            player_deleted=result.player.deleted_at is not None,
            points=result.points,
            rank_from=result.rank_from,
            rank_to=result.rank_to,
            rank=Decimal(result.rank_from + result.rank_to) / 2,
            final_score=result.final_score,
        )


class GameOut(BaseModel):
    id: int
    played_on: date
    kyotaku: int
    results: list[GameResultOut]

    @classmethod
    def from_model(cls, game: Game) -> "GameOut":
        return cls(
            id=game.id,
            played_on=game.played_on,
            kyotaku=game.kyotaku,
            results=[GameResultOut.from_model(r) for r in game.results],
        )
