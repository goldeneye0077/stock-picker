import base64
import hashlib
import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Header

from .database import get_database


SESSION_EXPIRE_DAYS = int(os.getenv("SESSION_EXPIRE_DAYS", "7"))
BACKEND_PBKDF2_ITERATIONS = 120_000
LEGACY_BASE64_PBKDF2_ITERATIONS = (200_000, 120_000, 100_000)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _to_iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def _from_iso(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _is_hex_string(value: str) -> bool:
    return bool(re.fullmatch(r"[0-9a-fA-F]+", value or "")) and len(value) % 2 == 0


def _hash_password_hex(password: str, salt_hex: str | None = None) -> tuple[str, str]:
    normalized_salt = salt_hex or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        normalized_salt.encode("utf-8"),
        BACKEND_PBKDF2_ITERATIONS,
    )
    return normalized_salt, derived.hex()


def _hash_password_base64(password: str, salt_b64: str, iterations: int) -> str:
    salt_bytes = base64.b64decode(salt_b64)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt_bytes, iterations)
    return base64.b64encode(derived).decode("utf-8")


def hash_password(password: str, salt_value: str | None = None) -> tuple[str, str]:
    """
    Default new hashes to backend-compatible hex format.
    If an existing non-hex salt is supplied, preserve the legacy base64 path.
    """
    if salt_value and not _is_hex_string(salt_value):
        return salt_value, _hash_password_base64(password, salt_value, LEGACY_BASE64_PBKDF2_ITERATIONS[0])
    return _hash_password_hex(password, salt_value)


def verify_password(password: str, salt_value: str, expected_hash: str) -> bool:
    if _is_hex_string(salt_value) and _is_hex_string(expected_hash):
        _, computed = _hash_password_hex(password, salt_value)
        return secrets.compare_digest(computed, expected_hash)

    for iterations in LEGACY_BASE64_PBKDF2_ITERATIONS:
        try:
            computed = _hash_password_base64(password, salt_value, iterations)
        except Exception:
            return False
        if secrets.compare_digest(computed, expected_hash):
            return True
    return False


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
        await db.execute("DELETE FROM user_sessions WHERE token = ?", (token_hash,))
        await db.commit()


async def get_user_permissions(user_id: int) -> list[str]:
    async with get_database() as db:
        cursor = await db.execute(
            "SELECT path FROM user_permissions WHERE user_id = ? ORDER BY path",
            (user_id,),
        )
        rows = await cursor.fetchall()
    return [row["path"] for row in rows]


async def _find_session_row(token_hash: str):
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
            WHERE s.token = ?
            LIMIT 1
            """,
            (token_hash,),
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
                WHERE s.token = ?
                LIMIT 1
                """,
                (token_hash,),
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

    row, session_table = await _find_session_row(token_hash)
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
        row, _ = await _find_session_row(token_hash)
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


