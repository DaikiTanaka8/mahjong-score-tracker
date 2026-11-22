"""APIのエラーと、エラー応答の形式(docs/API設計.md 1.2)。

エラー応答は、次の形で返す。message は画面にそのまま表示できる日本語の文。

    { "message": "...", "errors": [ { "field": "name", "message": "..." } ] }
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

VALIDATION_MESSAGE = "入力内容に誤りがあります"


class AppError(Exception):
    """APIが返すエラーの親クラス。"""

    status_code = 500

    def __init__(self, message: str, errors: list[dict[str, str]] | None = None):
        super().__init__(message)
        self.message = message
        self.errors = errors or []


class NotFoundError(AppError):
    """存在しない、または削除済みのデータを指定された(404)。"""

    status_code = 404


class ConflictError(AppError):
    """他のデータと競合した。例: プレイヤー名の重複(409)。"""

    status_code = 409

    def __init__(self, message: str, field: str | None = None):
        errors = [{"field": field, "message": message}] if field else []
        super().__init__(message, errors)


class ValidationFailed(AppError):
    """入力チェックに失敗した(422)。"""

    status_code = 422

    def __init__(self, errors: list[dict[str, str]]):
        super().__init__(VALIDATION_MESSAGE, errors)

    @classmethod
    def single(cls, field: str, message: str) -> "ValidationFailed":
        return cls([{"field": field, "message": message}])


def _body(message: str, errors: list[dict[str, str]]) -> dict:
    return {"message": message, "errors": errors}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_body(exc.message, exc.errors))

    @app.exception_handler(RequestValidationError)
    async def handle_request_validation(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # 型が違う、JSONが壊れているなど、FastAPI が検出した入力の誤り
        errors = [
            {
                "field": ".".join(str(part) for part in e["loc"] if part != "body"),
                "message": e["msg"],
            }
            for e in exc.errors()
        ]
        return JSONResponse(status_code=422, content=_body(VALIDATION_MESSAGE, errors))
