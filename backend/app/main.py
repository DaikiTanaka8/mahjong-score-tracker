from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.errors import register_error_handlers
from app.routers import games, health, players, stats

# /api 配下に全てのAPIを置く(本番ではNginxが /api/ をこのアプリに転送する)
app = FastAPI(
    title="麻雀成績管理 API",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(games.router, prefix="/api")
app.include_router(stats.router, prefix="/api")
