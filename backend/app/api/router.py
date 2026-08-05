from fastapi import APIRouter

from app.api.routes import admin, auth, categories, chat, conversations, geo, orders, providers, requests, uploads, ws

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(categories.router)
api_router.include_router(geo.router)
api_router.include_router(providers.router)
api_router.include_router(requests.router)
api_router.include_router(orders.router)
api_router.include_router(chat.router)
api_router.include_router(uploads.router)
api_router.include_router(conversations.router)
api_router.include_router(admin.router)
