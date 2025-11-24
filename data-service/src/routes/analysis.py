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

@router.get("/market/sentiment")
async def get_market_sentiment():
    """Get market sentiment analysis"""
    try:
        async with get_database() as db:
            # Calculate up/down counts and average change from realtime quotes
            cursor = await db.execute("""
                SELECT 
                    COUNT(CASE WHEN change_percent > 0 THEN 1 END) as up_count,
                    COUNT(CASE WHEN change_percent < 0 THEN 1 END) as down_count,
                    COUNT(CASE WHEN change_percent = 0 THEN 1 END) as flat_count,
                    AVG(change_percent) as avg_change,
                    SUM(amount) as total_amount
                FROM realtime_quotes
            """)
            sentiment = await cursor.fetchone()
            
            logger.info(f"Realtime sentiment result: {sentiment}")
            
            # Fallback if total_amount is None (meaning empty table or no volume)
            is_fallback = False
            latest_date_str = "N/A"
            
            if not sentiment or sentiment[4] is None:
                is_fallback = True
                # Fallback to klines if realtime data is empty (e.g. market closed or no data yet)
                # Get latest date from klines
                cursor = await db.execute("SELECT MAX(date) FROM klines")
                latest_date = await cursor.fetchone()
                if latest_date and latest_date[0]:
                    latest_date_str = latest_date[0]
                    cursor = await db.execute("""
                        SELECT 
                            COUNT(CASE WHEN (close - open) > 0 THEN 1 END) as up_count,
                            COUNT(CASE WHEN (close - open) < 0 THEN 1 END) as down_count,
                            COUNT(CASE WHEN (close - open) = 0 THEN 1 END) as flat_count,
                            AVG((close - open) / open * 100) as avg_change,
                            SUM(amount) as total_amount
                        FROM klines
                        WHERE date = ?
                    """, (latest_date[0],))
                    sentiment = await cursor.fetchone()

            return {
                "success": True,
                "data": {
                    "upCount": sentiment[0] if sentiment else 0,
                    "downCount": sentiment[1] if sentiment else 0,
                    "flatCount": sentiment[2] if sentiment else 0,
                    "avgChange": sentiment[3] if sentiment else 0,
                    "totalAmount": sentiment[4] if sentiment else 0,
                    "debug_fallback": is_fallback,
                    "debug_latest_date": latest_date_str
                }
            }
    except Exception as e:
        logger.error(f"Error fetching market sentiment: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market sentiment")

@router.get("/market/sectors")
async def get_sector_analysis():
    """Get sector analysis (performance and fund flow)"""
    try:
        async with get_database() as db:
            # Determine if realtime data is fresh (from today)
            cursor = await db.execute("SELECT MAX(updated_at) FROM realtime_quotes")
            max_updated_at = await cursor.fetchone()
            
            is_realtime_fresh = False
            data_date = "Unknown"

            if max_updated_at and max_updated_at[0]:
                # Check if updated_at is today (naive check, assumes server time matches data time)
                # In production, might need timezone handling. 
                # SQLite 'now' is UTC. If data is Beijing Time, this comparison might need adjustment.
                # For simplicity, we check if the date part matches.
                cursor = await db.execute("SELECT date(MAX(updated_at)) == date('now') FROM realtime_quotes")
                is_fresh_result = await cursor.fetchone()
                if is_fresh_result and is_fresh_result[0]:
                    is_realtime_fresh = True
                    data_date = "Realtime"
                else:
                    # Use the date from the stale realtime data
                    data_date = max_updated_at[0].split(' ')[0] # Extract YYYY-MM-DD
            
            # 1. Sector Performance
            sectors_perf = []
            
            # Try realtime if fresh
            if is_realtime_fresh:
                cursor = await db.execute("""
                    SELECT 
                        s.industry,
                        AVG(r.change_percent) as avg_change,
                        SUM(r.amount) as total_amount,
                        MAX(r.change_percent) as max_change
                    FROM stocks s
                    JOIN realtime_quotes r ON s.code = r.stock_code
                    WHERE s.industry IS NOT NULL
                    GROUP BY s.industry
                    ORDER BY avg_change DESC
                """)
                sectors_perf = await cursor.fetchall()
            
            # If not fresh (or empty), fallback to Klines
            if not sectors_perf:
                cursor = await db.execute("SELECT MAX(date) FROM klines")
                latest_kline_date = await cursor.fetchone()
                if latest_kline_date and latest_kline_date[0]:
                    # Use kline date if it's newer or equal to stale realtime date
                    # Or just prefer Klines if Realtime is stale
                    data_date = latest_kline_date[0]
                    cursor = await db.execute("""
                        SELECT 
                            s.industry,
                            AVG((k.close - k.open) / k.open * 100) as avg_change,
                            SUM(k.amount) as total_amount,
                            MAX((k.close - k.open) / k.open * 100) as max_change
                        FROM stocks s
                        JOIN klines k ON s.code = k.stock_code
                        WHERE s.industry IS NOT NULL AND k.date = ?
                        GROUP BY s.industry
                        ORDER BY avg_change DESC
                    """, (latest_kline_date[0],))
                    sectors_perf = await cursor.fetchall()
                else:
                    # No kline data either
                    data_date = "No Data"

            # 2. Get Top Stock (Dragon) for each sector
            all_quotes = []
            if is_realtime_fresh and sectors_perf:
                cursor = await db.execute("""
                    SELECT s.industry, s.code, s.name, r.change_percent
                    FROM stocks s
                    JOIN realtime_quotes r ON s.code = r.stock_code
                    WHERE s.industry IS NOT NULL
                """)
                all_quotes = await cursor.fetchall()
            
            if not all_quotes and data_date != "Realtime" and data_date != "No Data":
                 cursor = await db.execute("""
                    SELECT s.industry, s.code, s.name, (k.close - k.open) / k.open * 100 as change_percent
                    FROM stocks s
                    JOIN klines k ON s.code = k.stock_code
                    WHERE s.industry IS NOT NULL AND k.date = ?
                """, (data_date,))
                 all_quotes = await cursor.fetchall()

            # Process leaders in Python
            sector_leaders = {}
            for industry, code, name, change in all_quotes:
                if industry not in sector_leaders:
                    sector_leaders[industry] = {"code": code, "name": name, "change": change}
                else:
                    if change > sector_leaders[industry]["change"]:
                        sector_leaders[industry] = {"code": code, "name": name, "change": change}

            # 3. Fund Flow (Latest available)
            cursor = await db.execute("""
                SELECT 
                    s.industry,
                    SUM(f.main_fund_flow) as net_main_flow
                FROM stocks s
                JOIN fund_flow f ON s.code = f.stock_code
                WHERE f.date = (SELECT MAX(date) FROM fund_flow)
                GROUP BY s.industry
            """)
            fund_flows = await cursor.fetchall()
            fund_flow_map = {row[0]: row[1] for row in fund_flows}

            # Combine results
            results = []
            for row in sectors_perf:
                industry = row[0]
                leader = sector_leaders.get(industry, {"name": "N/A", "code": "", "change": 0})
                
                results.append({
                    "industry": industry,
                    "avgChange": row[1],
                    "totalAmount": row[2],
                    "netMainFlow": fund_flow_map.get(industry, 0),
                    "leaderName": leader["name"],
                    "leaderCode": leader["code"],
                    "leaderChange": leader["change"]
                })

            # Sort by avgChange descending
            results.sort(key=lambda x: x["avgChange"], reverse=True)

            return {
                "success": True,
                "data_date": data_date,
                "data": results
            }
    except Exception as e:
        logger.error(f"Error fetching sector analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sector analysis")