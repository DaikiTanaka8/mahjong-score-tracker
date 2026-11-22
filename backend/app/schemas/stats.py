from datetime import date

from pydantic import BaseModel

from app.models import Player
from app.services.stats import HistoryItem, PlayerDetail, Stats, TableMate


def _number(value) -> float | None:
    """分数・Decimal を、JSONの数値(float)にする。丸めは画面側で行う。"""
    return None if value is None else float(value)


class StatsOut(BaseModel):
    games_count: int
    total_score: float | None
    max_points: int | None
    avg_rank: float | None
    rank_counts: list[float]  # 1位〜4位の回数
    top_rate: float | None  # 0〜1
    last_rate: float | None  # 0〜1

    @classmethod
    def from_stats(cls, stats: Stats) -> "StatsOut":
        return cls(
            games_count=stats.games_count,
            total_score=_number(stats.total_score),
            max_points=stats.max_points,
            avg_rank=_number(stats.avg_rank),
            rank_counts=[float(n) for n in stats.rank_counts],
            top_rate=_number(stats.top_rate),
            last_rate=_number(stats.last_rate),
        )


class PlayerStatsOut(StatsOut):
    """成績一覧(A06)の1人分。"""

    player_id: int
    name: str

    @classmethod
    def from_player(cls, player: Player, stats: Stats) -> "PlayerStatsOut":
        return cls(
            player_id=player.id,
            name=player.name,
            **StatsOut.from_stats(stats).model_dump(),
        )


class PlayerInfo(BaseModel):
    id: int
    name: str
    deleted: bool


class TableMateOut(BaseModel):
    player_id: int
    name: str
    deleted: bool
    rank: float
    points: int

    @classmethod
    def from_mate(cls, mate: TableMate) -> "TableMateOut":
        return cls(
            player_id=mate.player_id,
            name=mate.name,
            deleted=mate.deleted,
            rank=float(mate.rank),
            points=mate.points,
        )


class HistoryItemOut(BaseModel):
    game_id: int
    played_on: date
    points: int
    rank: float
    final_score: float
    table_mates: list[TableMateOut]

    @classmethod
    def from_item(cls, item: HistoryItem) -> "HistoryItemOut":
        return cls(
            game_id=item.game_id,
            played_on=item.played_on,
            points=item.points,
            rank=float(item.rank),
            final_score=float(item.final_score),
            table_mates=[TableMateOut.from_mate(m) for m in item.table_mates],
        )


class PlayerDetailOut(BaseModel):
    player: PlayerInfo
    stats: StatsOut
    history: list[HistoryItemOut]

    @classmethod
    def from_detail(cls, detail: PlayerDetail) -> "PlayerDetailOut":
        return cls(
            player=PlayerInfo(
                id=detail.player.id,
                name=detail.player.name,
                deleted=detail.player.deleted_at is not None,
            ),
            stats=StatsOut.from_stats(detail.stats),
            history=[HistoryItemOut.from_item(i) for i in detail.history],
        )
