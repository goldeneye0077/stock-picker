from fastapi import APIRouter, HTTPException
from ..utils.database import get_database
from loguru import logger

router = APIRouter()

@router.get("/overview")
async def get_analysis_overview():
    """Get analysis overview"""
    try:
        async with get_database() as db:
            # Get total stocks
            cursor = await db.execute("SELECT COUNT(*) as count FROM stocks")
            total_stocks = await cursor.fetchone()

            # Get today's signals
            cursor = await db.execute("""
                SELECT COUNT(*) as count FROM buy_signals
                WHERE date(created_at) = date('now')
            """)
            today_signals = await cursor.fetchone()

            return {
                "success": True,
                "data": {
                    "totalStocks": total_stocks[0] if total_stocks else 0,
                    "todaySignals": today_signals[0] if today_signals else 0,
                    "volumeSurges": 0,  # Placeholder
                    "fundFlowPositive": 0  # Placeholder
                }
            }
    except Exception as e:
        logger.error(f"Error fetching analysis overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis overview")

@router.get("/volume/{stock_code}")
async def get_volume_analysis(stock_code: str):
    """Get volume analysis for a stock"""
    try:
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT * FROM volume_analysis
                WHERE stock_code = ?
                ORDER BY date DESC
                LIMIT 30
            """, (stock_code,))
            analysis = await cursor.fetchall()

            return {
                "success": True,
                "data": [dict(a) for a in analysis]
            }
    except Exception as e:
        logger.error(f"Error fetching volume analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch volume analysis")