import json
from typing import Any
from uuid import UUID

import redis

from app.core.config import settings

CHANNEL_EVENTS = "localsync:events"


class RedisPubSub:
    def __init__(self) -> None:
        self._client: redis.Redis | None = None

    @property
    def client(self) -> redis.Redis:
        if self._client is None:
            self._client = redis.from_url(settings.redis_url, decode_responses=True)
        return self._client

    def publish(self, event_type: str, payload: dict[str, Any], target_user_ids: list[UUID] | None = None) -> None:
        message = {
            "type": event_type,
            "payload": payload,
            "target_user_ids": [str(uid) for uid in (target_user_ids or [])],
        }
        try:
            self.client.publish(CHANNEL_EVENTS, json.dumps(message, default=str))
        except redis.RedisError:
            # Redis is optional for single-process MVP; WS manager still works in-process.
            pass

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except redis.RedisError:
            return False


redis_pubsub = RedisPubSub()
