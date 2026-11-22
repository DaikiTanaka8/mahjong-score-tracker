"""順位とスコアの計算(最高位戦ルール)。

DB にも API にも依存しない、純粋な計算だけを置く。
仕様は docs/機能要件.md の 2.1〜2.3 を参照。
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

PLAYER_COUNT = 4
START_POINTS = 30000  # 持ち点
RETURN_POINTS = 30000  # 返し点(オカなし)
TOTAL_POINTS = START_POINTS * PLAYER_COUNT  # 4人の素点 + 供託 の合計(120,000点)
UMA = (30, 10, -10, -30)  # 1位〜4位のウマ(順位点)

_ONE_THOUSAND = Decimal(1000)
_SCORE_STEP = Decimal("0.1")


@dataclass(frozen=True)
class PlayerScore:
    """1人分の計算結果。"""

    player_id: int
    points: int
    rank_from: int  # 占める順位の範囲の開始(同点でなければ rank_to と同じ)
    rank_to: int  # 占める順位の範囲の終了
    final_score: Decimal

    @property
    def rank(self) -> Decimal:
        """表示用の順位。同点なら 1.5 などの小数になる。"""
        return Decimal(self.rank_from + self.rank_to) / 2


def calculate_scores(entries: Sequence[tuple[int, int]]) -> list[PlayerScore]:
    """4人分の (プレイヤーID, 素点) から、順位の範囲と最終スコアを計算する。

    - 素点が同じ人は同点として、占める順位の範囲を共有する(例: 1位・2位が同点なら 1〜2)。
    - 同点の人のウマは、占める順位のウマの合計を人数で割った値(分け合う)。
    - 最終スコア = (素点 − 返し点) ÷ 1,000 + ウマ
    - 結果は順位順に並べる。同点の人は、プレイヤーIDの昇順。

    Raises:
        ValueError: 4人分でない、またはプレイヤーが重複しているとき。
    """
    if len(entries) != PLAYER_COUNT:
        raise ValueError(f"{PLAYER_COUNT}人分の素点が必要です(受け取った人数: {len(entries)})")
    if len({player_id for player_id, _ in entries}) != PLAYER_COUNT:
        raise ValueError("同じプレイヤーを重複して指定できません")

    ordered = sorted(entries, key=lambda e: (-e[1], e[0]))

    results: list[PlayerScore] = []
    start = 0
    while start < PLAYER_COUNT:
        # 同じ素点が続く範囲(同点のグループ)を探す
        end = start
        while end + 1 < PLAYER_COUNT and ordered[end + 1][1] == ordered[start][1]:
            end += 1

        size = end - start + 1
        uma = Decimal(sum(UMA[start : end + 1])) / size  # 同点の人でウマを分け合う
        for player_id, points in ordered[start : end + 1]:
            score = Decimal(points - RETURN_POINTS) / _ONE_THOUSAND + uma
            results.append(
                PlayerScore(
                    player_id=player_id,
                    points=points,
                    rank_from=start + 1,
                    rank_to=end + 1,
                    final_score=score.quantize(_SCORE_STEP),
                )
            )
        start = end + 1

    return results


def is_valid_total(points: Sequence[int], kyotaku: int) -> bool:
    """4人の素点の合計 + 供託 が 120,000点になっているか。"""
    return sum(points) + kyotaku == TOTAL_POINTS
