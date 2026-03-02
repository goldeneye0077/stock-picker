from __future__ import annotations

import json
import os
from datetime import datetime
from zoneinfo import ZoneInfo
from typing import Any

from loguru import logger

try:
    from redis import asyncio as redis_asyncio
except Exception:  # pragma: no cover - optional dependency
    redis_asyncio = None


_redis_client = None


def _is_enabled() -> bool:
    raw = (os.getenv("REDIS_PUBSUB_ENABLED") or "").strip().lower()
    if not raw:
        return bool(os.getenv("REDIS_URL"))
    return raw in {"1", "true", "yes", "y", "on"}


def _channel() -> str:
    return os.getenv("MARKET_EVENT_CHANNEL", "market:events")


async def get_redis_client():
    global _redis_client

    if not _is_enabled():
        return None
    if redis_asyncio is None:
        return None
    if _redis_client is not None:
        return _redis_client

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    _redis_client = redis_asyncio.from_url(redis_url, decode_responses=True)
    try:
        await _redis_client.ping()
    except Exception as exc:
        logger.warning(f"Redis ping failed: {exc}")
        _redis_client = None
    return _redis_client


async def publish_market_event(event_type: str, payload: dict[str, Any] | None = None) -> bool:
    client = await get_redis_client()
    if client is None:
        return False

    message = {
        "type": event_type,
        "payload": payload or {},
        "timestamp": datetime.now(ZoneInfo("Asia/Shanghai")).isoformat(),
    }

    try:
        await client.publish(_channel(), json.dumps(message, ensure_ascii=False))
        return True
    except Exception as exc:
        logger.warning(f"Publish market event failed ({event_type}): {exc}")
        return False


async def close_event_bus() -> None:
    global _redis_client
    if _redis_client is None:
        return
    try:
        await _redis_client.close()
    except Exception:
        pass
    finally:
        _redis_client = None
