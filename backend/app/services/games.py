"""対局の登録・編集・取得・削除。入力チェックの仕様は docs/API設計.md の 4 章を参照。"""

from dataclasses import dataclass
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from app.errors import NotFoundError, ValidationFailed
from app.models import Game, GameResult, Player
from app.schemas.game import GameIn
from app.services.scoring import PLAYER_COUNT, TOTAL_POINTS, calculate_scores

NOT_FOUND_MESSAGE = "対局が見つかりません"


@dataclass(frozen=True)
class ValidGame:
    """入力チェックを通った、保存できる形の対局。"""

    played_on: date
    kyotaku: int
    entries: list[tuple[int, int]]  # (プレイヤーID, 素点)


def list_games(db: Session) -> list[Game]:
    """対局日の新しい順。同じ日は登録が新しい順。"""
    return list(
        db.scalars(
            _game_query().order_by(Game.played_on.desc(), Game.id.desc()),
        )
    )


def get_game(db: Session, game_id: int) -> Game:
    game = db.scalars(_game_query().where(Game.id == game_id)).one_or_none()
    if game is None:
        raise NotFoundError(NOT_FOUND_MESSAGE)
    return game


def create_game(db: Session, data: GameIn) -> Game:
    valid = _validate(db, data, allowed_deleted_player_ids=set())

    game = Game(played_on=valid.played_on, kyotaku=valid.kyotaku)
    game.results = _build_results(valid)
    db.add(game)
    db.commit()
    return get_game(db, game.id)


def update_game(db: Session, game_id: int, data: GameIn) -> Game:
    game = get_game(db, game_id)
    # 対局にもともと参加している削除済みのプレイヤーは、そのまま選んでよい
    already_in_game = {r.player_id for r in game.results}
    valid = _validate(db, data, allowed_deleted_player_ids=already_in_game)

    game.played_on = valid.played_on
    game.kyotaku = valid.kyotaku
    game.updated_at = func.now()
    # 結果は丸ごと置き換える。同じプレイヤーを残す場合に、ユニーク制約とぶつからないよう、
    # 先に古い行を消してから、新しい行を入れる
    db.execute(delete(GameResult).where(GameResult.game_id == game.id))
    db.expire(game, ["results"])
    db.add_all(_build_results(valid, game_id=game.id))
    db.commit()
    return get_game(db, game_id)


def delete_game(db: Session, game_id: int) -> None:
    """対局を削除する。結果の4行は、DBの外部キー(ON DELETE CASCADE)で一緒に消える。"""
    game = get_game(db, game_id)
    db.delete(game)
    db.commit()


def _game_query():
    # populate_existing: 編集のあとなど、すでに読み込み済みの対局も、DBの最新の内容で読み直す
    return (
        select(Game)
        .options(selectinload(Game.results).joinedload(GameResult.player))
        .execution_options(populate_existing=True)
    )


def _build_results(valid: ValidGame, game_id: int | None = None) -> list[GameResult]:
    """素点から順位とスコアを計算して、保存する行を作る。"""
    rows = []
    for score in calculate_scores(valid.entries):
        row = GameResult(
            player_id=score.player_id,
            points=score.points,
            rank_from=score.rank_from,
            rank_to=score.rank_to,
            final_score=score.final_score,
        )
        if game_id is not None:
            row.game_id = game_id
        rows.append(row)
    return rows


def _validate(db: Session, data: GameIn, allowed_deleted_player_ids: set[int]) -> ValidGame:
    """入力チェック。見つかった誤りは、1つずつ止まらずに全部まとめて返す。"""
    errors: list[dict[str, str]] = []

    def add(field: str, message: str) -> None:
        errors.append({"field": field, "message": message})

    played_on = _parse_date(data.played_on)
    if played_on is None:
        add("played_on", "対局日を入力してください")

    results = data.results
    has_four = len(results) == PLAYER_COUNT
    player_ids = [r.player_id for r in results]
    if not has_four or any(pid is None for pid in player_ids):
        add("results", "4人のプレイヤーを選択してください")
    else:
        _check_players(db, player_ids, allowed_deleted_player_ids, add)

    # 素点
    points = [r.points for r in results]
    points_complete = has_four and all(p is not None for p in points)
    if has_four and not points_complete:
        add("results", "4人分の素点を入力してください")
    points_valid = points_complete and all(p % 100 == 0 for p in points)
    if points_complete and not points_valid:
        add("results", "素点は100点単位で入力してください")

    # 供託
    kyotaku_valid = data.kyotaku >= 0 and data.kyotaku % 100 == 0
    if not kyotaku_valid:
        add("kyotaku", "供託は0以上の100点単位で入力してください")

    # 合計(他の入力が正しいときだけ確認する)
    if points_valid and kyotaku_valid:
        total = sum(points) + data.kyotaku
        if total != TOTAL_POINTS:
            add(
                "results",
                f"素点の合計と供託の合計が {TOTAL_POINTS:,}点になっていません(現在: {total:,}点)",
            )

    if errors:
        raise ValidationFailed(errors)

    return ValidGame(
        played_on=played_on,
        kyotaku=data.kyotaku,
        entries=[(r.player_id, r.points) for r in results],
    )


def _check_players(
    db: Session,
    player_ids: list[int],
    allowed_deleted_player_ids: set[int],
    add,
) -> None:
    if len(set(player_ids)) != len(player_ids):
        add("results", "同じプレイヤーを重複して選べません")
        return

    found = {p.id: p for p in db.scalars(select(Player).where(Player.id.in_(player_ids)))}
    if len(found) != len(player_ids):
        add("results", "選択したプレイヤーが見つかりません")
        return

    if any(
        p.deleted_at is not None and p.id not in allowed_deleted_player_ids
        for p in found.values()
    ):
        add("results", "削除されたプレイヤーは選べません")


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None
