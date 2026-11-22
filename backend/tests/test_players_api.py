import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Player


def create(client: TestClient, name: str) -> dict:
    response = client.post("/api/players", json={"name": name})
    assert response.status_code == 201
    return response.json()


def error_messages(response) -> list[str]:
    return [e["message"] for e in response.json()["errors"]]


class TestListPlayers:
    def test_プレイヤーがいないと_空の配列を返す(self, client: TestClient):
        response = client.get("/api/players")

        assert response.status_code == 200
        assert response.json() == []

    def test_登録が古い順に返す(self, client: TestClient):
        create(client, "田中")
        create(client, "佐藤")
        create(client, "鈴木")

        response = client.get("/api/players")

        assert [p["name"] for p in response.json()] == ["田中", "佐藤", "鈴木"]

    def test_削除済みのプレイヤーは含まれない(self, client: TestClient):
        create(client, "田中")
        sato = create(client, "佐藤")
        client.delete(f"/api/players/{sato['id']}")

        response = client.get("/api/players")

        assert [p["name"] for p in response.json()] == ["田中"]


class TestCreatePlayer:
    def test_登録すると201でidと名前を返す(self, client: TestClient):
        response = client.post("/api/players", json={"name": "田中"})

        assert response.status_code == 201
        body = response.json()
        assert body["name"] == "田中"
        assert isinstance(body["id"], int)

    def test_前後の空白は取り除いて保存する(self, client: TestClient):
        response = client.post("/api/players", json={"name": "　 田中 　"})

        assert response.status_code == 201
        assert response.json()["name"] == "田中"

    def test_20文字ちょうどは登録できる(self, client: TestClient):
        response = client.post("/api/players", json={"name": "あ" * 20})

        assert response.status_code == 201

    @pytest.mark.parametrize("name", ["", "   ", "　　"])
    def test_名前が未入力だと422(self, client: TestClient, name: str):
        response = client.post("/api/players", json={"name": name})

        assert response.status_code == 422
        assert response.json()["message"] == "入力内容に誤りがあります"
        assert error_messages(response) == ["名前を入力してください"]
        assert response.json()["errors"][0]["field"] == "name"

    def test_nameの項目がなくても_未入力として422(self, client: TestClient):
        response = client.post("/api/players", json={})

        assert response.status_code == 422
        assert error_messages(response) == ["名前を入力してください"]

    def test_21文字以上だと422(self, client: TestClient):
        response = client.post("/api/players", json={"name": "あ" * 21})

        assert response.status_code == 422
        assert error_messages(response) == ["名前は20文字以内で入力してください"]

    def test_削除されていないプレイヤーと同じ名前だと409(self, client: TestClient):
        create(client, "田中")

        response = client.post("/api/players", json={"name": "田中"})

        assert response.status_code == 409
        assert response.json()["message"] == "その名前はすでに登録されています"
        assert error_messages(response) == ["その名前はすでに登録されています"]

    def test_空白を取り除いた結果が同じ名前でも409(self, client: TestClient):
        create(client, "田中")

        response = client.post("/api/players", json={"name": " 田中 "})

        assert response.status_code == 409

    def test_削除済みのプレイヤーと同じ名前は登録できる(self, client: TestClient):
        tanaka = create(client, "田中")
        client.delete(f"/api/players/{tanaka['id']}")

        response = client.post("/api/players", json={"name": "田中"})

        assert response.status_code == 201
        assert response.json()["id"] != tanaka["id"]

    def test_JSONの形式が違うと422(self, client: TestClient):
        response = client.post("/api/players", json={"name": 123})

        assert response.status_code == 422
        assert response.json()["message"] == "入力内容に誤りがあります"
        assert response.json()["errors"][0]["field"] == "name"


class TestRenamePlayer:
    def test_名前を変更できる(self, client: TestClient):
        player = create(client, "田中")

        response = client.put(f"/api/players/{player['id']}", json={"name": "田中太郎"})

        assert response.status_code == 200
        assert response.json() == {"id": player["id"], "name": "田中太郎"}
        names = [p["name"] for p in client.get("/api/players").json()]
        assert names == ["田中太郎"]

    def test_自分自身と同じ名前への変更はエラーにならない(self, client: TestClient):
        player = create(client, "田中")

        response = client.put(f"/api/players/{player['id']}", json={"name": "田中"})

        assert response.status_code == 200

    def test_他のプレイヤーと同じ名前だと409(self, client: TestClient):
        create(client, "田中")
        sato = create(client, "佐藤")

        response = client.put(f"/api/players/{sato['id']}", json={"name": "田中"})

        assert response.status_code == 409
        assert error_messages(response) == ["その名前はすでに登録されています"]

    def test_未入力だと422(self, client: TestClient):
        player = create(client, "田中")

        response = client.put(f"/api/players/{player['id']}", json={"name": " "})

        assert response.status_code == 422
        assert error_messages(response) == ["名前を入力してください"]

    def test_21文字以上だと422(self, client: TestClient):
        player = create(client, "田中")

        response = client.put(f"/api/players/{player['id']}", json={"name": "あ" * 21})

        assert response.status_code == 422
        assert error_messages(response) == ["名前は20文字以内で入力してください"]

    def test_存在しないプレイヤーは404(self, client: TestClient):
        response = client.put("/api/players/999999", json={"name": "田中"})

        assert response.status_code == 404
        assert response.json() == {"message": "プレイヤーが見つかりません", "errors": []}

    def test_削除済みのプレイヤーは404(self, client: TestClient):
        player = create(client, "田中")
        client.delete(f"/api/players/{player['id']}")

        response = client.put(f"/api/players/{player['id']}", json={"name": "田中太郎"})

        assert response.status_code == 404


class TestDeletePlayer:
    def test_削除すると204で_一覧から消える(self, client: TestClient):
        player = create(client, "田中")

        response = client.delete(f"/api/players/{player['id']}")

        assert response.status_code == 204
        assert response.content == b""
        assert client.get("/api/players").json() == []

    def test_論理削除なので_行はDBに残り_deleted_atが入る(self, client: TestClient, db: Session):
        player = create(client, "田中")

        client.delete(f"/api/players/{player['id']}")

        row = db.scalars(select(Player).where(Player.id == player["id"])).one()
        db.refresh(row)
        assert row.deleted_at is not None
        assert row.name == "田中"

    def test_存在しないプレイヤーは404(self, client: TestClient):
        response = client.delete("/api/players/999999")

        assert response.status_code == 404
        assert response.json()["message"] == "プレイヤーが見つかりません"

    def test_すでに削除済みのプレイヤーは404(self, client: TestClient):
        player = create(client, "田中")
        client.delete(f"/api/players/{player['id']}")

        response = client.delete(f"/api/players/{player['id']}")

        assert response.status_code == 404

    def test_idが数字でないと422(self, client: TestClient):
        response = client.delete("/api/players/abc")

        assert response.status_code == 422
        assert response.json()["message"] == "入力内容に誤りがあります"
