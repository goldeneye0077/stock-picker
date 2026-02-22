import base64
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Header

from .database import get_database


SESSION_EXPIRE_DAYS = int(os.getenv("SESSION_EXPIRE_DAYS", "7"))


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _from_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def hash_password(password: str, salt_b64: str | None = None) -> tuple[str, str]:
    salt = base64.b64decode(salt_b64) if salt_b64 else secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 200_000)
    return base64.b64encode(salt).decode("utf-8"), base64.b64encode(derived).decode("utf-8")


def verify_password(password: str, salt_b64: str, expected_hash_b64: str) -> bool:
    _, computed = hash_password(password, salt_b64=salt_b64)
    return secrets.compare_digest(computed, expected_hash_b64)


def generate_session_token() -> str:
    return secrets.token_urlsafe(32)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def create_session(user_id: int) -> tuple[str, str]:
    token = generate_session_token()
    token_hash = hash_session_token(token)
    expires_at = _now_utc() + timedelta(days=SESSION_EXPIRE_DAYS)
    async with get_database() as db:
        await db.execute(
            "INSERT INTO user_sessions(token, user_id, expires_at) VALUES (?, ?, ?)",
            (token_hash, user_id, _to_iso(expires_at)),
        )
        await db.commit()
    return token, _to_iso(expires_at)


async def delete_session(token: str) -> None:
    token_hash = hash_session_token(token)
    async with get_database() as db:
        await db.execute("DELETE FROM user_sessions WHERE token = ? OR token = ?", (token_hash, token))
        await db.commit()


async def get_user_permissions(user_id: int) -> list[str]:
    async with get_database() as db:
        cursor = await db.execute(
            "SELECT path FROM user_permissions WHERE user_id = ? ORDER BY path",
            (user_id,),
        )
        rows = await cursor.fetchall()
    return [row["path"] for row in rows]


async def _find_session_row(token_hash: str, token: str):
    """
    Resolve session from either data-service (`user_sessions`) or backend (`sessions`) tables.
    This allows unified login token usage across services.
    """
    async with get_database() as db:
        # Prefer data-service session table first for backward compatibility
        cursor = await db.execute(
            """
            SELECT s.token, s.user_id, s.expires_at, u.username, u.is_admin, u.is_active
            FROM user_sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = ? OR s.token = ?
            LIMIT 1
            """,
            (token_hash, token),
        )
        row = await cursor.fetchone()
        if row:
            return dict(row), "user_sessions"

        # Fallback to backend session table
        try:
            cursor = await db.execute(
                """
                SELECT s.token, s.user_id, s.expires_at, u.username, u.is_admin, u.is_active
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token = ? OR s.token = ?
                LIMIT 1
                """,
                (token_hash, token),
            )
            row = await cursor.fetchone()
            if row:
                return dict(row), "sessions"
        except Exception:
            # `sessions` table may not exist in standalone data-service deployments.
            pass

    return None, None


async def require_user(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=401, detail="Unauthorized")
    token_hash = hash_session_token(token)

    row, session_table = await _find_session_row(token_hash, token)
    if not row:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not row["is_active"]:
        raise HTTPException(status_code=403, detail="User is inactive")

    expires_at = _from_iso(row["expires_at"])
    if expires_at < _now_utc():
        if session_table not in {"user_sessions", "sessions"}:
            raise HTTPException(status_code=401, detail="Session expired")
        async with get_database() as db:
            await db.execute(f"DELETE FROM {session_table} WHERE token = ?", (row["token"],))
            await db.commit()
        raise HTTPException(status_code=401, detail="Session expired")

    permissions = await get_user_permissions(row["user_id"])
    return {
        "id": row["user_id"],
        "username": row["username"],
        "isAdmin": bool(row["is_admin"]),
        "isActive": bool(row["is_active"]),
        "token": token,
        "permissions": permissions,
    }


async def require_admin(user: dict = Depends(require_user)) -> dict:
    if not user.get("isAdmin"):
        raise HTTPException(status_code=403, detail="Admin required")
    return user


async def get_optional_user(authorization: str | None = Header(None)) -> dict | None:
    """
    尝试获取当前用户，但不强制要求登录
    返回 None 表示未登录或 token 无效
    """
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.removeprefix("Bearer ").strip()
    if not token:
        return None
    token_hash = hash_session_token(token)

    try:
        row, _ = await _find_session_row(token_hash, token)
        if not row or not row["is_active"]:
            return None

        expires_at = _from_iso(row["expires_at"])
        if expires_at < _now_utc():
            return None

        permissions = await get_user_permissions(row["user_id"])
        return {
            "id": row["user_id"],
            "username": row["username"],
            "isAdmin": bool(row["is_admin"]),
            "isActive": bool(row["is_active"]),
            "token": token,
            "permissions": permissions,
        }
    except Exception:
        return None


# Aliases for routes that use different naming conventions
get_current_user = require_user
get_admin_user = require_admin


