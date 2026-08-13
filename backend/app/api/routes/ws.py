from uuid import UUID

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.models import User
from app.db.session import SessionLocal
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["websocket"])


def _user_from_token(token: str, db: Session) -> User | None:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id = payload.get("sub")
        if not user_id:
            return None
        return db.get(User, UUID(user_id))
    except (JWTError, ValueError):
        return None


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str | None = None):
    if not token:
        await websocket.close(code=4401)
        return

    # Authenticate with a short-lived session — never hold a pool connection
    # for the lifetime of the WebSocket (that exhausts QueuePool and breaks login).
    user_id: UUID | None = None
    db = SessionLocal()
    try:
        user = _user_from_token(token, db)
        if not user or not user.is_active:
            await websocket.close(code=4401)
            return
        user_id = user.id
    finally:
        db.close()

    if user_id is None:
        return

    try:
        await ws_manager.connect(user_id, websocket)
        await websocket.send_json({"type": "connected", "payload": {"user_id": str(user_id)}})

        while True:
            data = await websocket.receive_text()
            # Client keepalive / ping
            if data in ("ping", '{"type":"ping"}'):
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(user_id, websocket)
    except Exception:
        ws_manager.disconnect(user_id, websocket)
        raise
