from decimal import Decimal

import pytest

from app.services.scoring import PlayerScore, calculate_scores, is_valid_total

D = Decimal

# 期待値は docs/機能要件.md の計算式で手計算した値。
#   最終スコア = (素点 − 30,000) ÷ 1,000 + ウマ(同点は分け合う)
#   ウマ: 1位 +30、2位 +10、3位 −10、4位 −30
# 各行: (プレイヤーID, 順位の開始, 順位の終了, 最終スコア)  ※順位順に並ぶ
CASES = {
    "同点なし": (
        [(1, 42500), (2, 31000), (3, 28000), (4, 18500)],
        [(1, 1, 1, D("42.5")), (2, 2, 2, D("11.0")), (3, 3, 3, D("-12.0")), (4, 4, 4, D("-41.5"))],
        0,
    ),
    "1位・2位が同点(1.5位)": (
        [(1, 36000), (2, 36000), (3, 28000), (4, 20000)],
        [(1, 1, 2, D("26.0")), (2, 1, 2, D("26.0")), (3, 3, 3, D("-12.0")), (4, 4, 4, D("-40.0"))],
        0,
    ),
    "2位・3位が同点(2.5位)": (
        [(1, 40000), (2, 30000), (3, 30000), (4, 20000)],
        [(1, 1, 1, D("40.0")), (2, 2, 3, D("0.0")), (3, 2, 3, D("0.0")), (4, 4, 4, D("-40.0"))],
        0,
    ),
    "3位・4位が同点(3.5位)": (
        [(1, 45000), (2, 35000), (3, 20000), (4, 20000)],
        [(1, 1, 1, D("45.0")), (2, 2, 2, D("15.0")), (3, 3, 4, D("-30.0")), (4, 3, 4, D("-30.0"))],
        0,
    ),
    "1位〜3位の3人が同点(2位)": (
        [(1, 35000), (2, 35000), (3, 35000), (4, 15000)],
        [(1, 1, 3, D("15.0")), (2, 1, 3, D("15.0")), (3, 1, 3, D("15.0")), (4, 4, 4, D("-45.0"))],
        0,
    ),
    "2位〜4位の3人が同点(3位)": (
        [(1, 45000), (2, 25000), (3, 25000), (4, 25000)],
        [(1, 1, 1, D("45.0")), (2, 2, 4, D("-15.0")), (3, 2, 4, D("-15.0")), (4, 2, 4, D("-15.0"))],
        0,
    ),
    "4人全員が同点(2.5位)": (
        [(1, 30000), (2, 30000), (3, 30000), (4, 30000)],
        [(1, 1, 4, D("0.0")), (2, 1, 4, D("0.0")), (3, 1, 4, D("0.0")), (4, 1, 4, D("0.0"))],
        0,
    ),
    "1位・2位の同点と3位・4位の同点が同時": (
        [(1, 40000), (2, 40000), (3, 20000), (4, 20000)],
        [(1, 1, 2, D("30.0")), (2, 1, 2, D("30.0")), (3, 3, 4, D("-30.0")), (4, 3, 4, D("-30.0"))],
        0,
    ),
    "トビ(素点がマイナス)": (
        [(1, 50000), (2, 40000), (3, 33000), (4, -3000)],
        [(1, 1, 1, D("50.0")), (2, 2, 2, D("20.0")), (3, 3, 3, D("-7.0")), (4, 4, 4, D("-63.0"))],
        0,
    ),
    "供託が残った対局(供託 1,000点)": (
        [(2, 38000), (1, 29000), (4, 27000), (3, 25000)],
        [(2, 1, 1, D("38.0")), (1, 2, 2, D("9.0")), (4, 3, 3, D("-13.0")), (3, 4, 4, D("-35.0"))],
        1000,
    ),
}


@pytest.mark.parametrize("name", CASES.keys())
def test_順位の範囲と最終スコアが正しく計算される(name: str):
    entries, expected, _ = CASES[name]

    results = calculate_scores(entries)

    actual = [(r.player_id, r.rank_from, r.rank_to, r.final_score) for r in results]
    assert actual == expected


@pytest.mark.parametrize("name", CASES.keys())
def test_最終スコアの合計は_供託を1000で割った値のマイナスになる(name: str):
    # 供託がなければ合計は 0。供託が残った対局では、供託はだれの素点にもならないので 0 にならない
    entries, _, kyotaku = CASES[name]

    results = calculate_scores(entries)

    assert sum(r.final_score for r in results) == D(-kyotaku) / 1000


@pytest.mark.parametrize("name", CASES.keys())
def test_最終スコアは小数第1位までの値になる(name: str):
    entries, _, _ = CASES[name]

    results = calculate_scores(entries)

    assert all(r.final_score.as_tuple().exponent == -1 for r in results)


@pytest.mark.parametrize(
    ("name", "expected_ranks"),
    [
        ("同点なし", [D(1), D(2), D(3), D(4)]),
        ("1位・2位が同点(1.5位)", [D("1.5"), D("1.5"), D(3), D(4)]),
        ("2位・3位が同点(2.5位)", [D(1), D("2.5"), D("2.5"), D(4)]),
        ("3位・4位が同点(3.5位)", [D(1), D(2), D("3.5"), D("3.5")]),
        ("1位〜3位の3人が同点(2位)", [D(2), D(2), D(2), D(4)]),
        ("2位〜4位の3人が同点(3位)", [D(1), D(3), D(3), D(3)]),
        ("4人全員が同点(2.5位)", [D("2.5")] * 4),
        ("1位・2位の同点と3位・4位の同点が同時", [D("1.5"), D("1.5"), D("3.5"), D("3.5")]),
    ],
)
def test_表示用の順位は_範囲の平均になる(name: str, expected_ranks: list[Decimal]):
    entries, _, _ = CASES[name]

    results = calculate_scores(entries)

    assert [r.rank for r in results] == expected_ranks


def test_機能要件の計算例_1位2位の同点():
    # docs/機能要件.md 2.3 の計算例そのまま
    results = calculate_scores([(1, 36000), (2, 36000), (3, 28000), (4, 20000)])

    assert [r.final_score for r in results] == [D("26.0"), D("26.0"), D("-12.0"), D("-40.0")]


def test_入力の順番に関係なく_順位順に並ぶ():
    results = calculate_scores([(3, 18500), (1, 42500), (4, 28000), (2, 31000)])

    assert [r.player_id for r in results] == [1, 2, 4, 3]


def test_同点の人は_プレイヤーIDの昇順に並ぶ():
    results = calculate_scores([(4, 36000), (3, 36000), (2, 28000), (1, 20000)])

    assert [r.player_id for r in results] == [3, 4, 2, 1]


def test_計算結果はPlayerScoreで返る():
    results = calculate_scores([(1, 42500), (2, 31000), (3, 28000), (4, 18500)])

    assert results[0] == PlayerScore(
        player_id=1, points=42500, rank_from=1, rank_to=1, final_score=D("42.5")
    )


@pytest.mark.parametrize("count", [0, 1, 3, 5])
def test_4人分でないとエラーになる(count: int):
    entries = [(i, 30000) for i in range(1, count + 1)]

    with pytest.raises(ValueError, match="4人分"):
        calculate_scores(entries)


def test_プレイヤーが重複しているとエラーになる():
    with pytest.raises(ValueError, match="重複"):
        calculate_scores([(1, 40000), (1, 30000), (2, 30000), (3, 20000)])


class TestIsValidTotal:
    def test_素点の合計が12万点ならOK(self):
        assert is_valid_total([42500, 31000, 28000, 18500], kyotaku=0) is True

    def test_素点の合計と供託の合計が12万点ならOK(self):
        assert is_valid_total([38000, 29000, 27000, 25000], kyotaku=1000) is True

    def test_供託を足しても12万点にならないとNG(self):
        assert is_valid_total([38000, 29000, 27000, 25000], kyotaku=0) is False
        assert is_valid_total([38000, 29000, 27000, 25000], kyotaku=2000) is False

    def test_素点の合計が12万点を超えるとNG(self):
        assert is_valid_total([42600, 31000, 28000, 18500], kyotaku=0) is False
