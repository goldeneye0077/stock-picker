from fastapi import APIRouter, HTTPException
from ..utils.database import get_database
from loguru import logger

router = APIRouter()

@router.get("/")
async def get_buy_signals():
    """Get recent buy signals"""
    try:
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT bs.*, s.name as stock_name
                FROM buy_signals bs
                LEFT JOIN stocks s ON bs.stock_code = s.code
                ORDER BY bs.created_at DESC
                LIMIT 50
            """)
            signals = await cursor.fetchall()

            return {
                "success": True,
                "data": [dict(s) for s in signals]
            }
    except Exception as e:
        logger.error(f"Error fetching buy signals: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch buy signals")

@router.get("/{stock_code}")
async def get_stock_signals(stock_code: str):
    """Get buy signals for a specific stock"""
    try:
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT * FROM buy_signals
                WHERE stock_code = ?
                ORDER BY created_at DESC
                LIMIT 20
            """, (stock_code,))
            signals = await cursor.fetchall()

            return {
                "success": True,
                "data": [dict(s) for s in signals]
            }
    except Exception as e:
        logger.error(f"Error fetching stock signals: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stock signals")