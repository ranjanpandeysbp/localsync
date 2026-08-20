import json
import time
from typing import Any
from uuid import UUID

import redis

from app.core.config import settings

CHANNEL_EVENTS = "localsync:events"


class InMemoryRedis:
    """Mock/Fallback Redis client for environments without a running Redis server."""

    def __init__(self) -> None:
        # Maps key -> (value, expiry_timestamp)
        self.store: dict[str, tuple[Any, float | None]] = {}

    def _is_expired(self, key: str) -> bool:
        if key not in self.store:
            return True
        _, expiry = self.store[key]
        if expiry is not None and time.time() > expiry:
            del self.store[key]
            return True
        return False

    def get(self, key: str) -> str | None:
        if self._is_expired(key):
            return None
        val, _ = self.store[key]
        return str(val)

    def setex(self, key: str, time_seconds: int, value: Any) -> bool:
        expiry = time.time() + time_seconds
        self.store[key] = (value, expiry)
        return True

    def ttl(self, key: str) -> int:
        if self._is_expired(key):
            return -2
        _, expiry = self.store[key]
        if expiry is None:
            return -1
        remaining = int(expiry - time.time())
        return max(0, remaining)

    def incr(self, key: str) -> int:
        if self._is_expired(key):
            self.store[key] = (1, None)
            return 1
        val, expiry = self.store[key]
        try:
            new_val = int(val) + 1
        except (ValueError, TypeError):
            new_val = 1
        self.store[key] = (new_val, expiry)
        return new_val

    def expire(self, key: str, time_seconds: int) -> bool:
        if self._is_expired(key):
            return False
        val, _ = self.store[key]
        self.store[key] = (val, time.time() + time_seconds)
        return True

    def delete(self, *keys: str) -> int:
        count = 0
        for key in keys:
            if key in self.store:
                del self.store[key]
                count += 1
        return count

    def ping(self) -> bool:
        return True

    def publish(self, channel: str, message: str) -> int:
        return 0


class RedisPubSub:
    def __init__(self) -> None:
        self._client: Any = None

    @property
    def client(self) -> Any:
        if self._client is None:
            if settings.is_nodocker:
                self._client = InMemoryRedis()
            else:
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
        except (redis.RedisError, AttributeError):
            # Redis is optional for single-process MVP; WS manager still works in-process.
            pass

    def ping(self) -> bool:
        try:
            return bool(self.client.ping())
        except (redis.RedisError, AttributeError):
            return False


redis_pubsub = RedisPubSub()

