from fastapi import APIRouter, HTTPException
from ..utils.database import get_database
from loguru import logger

router = APIRouter()

@router.get("/")
async def get_stocks():
    """Get all stocks"""
    try:
        async with get_database() as db:
            cursor = await db.execute("SELECT * FROM stocks LIMIT 100")
            stocks = await cursor.fetchall()
            return {
                "success": True,
                "data": [dict(stock) for stock in stocks],
                "total": len(stocks)
            }
    except Exception as e:
        logger.error(f"Error fetching stocks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stocks")

@router.get("/{code}")
async def get_stock_detail(code: str):
    """Get stock detail by code"""
    try:
        async with get_database() as db:
            # Get stock info
            cursor = await db.execute("SELECT * FROM stocks WHERE code = ?", (code,))
            stock = await cursor.fetchone()

            if not stock:
                raise HTTPException(status_code=404, detail="Stock not found")

            # Get recent K-line data
            cursor = await db.execute("""
                SELECT * FROM klines
                WHERE stock_code = ?
                ORDER BY date DESC
                LIMIT 30
            """, (code,))
            klines = await cursor.fetchall()

            return {
                "success": True,
                "data": {
                    "stock": dict(stock),
                    "klines": [dict(k) for k in klines]
                }
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stock detail: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stock detail")