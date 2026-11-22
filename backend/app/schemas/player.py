from pydantic import BaseModel, ConfigDict


class PlayerIn(BaseModel):
    """プレイヤーの登録・名前変更のリクエスト。

    名前の中身のチェック(未入力・20文字まで・重複)は、メッセージを日本語で
    細かく出し分けるため、サービス層(services/players.py)で行う。
    name がなければ空として扱い、「名前を入力してください」を返す。
    """

    name: str = ""


class PlayerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
