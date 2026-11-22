import copy

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import GameResult

NAMES = ["田中", "佐藤", "鈴木", "高橋"]
NORMAL_POINTS = [42500, 31000, 28000, 18500]  # 合計 120,000点


@pytest.fixture
def ids(client: TestClient) -> list[int]:
    """田中・佐藤・鈴木・高橋 のプレイヤーIDを返す。"""
    return [client.post("/api/players", json={"name": n}).json()["id"] for n in NAMES]


def payload(ids: list[int], points: list[int], played_on: str = "2026-11-22", kyotaku: int = 0):
    return {
        "played_on": played_on,
        "kyotaku": kyotaku,
        "results": [{"player_id": i, "points": p} for i, p in zip(ids, points, strict=True)],
    }


def post_game(client: TestClient, ids: list[int], points=None, **kwargs) -> dict:
    response = client.post("/api/games", json=payload(ids, points or NORMAL_POINTS, **kwargs))
    assert response.status_code == 201, response.text
    return response.json()


def messages(response) -> list[str]:
    return [e["message"] for e in response.json()["errors"]]


class TestCreateGame:
    def test_登録すると201で_順位順の結果を返す(self, client: TestClient, ids: list[int]):
        response = client.post("/api/games", json=payload(ids, NORMAL_POINTS))

        assert response.status_code == 201
        body = response.json()
        assert body["played_on"] == "2026-11-22"
        assert body["kyotaku"] == 0
        assert body["results"] == [
            {
                "player_id": ids[0], "player_name": "田中", "player_deleted": False,
                "points": 42500, "rank_from": 1, "rank_to": 1, "rank": 1.0, "final_score": 42.5,
            },
            {
                "player_id": ids[1], "player_name": "佐藤", "player_deleted": False,
                "points": 31000, "rank_from": 2, "rank_to": 2, "rank": 2.0, "final_score": 11.0,
            },
            {
                "player_id": ids[2], "player_name": "鈴木", "player_deleted": False,
                "points": 28000, "rank_from": 3, "rank_to": 3, "rank": 3.0, "final_score": -12.0,
            },
            {
                "player_id": ids[3], "player_name": "高橋", "player_deleted": False,
                "points": 18500, "rank_from": 4, "rank_to": 4, "rank": 4.0, "final_score": -41.5,
            },
        ]  # fmt: skip

    def test_入力の順番に関係なく_順位順に並べて返す(self, client: TestClient, ids: list[int]):
        response = client.post("/api/games", json=payload(ids, [18500, 28000, 42500, 31000]))

        results = response.json()["results"]
        assert [r["player_name"] for r in results] == ["鈴木", "高橋", "佐藤", "田中"]

    def test_同点なら順位は小数で_ウマを分け合う(self, client: TestClient, ids: list[int]):
        response = client.post("/api/games", json=payload(ids, [36000, 36000, 28000, 20000]))

        results = response.json()["results"]
        assert [r["rank"] for r in results] == [1.5, 1.5, 3.0, 4.0]
        assert [(r["rank_from"], r["rank_to"]) for r in results] == [(1, 2), (1, 2), (3, 3), (4, 4)]
        assert [r["final_score"] for r in results] == [26.0, 26.0, -12.0, -40.0]
        # 同点の人は、プレイヤーIDの昇順
        assert [r["player_id"] for r in results[:2]] == [ids[0], ids[1]]

    def test_供託が残った対局を登録できる(self, client: TestClient, ids: list[int]):
        response = client.post(
            "/api/games", json=payload(ids, [38000, 29000, 27000, 25000], kyotaku=1000)
        )

        assert response.status_code == 201
        assert response.json()["kyotaku"] == 1000
        assert sum(r["final_score"] for r in response.json()["results"]) == -1.0

    def test_素点がマイナス_トビ_でも登録できる(self, client: TestClient, ids: list[int]):
        response = client.post("/api/games", json=payload(ids, [50000, 40000, 33000, -3000]))

        assert response.status_code == 201
        assert response.json()["results"][3]["final_score"] == -63.0

    def test_供託を省略すると0になる(self, client: TestClient, ids: list[int]):
        body = payload(ids, NORMAL_POINTS)
        del body["kyotaku"]

        response = client.post("/api/games", json=body)

        assert response.status_code == 201
        assert response.json()["kyotaku"] == 0

    def test_同じ日に何度でも登録できる(self, client: TestClient, ids: list[int]):
        first = post_game(client, ids)
        second = post_game(client, ids)

        assert first["id"] != second["id"]

    def test_DBには4人分の結果が保存される(self, client: TestClient, ids: list[int], db: Session):
        game = post_game(client, ids)

        count = db.scalar(
            select(func.count()).select_from(GameResult).where(GameResult.game_id == game["id"])
        )
        assert count == 4

    def test_削除済みのプレイヤーを含む対局は_playerdeletedがtrueで返る(
        self, client: TestClient, ids: list[int]
    ):
        game = post_game(client, ids)
        client.delete(f"/api/players/{ids[3]}")

        results = client.get(f"/api/games/{game['id']}").json()["results"]

        assert results[3]["player_name"] == "高橋"
        assert results[3]["player_deleted"] is True
        assert results[0]["player_deleted"] is False


def invalid_cases(ids: list[int]):
    """(名前, リクエスト, 期待するメッセージ)。登録でも編集でも同じチェックが働く。"""
    base = payload(ids, NORMAL_POINTS)

    def changed(**kwargs):
        body = copy.deepcopy(base)
        body.update(kwargs)
        return body

    def with_result(index: int, **kwargs):
        body = copy.deepcopy(base)
        body["results"][index].update(kwargs)
        return body

    return [
        ("対局日がない", changed(played_on=None), "対局日を入力してください"),
        ("対局日が空", changed(played_on=""), "対局日を入力してください"),
        ("対局日が日付として不正", changed(played_on="2026-13-45"), "対局日を入力してください"),
        (
            "3人しかいない",
            changed(results=base["results"][:3]),
            "4人のプレイヤーを選択してください",
        ),
        (
            "5人いる",
            changed(results=base["results"] + [{"player_id": ids[0], "points": 0}]),
            "4人のプレイヤーを選択してください",
        ),
        ("結果が空", changed(results=[]), "4人のプレイヤーを選択してください"),
        (
            "プレイヤーが未選択",
            with_result(2, player_id=None),
            "4人のプレイヤーを選択してください",
        ),
        (
            "同じプレイヤーが重複",
            with_result(1, player_id=ids[0]),
            "同じプレイヤーを重複して選べません",
        ),
        (
            "存在しないプレイヤー",
            with_result(1, player_id=999999),
            "選択したプレイヤーが見つかりません",
        ),
        ("素点がない", with_result(1, points=None), "4人分の素点を入力してください"),
        (
            "素点が100点単位でない",
            with_result(1, points=31050),
            "素点は100点単位で入力してください",
        ),
        ("供託が負の数", changed(kyotaku=-100), "供託は0以上の100点単位で入力してください"),
        ("供託が100点単位でない", changed(kyotaku=50), "供託は0以上の100点単位で入力してください"),
        (
            "合計が12万点に足りない",
            with_result(0, points=41500),
            "素点の合計と供託の合計が 120,000点になっていません(現在: 119,000点)",
        ),
        (
            "合計が12万点を超える",
            with_result(0, points=43500),
            "素点の合計と供託の合計が 120,000点になっていません(現在: 121,000点)",
        ),
        (
            "供託を足すと12万点を超える",
            changed(kyotaku=1000),
            "素点の合計と供託の合計が 120,000点になっていません(現在: 121,000点)",
        ),
    ]


class TestValidation:
    @pytest.mark.parametrize("index", range(16))
    def test_登録の入力チェック(self, client: TestClient, ids: list[int], index: int):
        name, body, message = invalid_cases(ids)[index]

        response = client.post("/api/games", json=body)

        assert response.status_code == 422, name
        assert response.json()["message"] == "入力内容に誤りがあります"
        assert message in messages(response), name
        # 誤りがあるときは、何も保存されない
        assert client.get("/api/games").json() == []

    @pytest.mark.parametrize("index", range(16))
    def test_編集でも同じ入力チェックが働く(self, client: TestClient, ids: list[int], index: int):
        game = post_game(client, ids)
        name, body, message = invalid_cases(ids)[index]

        response = client.put(f"/api/games/{game['id']}", json=body)

        assert response.status_code == 422, name
        assert message in messages(response), name
        # 誤りがあるときは、元の内容のまま
        assert client.get(f"/api/games/{game['id']}").json() == game

    def test_誤りが複数あるときは_全部まとめて返す(self, client: TestClient, ids: list[int]):
        body = payload(ids, [41500, 31050, 28000, 18500], played_on="")
        body["kyotaku"] = 50

        response = client.post("/api/games", json=body)

        assert response.status_code == 422
        assert messages(response) == [
            "対局日を入力してください",
            "素点は100点単位で入力してください",
            "供託は0以上の100点単位で入力してください",
        ]

    def test_エラーのfieldで_どの項目の誤りか分かる(self, client: TestClient, ids: list[int]):
        body = payload(ids, NORMAL_POINTS, played_on="")
        body["kyotaku"] = -100

        response = client.post("/api/games", json=body)

        assert {e["field"] for e in response.json()["errors"]} == {"played_on", "kyotaku"}

    def test_削除済みのプレイヤーは新しい対局に選べない(self, client: TestClient, ids: list[int]):
        client.delete(f"/api/players/{ids[3]}")

        response = client.post("/api/games", json=payload(ids, NORMAL_POINTS))

        assert response.status_code == 422
        assert messages(response) == ["削除されたプレイヤーは選べません"]

    def test_素点の型が違うと422(self, client: TestClient, ids: list[int]):
        body = payload(ids, NORMAL_POINTS)
        body["results"][0]["points"] = "あいう"

        response = client.post("/api/games", json=body)

        assert response.status_code == 422
        assert response.json()["message"] == "入力内容に誤りがあります"


class TestListGames:
    def test_対局がないと空の配列(self, client: TestClient):
        response = client.get("/api/games")

        assert response.status_code == 200
        assert response.json() == []

    def test_対局日の新しい順_同じ日は登録が新しい順(self, client: TestClient, ids: list[int]):
        old = post_game(client, ids, played_on="2026-11-10")
        new_first = post_game(client, ids, played_on="2026-11-22")
        new_second = post_game(client, ids, played_on="2026-11-22")

        response = client.get("/api/games")

        assert [g["id"] for g in response.json()] == [new_second["id"], new_first["id"], old["id"]]

    def test_各対局に4人分の結果が入っている(self, client: TestClient, ids: list[int]):
        post_game(client, ids)
        post_game(client, ids)

        games = client.get("/api/games").json()

        assert [len(g["results"]) for g in games] == [4, 4]


class TestGetGame:
    def test_1件取得できる(self, client: TestClient, ids: list[int]):
        game = post_game(client, ids)

        response = client.get(f"/api/games/{game['id']}")

        assert response.status_code == 200
        assert response.json() == game

    def test_存在しない対局は404(self, client: TestClient):
        response = client.get("/api/games/999999")

        assert response.status_code == 404
        assert response.json() == {"message": "対局が見つかりません", "errors": []}


class TestUpdateGame:
    def test_素点を変えると_順位とスコアが計算し直される(self, client: TestClient, ids: list[int]):
        game = post_game(client, ids)

        response = client.put(
            f"/api/games/{game['id']}", json=payload(ids, [18500, 28000, 31000, 42500])
        )

        assert response.status_code == 200
        results = response.json()["results"]
        assert [r["player_name"] for r in results] == ["高橋", "鈴木", "佐藤", "田中"]
        assert [r["final_score"] for r in results] == [42.5, 11.0, -12.0, -41.5]

    def test_対局日と供託も変更できる(self, client: TestClient, ids: list[int]):
        game = post_game(client, ids)

        response = client.put(
            f"/api/games/{game['id']}",
            json=payload(ids, [38000, 29000, 27000, 25000], played_on="2026-12-01", kyotaku=1000),
        )

        assert response.status_code == 200
        assert response.json()["played_on"] == "2026-12-01"
        assert response.json()["kyotaku"] == 1000
        assert client.get(f"/api/games/{game['id']}").json() == response.json()

    def test_参加者を入れ替えられる(self, client: TestClient, ids: list[int]):
        extra = client.post("/api/players", json={"name": "山田"}).json()["id"]
        game = post_game(client, ids)

        response = client.put(
            f"/api/games/{game['id']}", json=payload([ids[0], ids[1], ids[2], extra], NORMAL_POINTS)
        )

        assert response.status_code == 200
        names = {r["player_name"] for r in response.json()["results"]}
        assert names == {"田中", "佐藤", "鈴木", "山田"}

    def test_編集しても結果は4行のまま_古い行は残らない(
        self, client: TestClient, ids: list[int], db: Session
    ):
        game = post_game(client, ids)
        client.put(f"/api/games/{game['id']}", json=payload(ids, [30000] * 4))
        client.put(f"/api/games/{game['id']}", json=payload(ids, NORMAL_POINTS))

        count = db.scalar(
            select(func.count()).select_from(GameResult).where(GameResult.game_id == game["id"])
        )
        assert count == 4

    def test_もともと参加している削除済みのプレイヤーは_そのまま選べる(
        self, client: TestClient, ids: list[int]
    ):
        game = post_game(client, ids)
        client.delete(f"/api/players/{ids[3]}")

        response = client.put(
            f"/api/games/{game['id']}", json=payload(ids, [18500, 28000, 31000, 42500])
        )

        assert response.status_code == 200
        assert response.json()["results"][0]["player_deleted"] is True

    def test_参加していない削除済みのプレイヤーは_新しく加えられない(
        self, client: TestClient, ids: list[int]
    ):
        extra = client.post("/api/players", json={"name": "山田"}).json()["id"]
        game = post_game(client, ids)
        client.delete(f"/api/players/{extra}")

        response = client.put(
            f"/api/games/{game['id']}", json=payload([ids[0], ids[1], ids[2], extra], NORMAL_POINTS)
        )

        assert response.status_code == 422
        assert messages(response) == ["削除されたプレイヤーは選べません"]

    def test_存在しない対局は404(self, client: TestClient, ids: list[int]):
        response = client.put("/api/games/999999", json=payload(ids, NORMAL_POINTS))

        assert response.status_code == 404
        assert response.json()["message"] == "対局が見つかりません"

    def test_他の対局には影響しない(self, client: TestClient, ids: list[int]):
        target = post_game(client, ids)
        other = post_game(client, ids, played_on="2026-11-10")

        client.put(f"/api/games/{target['id']}", json=payload(ids, [18500, 28000, 31000, 42500]))

        assert client.get(f"/api/games/{other['id']}").json() == other


class TestDeleteGame:
    def test_削除すると204で_一覧から消える(self, client: TestClient, ids: list[int]):
        game = post_game(client, ids)

        response = client.delete(f"/api/games/{game['id']}")

        assert response.status_code == 204
        assert response.content == b""
        assert client.get("/api/games").json() == []
        assert client.get(f"/api/games/{game['id']}").status_code == 404

    def test_結果の行も一緒に削除される(self, client: TestClient, ids: list[int], db: Session):
        game = post_game(client, ids)

        client.delete(f"/api/games/{game['id']}")

        count = db.scalar(
            select(func.count()).select_from(GameResult).where(GameResult.game_id == game["id"])
        )
        assert count == 0

    def test_プレイヤーは削除されない(self, client: TestClient, ids: list[int]):
        game = post_game(client, ids)

        client.delete(f"/api/games/{game['id']}")

        assert len(client.get("/api/players").json()) == 4

    def test_他の対局は残る(self, client: TestClient, ids: list[int]):
        target = post_game(client, ids)
        other = post_game(client, ids, played_on="2026-11-10")

        client.delete(f"/api/games/{target['id']}")

        assert client.get("/api/games").json() == [other]

    def test_存在しない対局は404(self, client: TestClient):
        response = client.delete("/api/games/999999")

        assert response.status_code == 404
        assert response.json()["message"] == "対局が見つかりません"
