from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from ..utils.database import get_database
from ..utils.auth import get_current_user

router = APIRouter()

class FavoriteItem(BaseModel):
    stock_code: str
    stock_name: Optional[str] = None
    tags: Optional[str] = None
    notes: Optional[str] = None

class FavoriteResponse(BaseModel):
    id: int
    stock_code: str
    stock_name: Optional[str]
    tags: Optional[str]
    notes: Optional[str]
    created_at: str

@router.get("", response_model=List[FavoriteResponse])
async def get_favorites(user=Depends(get_current_user)):
    user_id = user["id"]
    async with get_database() as db:
        cursor = await db.execute(
            "SELECT id, stock_code, stock_name, tags, notes, created_at FROM user_favorites WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,)
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]

@router.post("", response_model=FavoriteResponse)
async def add_favorite(item: FavoriteItem, user=Depends(get_current_user)):
    user_id = user["id"]
    async with get_database() as db:
        # Check if already exists
        cursor = await db.execute(
            "SELECT id FROM user_favorites WHERE user_id = ? AND stock_code = ?",
            (user_id, item.stock_code)
        )
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Already in favorites")

        await db.execute(
            "INSERT INTO user_favorites (user_id, stock_code, stock_name, tags, notes) VALUES (?, ?, ?, ?, ?)",
            (user_id, item.stock_code, item.stock_name, item.tags, item.notes)
        )
        await db.commit()
        
        cursor = await db.execute(
            "SELECT id, stock_code, stock_name, tags, notes, created_at FROM user_favorites WHERE user_id = ? AND stock_code = ?",
            (user_id, item.stock_code)
        )
        row = await cursor.fetchone()
        return dict(row)

@router.delete("/{stock_code}")
async def remove_favorite(stock_code: str, user=Depends(get_current_user)):
    user_id = user["id"]
    async with get_database() as db:
        await db.execute(
            "DELETE FROM user_favorites WHERE user_id = ? AND stock_code = ?",
            (user_id, stock_code)
        )
        await db.commit()
    return {"success": True, "message": "Removed from favorites"}

@router.get("/check/{stock_code}")
async def check_favorite(stock_code: str, user=Depends(get_current_user)):
    user_id = user["id"]
    async with get_database() as db:
        cursor = await db.execute(
            "SELECT id FROM user_favorites WHERE user_id = ? AND stock_code = ?",
            (user_id, stock_code)
        )
        exists = await cursor.fetchone() is not None
        return {"is_favorite": exists}
