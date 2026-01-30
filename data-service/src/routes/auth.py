from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..utils.auth import (
    create_session,
    delete_session,
    hash_password,
    require_user,
    verify_password,
    get_user_permissions,
)
from ..utils.database import get_database


router = APIRouter()


ALL_PAGES = [
    "/super-main-force",
    "/smart-selection",
    "/stocks",
    "/settings",
    "/user-management",
    "/site-analytics",
]

DEFAULT_PAGES = [
    "/super-main-force",
    "/smart-selection",
    "/stocks",
]


class RegisterRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=200)


class LoginRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=200)


async def _user_count() -> int:
    async with get_database() as db:
        cursor = await db.execute("SELECT COUNT(1) AS c FROM users")
        row = await cursor.fetchone()
    return int(row["c"] if row else 0)


async def _get_user_by_username(username: str) -> dict | None:
    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT id, username, password_salt, password_hash, is_admin, is_active
            FROM users
            WHERE username = ?
            """,
            (username,),
        )
        row = await cursor.fetchone()
    return dict(row) if row else None


async def _set_permissions(user_id: int, paths: list[str]) -> None:
    async with get_database() as db:
        await db.execute("DELETE FROM user_permissions WHERE user_id = ?", (user_id,))
        for path in sorted(set(paths)):
            await db.execute(
                "INSERT INTO user_permissions(user_id, path) VALUES (?, ?)",
                (user_id, path),
            )
        await db.commit()


@router.get("/pages")
async def get_pages():
    return {"success": True, "data": {"pages": ALL_PAGES}}


@router.post("/register")
async def register(payload: RegisterRequest):
    existing = await _get_user_by_username(payload.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")

    salt, pw_hash = hash_password(payload.password)
    is_first_user = (await _user_count()) == 0
    is_admin = bool(is_first_user)

    async with get_database() as db:
        cursor = await db.execute(
            """
            INSERT INTO users(username, password_salt, password_hash, is_admin, is_active)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.username, salt, pw_hash, int(is_admin), 1),
        )
        await db.commit()
        user_id = cursor.lastrowid

    await _set_permissions(user_id, ALL_PAGES if is_admin else DEFAULT_PAGES)
    token, expires_at = await create_session(user_id)
    permissions = await get_user_permissions(user_id)

    return {
        "success": True,
        "data": {
            "token": token,
            "expiresAt": expires_at,
            "user": {
                "id": user_id,
                "username": payload.username,
                "isAdmin": is_admin,
                "isActive": True,
                "permissions": permissions,
            },
        },
    }


@router.post("/login")
async def login(payload: LoginRequest):
    user = await _get_user_by_username(payload.username)
    if not user:
        raise HTTPException(status_code=400, detail="Invalid username or password")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="User is inactive")
    if not verify_password(payload.password, user["password_salt"], user["password_hash"]):
        raise HTTPException(status_code=400, detail="Invalid username or password")

    token, expires_at = await create_session(int(user["id"]))
    permissions = await get_user_permissions(int(user["id"]))

    return {
        "success": True,
        "data": {
            "token": token,
            "expiresAt": expires_at,
            "user": {
                "id": int(user["id"]),
                "username": user["username"],
                "isAdmin": bool(user["is_admin"]),
                "isActive": True,
                "permissions": permissions,
            },
        },
    }


@router.post("/logout")
async def logout(current_user: dict = Depends(require_user)):
    await delete_session(current_user["token"])
    return {"success": True}


@router.get("/me")
async def me(current_user: dict = Depends(require_user)):
    return {
        "success": True,
        "data": {
            "user": {
                "id": current_user["id"],
                "username": current_user["username"],
                "isAdmin": current_user["isAdmin"],
                "isActive": current_user["isActive"],
                "permissions": current_user["permissions"],
            }
        },
    }

