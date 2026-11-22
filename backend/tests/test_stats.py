from decimal import Decimal
from fractions import Fraction

from app.services.stats import ResultRow, Stats, summarize

D = Decimal
F = Fraction


def row(rank_from: int, rank_to: int, points: int = 30000, score: str = "0.0") -> ResultRow:
    return ResultRow(rank_from, rank_to, points, D(score))


def test_対局が0件なら_対局数0で_順位の回数は全て0_他はNone():
    assert summarize([]) == Stats(0, None, None, None, (F(0), F(0), F(0), F(0)), None, None)


def test_1位だけ1回():
    stats = summarize([row(1, 1, points=42500, score="42.5")])

    assert stats.games_count == 1
    assert stats.total_score == D("42.5")
    assert stats.max_points == 42500
    assert stats.avg_rank == F(1)
    assert stats.rank_counts == (F(1), F(0), F(0), F(0))
    assert stats.top_rate == F(1)
    assert stats.last_rate == F(0)


def test_1位から4位まで1回ずつ():
    stats = summarize([row(1, 1), row(2, 2), row(3, 3), row(4, 4)])

    assert stats.rank_counts == (F(1), F(1), F(1), F(1))
    assert stats.avg_rank == F(5, 2)
    assert stats.top_rate == F(1, 4)
    assert stats.last_rate == F(1, 4)


def test_1位2位の同点は_1位と2位に0_5ずつ数える():
    stats = summarize([row(1, 2)])

    assert stats.rank_counts == (F(1, 2), F(1, 2), F(0), F(0))
    assert stats.avg_rank == F(3, 2)  # 1.5位
    assert stats.top_rate == F(1, 2)


def test_2位3位の同点():
    stats = summarize([row(2, 3)])

    assert stats.rank_counts == (F(0), F(1, 2), F(1, 2), F(0))
    assert stats.avg_rank == F(5, 2)


def test_3位4位の同点は_ラス率に0_5が入る():
    stats = summarize([row(3, 4)])

    assert stats.rank_counts == (F(0), F(0), F(1, 2), F(1, 2))
    assert stats.last_rate == F(1, 2)


def test_3人同点は_3つの順位に3分の1ずつ数える():
    stats = summarize([row(1, 3)])

    assert stats.rank_counts == (F(1, 3), F(1, 3), F(1, 3), F(0))
    assert stats.avg_rank == F(2)


def test_4人全員が同点なら_全ての順位に0_25ずつ():
    stats = summarize([row(1, 4)])

    assert stats.rank_counts == (F(1, 4),) * 4
    assert stats.avg_rank == F(5, 2)


def test_3分の1を3回足しても_誤差なくちょうど1になる():
    # DB の SUM(1/3) だと 0.9999 のようになる。分数で足すので誤差が出ない
    stats = summarize([row(1, 3), row(1, 3), row(1, 3)])

    assert stats.rank_counts[:3] == (F(1), F(1), F(1))


def test_順位の回数の合計は_いつも対局数と同じになる():
    rows = [row(1, 1), row(1, 2), row(2, 4), row(3, 3), row(1, 4), row(3, 4), row(4, 4)]

    stats = summarize(rows)

    assert sum(stats.rank_counts) == stats.games_count == 7


def test_通算スコアは小数の誤差なく足される():
    stats = summarize([row(1, 1, score="42.5"), row(4, 4, score="-41.5"), row(3, 3, score="-12.0")])

    assert stats.total_score == D("-11.0")


def test_最高素点は_マイナスしかなくても求まる():
    stats = summarize([row(4, 4, points=-3000), row(4, 4, points=-8000)])

    assert stats.max_points == -3000


def test_最高素点は_一番高い素点():
    stats = summarize([row(2, 2, points=31000), row(1, 1, points=58000), row(3, 3, points=22000)])

    assert stats.max_points == 58000
