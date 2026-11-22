"""成績一覧(A06)とプレイヤー詳細(A05)のAPIテスト。

画面設計のモック(docs/mock/index.html)と同じサンプルデータを使う。
同点・供託・削除済みのプレイヤーを含む5対局。
"""

import pytest
from fastapi.testclient import TestClient

# (対局日, 供託, [(名前, 素点), ...])  登録の順番 = 対局ID の順番
GAMES = [
    ("2026-11-10", 0, [("高橋", 33000), ("佐藤", 31000), ("田中", 30000), ("鈴木", 26000)]),
    ("2026-11-15", 0, [("鈴木", 45000), ("田中", 25000), ("佐藤", 25000), ("高橋", 25000)]),
    ("2026-11-20", 0, [("田中", 36000), ("山田", 36000), ("鈴木", 28000), ("高橋", 20000)]),
    ("2026-11-22", 0, [("田中", 42500), ("佐藤", 31000), ("鈴木", 28000), ("高橋", 18500)]),
    ("2026-11-22", 1000, [("佐藤", 38000), ("田中", 29000), ("高橋", 27000), ("鈴木", 25000)]),
]


@pytest.fixture
def scenario(client: TestClient) -> dict:
    """5対局を登録し、最後に「山田」を削除する。プレイヤーIDと対局IDを返す。"""
    player_ids = {}
    for name in ["田中", "佐藤", "鈴木", "高橋", "山田"]:
        player_ids[name] = client.post("/api/players", json={"name": name}).json()["id"]

    game_ids = []
    for played_on, kyotaku, entries in GAMES:
        body = {
            "played_on": played_on,
            "kyotaku": kyotaku,
            "results": [{"player_id": player_ids[n], "points": p} for n, p in entries],
        }
        response = client.post("/api/games", json=body)
        assert response.status_code == 201, response.text
        game_ids.append(response.json()["id"])

    client.delete(f"/api/players/{player_ids['山田']}")
    return {"players": player_ids, "games": game_ids}


def stats_of(client: TestClient, name: str) -> dict:
    return next(s for s in client.get("/api/stats").json() if s["name"] == name)


class TestStatsList:
    def test_削除されていないプレイヤー全員が_IDの昇順で返る(self, client: TestClient, scenario):
        response = client.get("/api/stats")

        assert response.status_code == 200
        assert [s["name"] for s in response.json()] == ["田中", "佐藤", "鈴木", "高橋"]

    def test_項目名が_API設計書どおり(self, client: TestClient, scenario):
        stat = client.get("/api/stats").json()[0]

        assert set(stat) == {
            "player_id", "name", "games_count", "total_score", "max_points",
            "avg_rank", "rank_counts", "top_rate", "last_rate",
        }  # fmt: skip

    def test_田中の成績(self, client: TestClient, scenario):
        stat = stats_of(client, "田中")

        assert stat["player_id"] == scenario["players"]["田中"]
        assert stat["games_count"] == 5
        assert stat["total_score"] == pytest.approx(52.5)
        assert stat["max_points"] == 42500
        assert stat["avg_rank"] == pytest.approx(2.1)
        # 1.5位の対局で 1位 0.5・2位 0.5、3人同点(2〜4位)の対局で 2位・3位・4位 に 1/3 ずつ
        assert stat["rank_counts"] == pytest.approx([1.5, 11 / 6, 4 / 3, 1 / 3])
        assert stat["top_rate"] == pytest.approx(0.3)
        assert stat["last_rate"] == pytest.approx(1 / 15)

    def test_佐藤の成績(self, client: TestClient, scenario):
        stat = stats_of(client, "佐藤")

        assert stat["games_count"] == 4
        assert stat["total_score"] == pytest.approx(45.0)
        assert stat["max_points"] == 38000
        assert stat["avg_rank"] == pytest.approx(2.0)
        assert stat["rank_counts"] == pytest.approx([1, 7 / 3, 1 / 3, 1 / 3])
        assert stat["top_rate"] == pytest.approx(0.25)
        assert stat["last_rate"] == pytest.approx(1 / 12)

    def test_鈴木の成績(self, client: TestClient, scenario):
        stat = stats_of(client, "鈴木")

        assert stat["games_count"] == 5
        assert stat["total_score"] == pytest.approx(-48.0)
        assert stat["max_points"] == 45000
        assert stat["avg_rank"] == pytest.approx(3.0)
        assert stat["rank_counts"] == pytest.approx([1, 0, 2, 2])
        assert stat["top_rate"] == pytest.approx(0.2)
        assert stat["last_rate"] == pytest.approx(0.4)

    def test_高橋の成績(self, client: TestClient, scenario):
        stat = stats_of(client, "高橋")

        assert stat["total_score"] == pytest.approx(-76.5)
        assert stat["max_points"] == 33000
        assert stat["avg_rank"] == pytest.approx(3.0)
        assert stat["rank_counts"] == pytest.approx([1, 1 / 3, 4 / 3, 7 / 3])
        assert stat["last_rate"] == pytest.approx(7 / 15)

    def test_順位の回数の合計は_対局数と同じ(self, client: TestClient, scenario):
        for stat in client.get("/api/stats").json():
            assert sum(stat["rank_counts"]) == pytest.approx(stat["games_count"])

    def test_対局が0件のプレイヤーは_対局数0で他はnull(self, client: TestClient):
        client.post("/api/players", json={"name": "新人"})

        stat = client.get("/api/stats").json()[0]

        assert stat["name"] == "新人"
        assert stat["games_count"] == 0
        assert stat["rank_counts"] == [0, 0, 0, 0]
        for key in ("total_score", "max_points", "avg_rank", "top_rate", "last_rate"):
            assert stat[key] is None

    def test_プレイヤーがいないと空の配列(self, client: TestClient):
        assert client.get("/api/stats").json() == []

    def test_対局を削除すると_成績に反映される(self, client: TestClient, scenario):
        client.delete(f"/api/games/{scenario['games'][3]}")  # 田中が1位だった対局

        stat = stats_of(client, "田中")

        assert stat["games_count"] == 4
        assert stat["max_points"] == 36000


class TestPlayerDetail:
    def test_存在しないプレイヤーは404(self, client: TestClient):
        response = client.get("/api/players/999999")

        assert response.status_code == 404
        assert response.json() == {"message": "プレイヤーが見つかりません", "errors": []}

    def test_成績は一覧と同じ値(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]

        detail = client.get(f"/api/players/{pid}").json()

        assert detail["player"] == {"id": pid, "name": "田中", "deleted": False}
        expected = stats_of(client, "田中")
        for key, value in detail["stats"].items():
            assert value == pytest.approx(expected[key])

    def test_履歴は_対局日の新しい順で_同じ日は登録が新しい順(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]

        history = client.get(f"/api/players/{pid}").json()["history"]

        g = scenario["games"]
        assert [h["game_id"] for h in history] == [g[4], g[3], g[2], g[1], g[0]]
        assert [h["played_on"] for h in history] == [
            "2026-11-22", "2026-11-22", "2026-11-20", "2026-11-15", "2026-11-10",
        ]  # fmt: skip

    def test_履歴に_自分の素点と順位とスコアが入る(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]

        history = client.get(f"/api/players/{pid}").json()["history"]

        # 供託が残った対局(2位。素点 29,000 → 最終スコア -1 + 10 = +9.0)
        assert (history[0]["points"], history[0]["rank"], history[0]["final_score"]) == (
            29000, 2.0, 9.0,
        )  # fmt: skip
        # 同点(1.5位。ウマを分け合って +26.0)
        assert (history[2]["points"], history[2]["rank"], history[2]["final_score"]) == (
            36000, 1.5, 26.0,
        )  # fmt: skip

    def test_同卓者は_自分以外の3人を順位順に返す(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]
        ids = scenario["players"]

        history = client.get(f"/api/players/{pid}").json()["history"]

        def mate(name: str, rank: float, points: int) -> dict:
            return {
                "player_id": ids[name], "name": name, "deleted": False,
                "rank": rank, "points": points,
            }  # fmt: skip

        assert history[0]["table_mates"] == [
            mate("佐藤", 1.0, 38000),
            mate("高橋", 3.0, 27000),
            mate("鈴木", 4.0, 25000),
        ]

    def test_同卓者が同点なら_プレイヤーIDの昇順(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]

        history = client.get(f"/api/players/{pid}").json()["history"]

        # 2〜4位が同点の対局(田中は3位)。同卓者は 鈴木(1位)・佐藤(3位)・高橋(3位)
        mates = history[3]["table_mates"]
        actual = [(m["name"], m["rank"]) for m in mates]
        assert actual == [("鈴木", 1.0), ("佐藤", 3.0), ("高橋", 3.0)]

    def test_同卓者に削除済みのプレイヤーがいると_deletedがtrue(self, client: TestClient, scenario):
        pid = scenario["players"]["田中"]

        history = client.get(f"/api/players/{pid}").json()["history"]

        mates = history[2]["table_mates"]  # 山田と同点だった対局
        assert [(m["name"], m["deleted"], m["rank"]) for m in mates] == [
            ("山田", True, 1.5), ("鈴木", False, 3.0), ("高橋", False, 4.0),
        ]  # fmt: skip

    def test_削除済みのプレイヤーの詳細も取得できる(self, client: TestClient, scenario):
        pid = scenario["players"]["山田"]

        detail = client.get(f"/api/players/{pid}").json()

        assert detail["player"] == {"id": pid, "name": "山田", "deleted": True}
        assert detail["stats"]["games_count"] == 1
        assert detail["stats"]["rank_counts"] == [0.5, 0.5, 0, 0]
        assert len(detail["history"]) == 1

    def test_対局が0件のプレイヤーは_履歴が空で成績はnull(self, client: TestClient):
        pid = client.post("/api/players", json={"name": "新人"}).json()["id"]

        detail = client.get(f"/api/players/{pid}").json()

        assert detail["history"] == []
        assert detail["stats"]["games_count"] == 0
        assert detail["stats"]["avg_rank"] is None
        assert detail["stats"]["rank_counts"] == [0, 0, 0, 0]

    def test_idが数字でないと422(self, client: TestClient):
        response = client.get("/api/players/abc")

        assert response.status_code == 422
