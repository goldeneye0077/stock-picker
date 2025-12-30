from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..utils.auth import (
    get_user_permissions,
    hash_password,
    require_admin,
)
from ..utils.database import get_database


router = APIRouter()


ALL_PAGES = [
    "/super-main-force",
    "/smart-selection",
    "/stocks",
    "/settings",
    "/user-management",
]


class CreateUserRequest(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=200)
    isAdmin: bool = False
    isActive: bool = True


class UpdateUserRequest(BaseModel):
    username: str | None = Field(default=None, min_length=2, max_length=50)
    isAdmin: bool | None = None
    isActive: bool | None = None


class UpdatePasswordRequest(BaseModel):
    password: str = Field(min_length=6, max_length=200)


class UpdatePermissionsRequest(BaseModel):
    paths: list[str]


async def _set_permissions(user_id: int, paths: list[str], *, is_admin: bool) -> None:
    normalized = [p for p in paths if p in ALL_PAGES]
    if not is_admin:
        normalized = [p for p in normalized if p != "/user-management"]
    async with get_database() as db:
        await db.execute("DELETE FROM user_permissions WHERE user_id = ?", (user_id,))
        for path in sorted(set(normalized)):
            await db.execute(
                "INSERT INTO user_permissions(user_id, path) VALUES (?, ?)",
                (user_id, path),
            )
        await db.commit()


@router.get("/pages")
async def pages(_: dict = Depends(require_admin)):
    return {"success": True, "data": {"pages": ALL_PAGES}}


@router.get("/users")
async def list_users(_: dict = Depends(require_admin)):
    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT id, username, is_admin, is_active, created_at
            FROM users
            ORDER BY id ASC
            """
        )
        rows = await cursor.fetchall()

    users = []
    for row in rows:
        permissions = await get_user_permissions(int(row["id"]))
        users.append(
            {
                "id": int(row["id"]),
                "username": row["username"],
                "isAdmin": bool(row["is_admin"]),
                "isActive": bool(row["is_active"]),
                "createdAt": row["created_at"],
                "permissions": permissions,
            }
        )
    return {"success": True, "data": {"users": users}}


@router.post("/users")
async def create_user(payload: CreateUserRequest, _: dict = Depends(require_admin)):
    async with get_database() as db:
        cursor = await db.execute("SELECT id FROM users WHERE username = ?", (payload.username,))
        exists = await cursor.fetchone()
        if exists:
            raise HTTPException(status_code=400, detail="Username already exists")

        salt, pw_hash = hash_password(payload.password)
        cursor = await db.execute(
            """
            INSERT INTO users(username, password_salt, password_hash, is_admin, is_active)
            VALUES (?, ?, ?, ?, ?)
            """,
            (payload.username, salt, pw_hash, int(payload.isAdmin), int(payload.isActive)),
        )
        await db.commit()
        user_id = int(cursor.lastrowid)

    await _set_permissions(user_id, ALL_PAGES if payload.isAdmin else [], is_admin=payload.isAdmin)
    permissions = await get_user_permissions(user_id)
    return {
        "success": True,
        "data": {
            "user": {
                "id": user_id,
                "username": payload.username,
                "isAdmin": payload.isAdmin,
                "isActive": payload.isActive,
                "permissions": permissions,
            }
        },
    }


@router.put("/users/{user_id}")
async def update_user(user_id: int, payload: UpdateUserRequest, _: dict = Depends(require_admin)):
    updates = []
    values: list[object] = []
    if payload.username is not None:
        updates.append("username = ?")
        values.append(payload.username)
    if payload.isAdmin is not None:
        updates.append("is_admin = ?")
        values.append(int(payload.isAdmin))
    if payload.isActive is not None:
        updates.append("is_active = ?")
        values.append(int(payload.isActive))

    if not updates:
        return {"success": True}

    async with get_database() as db:
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        exists = await cursor.fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="User not found")

        await db.execute(
            f"UPDATE users SET {', '.join(updates)}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (*values, user_id),
        )
        await db.commit()

    if payload.isAdmin is False:
        existing = await get_user_permissions(user_id)
        await _set_permissions(user_id, existing, is_admin=False)
    return {"success": True}


@router.put("/users/{user_id}/password")
async def update_password(user_id: int, payload: UpdatePasswordRequest, _: dict = Depends(require_admin)):
    salt, pw_hash = hash_password(payload.password)
    async with get_database() as db:
        cursor = await db.execute("SELECT id FROM users WHERE id = ?", (user_id,))
        exists = await cursor.fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="User not found")

        await db.execute(
            "UPDATE users SET password_salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
            (salt, pw_hash, user_id),
        )
        await db.commit()
    return {"success": True}


@router.put("/users/{user_id}/permissions")
async def update_permissions(user_id: int, payload: UpdatePermissionsRequest, _: dict = Depends(require_admin)):
    async with get_database() as db:
        cursor = await db.execute("SELECT id, is_admin FROM users WHERE id = ?", (user_id,))
        row = await cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")

    await _set_permissions(user_id, payload.paths, is_admin=bool(row["is_admin"]))
    permissions = await get_user_permissions(user_id)
    return {"success": True, "data": {"permissions": permissions}}
