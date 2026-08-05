import json
from collections import defaultdict
from typing import Any
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    """Tracks active WebSocket connections per user and fans out events."""

    def __init__(self) -> None:
        self.active: dict[UUID, list[WebSocket]] = defaultdict(list)

    async def connect(self, user_id: UUID, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active[user_id].append(websocket)

    def disconnect(self, user_id: UUID, websocket: WebSocket) -> None:
        if user_id in self.active:
            self.active[user_id] = [ws for ws in self.active[user_id] if ws is not websocket]
            if not self.active[user_id]:
                del self.active[user_id]

    async def send_to_user(self, user_id: UUID, payload: dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for ws in self.active.get(user_id, []):
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(user_id, ws)

    async def broadcast_to_users(self, user_ids: list[UUID], payload: dict[str, Any]) -> None:
        for uid in user_ids:
            await self.send_to_user(uid, payload)


ws_manager = ConnectionManager()
