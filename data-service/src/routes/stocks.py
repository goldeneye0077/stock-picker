from fastapi import APIRouter, HTTPException, Query
from ..utils.database import get_database
from ..utils.technical_db import TechnicalDB
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


@router.get("/history/date/{date}")
async def get_stocks_by_date(date: str):
    """Get stock list for a specific trading date"""
    try:
        if len(date) != 10 or date[4] != "-" or date[7] != "-":
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT
                    s.code,
                    s.name,
                    k.open,
                    k.high,
                    k.low,
                    k.close AS current_price,
                    k.volume,
                    k.amount,
                    k.date AS quote_date,
                    ((k.close - k.open) / k.open * 100.0) AS change_percent,
                    (k.close - k.open) AS change_amount
                FROM stocks s
                JOIN klines k
                    ON s.code = k.stock_code
                   AND k.date = ?
                ORDER BY s.code
                """,
                (date,),
            )
            rows = await cursor.fetchall()

            data = [dict(row) for row in rows]
            return {
                "success": True,
                "data": data,
                "total": len(data),
                "date": date,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching stocks by date {date}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stocks by date")


@router.get("/{code}/history")
async def get_stock_history(
    code: str,
    start_date: str | None = Query(None, alias="start_date"),
    end_date: str | None = Query(None, alias="end_date"),
    period: str = Query("daily"),
):
    """Get K-line history data for a stock"""
    try:
        async with get_database() as db:
            if start_date and end_date:
                cursor = await db.execute(
                    """
                    SELECT date, open, high, low, close, volume, amount
                    FROM klines
                    WHERE stock_code = ?
                      AND date >= ?
                      AND date <= ?
                    ORDER BY date DESC
                    """,
                    (code, start_date, end_date),
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT date, open, high, low, close, volume, amount
                    FROM klines
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT 100
                    """,
                    (code,),
                )

            rows = await cursor.fetchall()
            columns = [col[0] for col in cursor.description]
            klines = [dict(zip(columns, row)) for row in rows]

            return {
                "success": True,
                "data": {
                    "klines": klines,
                    "period": period,
                    "total": len(klines),
                },
            }
    except Exception as e:
        logger.error(f"Error fetching stock history for {code}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stock history")


@router.get("/{code}/analysis")
async def get_stock_analysis(code: str):
    """Get technical analysis indicators for a stock"""
    try:
        indicators_list = await TechnicalDB.get_technical_indicators(code, limit=1)
        latest = indicators_list[0] if indicators_list else {}

        indicators = {
            "ma5": latest.get("ma5"),
            "ma10": latest.get("ma10"),
            "ma20": latest.get("ma20"),
            "ma60": latest.get("ma60"),
            "macd": latest.get("macd"),
            "macd_signal": latest.get("macd_signal"),
            "macd_hist": latest.get("macd_hist"),
            "rsi": latest.get("rsi12") or latest.get("rsi6") or latest.get("rsi24"),
            "kdj_k": latest.get("kdj_k"),
            "kdj_d": latest.get("kdj_d"),
            "kdj_j": latest.get("kdj_j"),
            "turnover_rate": None,
            "turnover_rate_f": None,
            "volume_ratio": latest.get("volume_ratio"),
        }

        return {
            "success": True,
            "data": {
                "indicators": indicators
            }
        }
    except Exception as e:
        logger.error(f"Error fetching stock analysis for {code}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stock analysis")


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
