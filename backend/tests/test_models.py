from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from app.models import Game, GameResult, Player

# MySQL は、CHECK制約の違反を IntegrityError ではなく OperationalError(3819)で返す。
# どちらも DBAPIError の仲間なので、「DBが拒否した」ことを DBAPIError で確認する


def make_player(db: Session, name: str, deleted: bool = False) -> Player:
    player = Player(name=name, deleted_at=datetime(2026, 11, 22) if deleted else None)
    db.add(player)
    db.flush()
    db.refresh(player)  # 生成列(active_name)などDB側で決まる値を読み込む
    return player


def make_game(db: Session, kyotaku: int = 0) -> Game:
    game = Game(played_on=date(2026, 11, 22), kyotaku=kyotaku)
    db.add(game)
    db.flush()
    return game


def make_result(game: Game, player: Player, **kwargs) -> GameResult:
    values = {"points": 30000, "rank_from": 1, "rank_to": 1, "final_score": Decimal("30.0")}
    values.update(kwargs)
    return GameResult(game=game, player=player, **values)


class TestPlayer:
    def test_登録すると_active_nameに名前が入る(self, db: Session):
        player = make_player(db, "田中")

        assert player.active_name == "田中"
        assert player.is_deleted is False

    def test_削除すると_active_nameがNULLになる(self, db: Session):
        player = make_player(db, "田中")

        player.deleted_at = datetime(2026, 11, 22)
        db.flush()
        db.refresh(player)

        assert player.active_name is None
        assert player.is_deleted is True

    def test_削除されていない同名のプレイヤーは登録できない(self, db: Session):
        make_player(db, "田中")

        with pytest.raises(IntegrityError):
            make_player(db, "田中")

    def test_削除済みの名前は_新しく登録し直せる(self, db: Session):
        make_player(db, "田中", deleted=True)

        new_player = make_player(db, "田中")

        assert new_player.active_name == "田中"

    def test_削除済みの同名のプレイヤーは_何人でもいてよい(self, db: Session):
        make_player(db, "田中", deleted=True)
        make_player(db, "田中", deleted=True)

        count = len(db.scalars(select(Player).where(Player.name == "田中")).all())

        assert count == 2

    def test_名前が21文字以上だと登録できない(self, db: Session):
        with pytest.raises(DBAPIError):
            make_player(db, "あ" * 21)


class TestGame:
    def test_供託を省略すると0になる(self, db: Session):
        game = make_game(db)
        db.refresh(game)

        assert game.kyotaku == 0

    def test_供託は100点単位で保存できる(self, db: Session):
        game = make_game(db, kyotaku=1000)

        assert game.kyotaku == 1000

    @pytest.mark.parametrize("kyotaku", [-100, 50, 1050])
    def test_供託が負の数や100点単位でないと保存できない(self, db: Session, kyotaku: int):
        with pytest.raises(DBAPIError):
            make_game(db, kyotaku=kyotaku)


class TestGameResult:
    def test_対局に4人分の結果を保存できる(self, db: Session):
        game = make_game(db)
        players = [make_player(db, n) for n in ["田中", "佐藤", "鈴木", "高橋"]]
        for rank, player in enumerate(players, start=1):
            db.add(make_result(game, player, rank_from=rank, rank_to=rank))
        db.flush()
        db.refresh(game)

        assert [r.player.name for r in game.results] == ["田中", "佐藤", "鈴木", "高橋"]

    def test_同点の順位は_範囲で保存できる(self, db: Session):
        game = make_game(db)
        tied = make_result(game, make_player(db, "田中"), rank_from=1, rank_to=2)
        db.add(tied)
        db.flush()

        assert (tied.rank_from, tied.rank_to) == (1, 2)

    def test_素点はマイナスでも保存できる(self, db: Session):
        game = make_game(db)
        db.add(make_result(game, make_player(db, "田中"), points=-2000))

        db.flush()

    def test_最終スコアは小数第1位まで保存できる(self, db: Session):
        game = make_game(db)
        result = make_result(game, make_player(db, "田中"), final_score=Decimal("-41.5"))
        db.add(result)
        db.flush()
        db.refresh(result)

        assert result.final_score == Decimal("-41.5")

    def test_同じ対局に同じプレイヤーを2回入れられない(self, db: Session):
        game = make_game(db)
        player = make_player(db, "田中")
        db.add(make_result(game, player))
        db.flush()

        with pytest.raises(IntegrityError):
            db.add(make_result(game, player))
            db.flush()

    @pytest.mark.parametrize(
        ("rank_from", "rank_to"),
        [(0, 1), (1, 5), (3, 2), (5, 5)],
    )
    def test_順位の範囲が不正だと保存できない(self, db: Session, rank_from: int, rank_to: int):
        game = make_game(db)

        with pytest.raises(DBAPIError):
            db.add(
                make_result(
                    game, make_player(db, "田中"), rank_from=rank_from, rank_to=rank_to
                )
            )
            db.flush()

    def test_素点が100点単位でないと保存できない(self, db: Session):
        game = make_game(db)

        with pytest.raises(DBAPIError):
            db.add(make_result(game, make_player(db, "田中"), points=32550))
            db.flush()

    def test_対局を削除すると_結果も一緒に削除される(self, db: Session):
        game = make_game(db)
        player = make_player(db, "田中")
        db.add(make_result(game, player))
        db.flush()

        db.delete(game)
        db.flush()

        assert db.scalars(select(GameResult).where(GameResult.player_id == player.id)).all() == []

    def test_存在しないプレイヤーの結果は保存できない(self, db: Session):
        game = make_game(db)

        with pytest.raises(IntegrityError):
            db.add(
                GameResult(
                    game_id=game.id,
                    player_id=999999,
                    points=30000,
                    rank_from=1,
                    rank_to=1,
                    final_score=Decimal("0"),
                )
            )
            db.flush()

    def test_対局に参加したプレイヤーは_行を物理削除できない(self, db: Session):
        # プレイヤーの削除は論理削除(deleted_at)で行う。物理削除は外部キーで防ぐ
        game = make_game(db)
        player = make_player(db, "田中")
        db.add(make_result(game, player))
        db.flush()

        with pytest.raises(IntegrityError):
            db.delete(player)
            db.flush()
