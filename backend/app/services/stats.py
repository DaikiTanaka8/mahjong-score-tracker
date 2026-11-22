"""成績の集計と、プレイヤーごとの対局履歴(docs/API設計.md の A05・A06)。

集計は、DB の SUM ではなく Python で行う。同点の按分(1 ÷ 人数)を、
小数の誤差が出ない分数(Fraction)で正確に足し合わせるため。
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from fractions import Fraction
from typing import NamedTuple

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.errors import NotFoundError
from app.models import Game, GameResult, Player
from app.services.scoring import PLAYER_COUNT

PLAYER_NOT_FOUND_MESSAGE = "プレイヤーが見つかりません"


class ResultRow(NamedTuple):
    """集計に使う、1人の1対局分の結果。"""

    rank_from: int
    rank_to: int
    points: int
    final_score: Decimal


@dataclass(frozen=True)
class Stats:
    """1人分の成績。対局が0件のときは、対局数が0・順位の回数が全て0で、他は None。"""

    games_count: int
    total_score: Decimal | None
    max_points: int | None
    avg_rank: Fraction | None
    rank_counts: tuple[Fraction, ...]  # 1位〜4位の回数(同点は 1 ÷ 人数 ずつ按分)
    top_rate: Fraction | None  # 1位の回数 ÷ 対局数
    last_rate: Fraction | None  # 4位の回数 ÷ 対局数


@dataclass(frozen=True)
class TableMate:
    """同卓者(同じ対局の、自分以外の3人)。"""

    player_id: int
    name: str
    deleted: bool
    rank: Fraction
    points: int


@dataclass(frozen=True)
class HistoryItem:
    """プレイヤー1人から見た、1対局分の履歴。"""

    game_id: int
    played_on: date
    points: int
    rank: Fraction
    final_score: Decimal
    table_mates: list[TableMate]


@dataclass(frozen=True)
class PlayerDetail:
    player: Player
    stats: Stats
    history: list[HistoryItem]


def summarize(rows: Sequence[ResultRow]) -> Stats:
    """1人分の結果の一覧から、成績を計算する。"""
    count = len(rows)
    if count == 0:
        return Stats(0, None, None, None, (Fraction(0),) * PLAYER_COUNT, None, None)

    rank_counts = [Fraction(0)] * PLAYER_COUNT
    for row in rows:
        share = Fraction(1, row.rank_to - row.rank_from + 1)
        for rank in range(row.rank_from, row.rank_to + 1):
            rank_counts[rank - 1] += share

    return Stats(
        games_count=count,
        total_score=sum((r.final_score for r in rows), Decimal(0)),
        max_points=max(r.points for r in rows),
        avg_rank=sum(display_rank(r.rank_from, r.rank_to) for r in rows) / count,
        rank_counts=tuple(rank_counts),
        top_rate=rank_counts[0] / count,
        last_rate=rank_counts[PLAYER_COUNT - 1] / count,
    )


def display_rank(rank_from: int, rank_to: int) -> Fraction:
    """表示用の順位。同点なら 1.5 などになる。"""
    return Fraction(rank_from + rank_to, 2)


def list_player_stats(db: Session) -> list[tuple[Player, Stats]]:
    """削除されていないプレイヤー全員の成績(A06)。プレイヤーIDの昇順。"""
    players = list(
        db.scalars(select(Player).where(Player.deleted_at.is_(None)).order_by(Player.id))
    )
    rows_by_player: dict[int, list[ResultRow]] = {p.id: [] for p in players}

    results = db.execute(
        select(GameResult.player_id, GameResult).where(
            GameResult.player_id.in_(list(rows_by_player))
        )
    )
    for player_id, result in results:
        rows_by_player[player_id].append(_to_row(result))

    return [(p, summarize(rows_by_player[p.id])) for p in players]


def get_player_detail(db: Session, player_id: int) -> PlayerDetail:
    """プレイヤーの成績と、同卓者つきの対局履歴(A05)。削除済みのプレイヤーも取得できる。"""
    player = db.get(Player, player_id)
    if player is None:
        raise NotFoundError(PLAYER_NOT_FOUND_MESSAGE)

    games = db.scalars(
        select(Game)
        .join(GameResult, GameResult.game_id == Game.id)
        .where(GameResult.player_id == player_id)
        .options(selectinload(Game.results).joinedload(GameResult.player))
        .order_by(Game.played_on.desc(), Game.id.desc())
    )

    history: list[HistoryItem] = []
    rows: list[ResultRow] = []
    for game in games:
        own = next(r for r in game.results if r.player_id == player_id)
        rows.append(_to_row(own))
        history.append(
            HistoryItem(
                game_id=game.id,
                played_on=game.played_on,
                points=own.points,
                rank=display_rank(own.rank_from, own.rank_to),
                final_score=own.final_score,
                # game.results は順位順(同点はプレイヤーIDの昇順)に並んでいる
                table_mates=[
                    TableMate(
                        player_id=r.player_id,
                        name=r.player.name,
                        deleted=r.player.deleted_at is not None,
                        rank=display_rank(r.rank_from, r.rank_to),
                        points=r.points,
                    )
                    for r in game.results
                    if r.player_id != player_id
                ],
            )
        )

    return PlayerDetail(player=player, stats=summarize(rows), history=history)


def _to_row(result: GameResult) -> ResultRow:
    return ResultRow(result.rank_from, result.rank_to, result.points, result.final_score)
