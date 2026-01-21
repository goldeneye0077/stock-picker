from fastapi import APIRouter, HTTPException, Query
from ..utils.database import get_database
from ..data_sources.tushare_client import TushareClient
from loguru import logger
from datetime import datetime, timedelta, date
import math
import pandas as pd

router = APIRouter()

def _parse_trade_date_param(value: str | None) -> date | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    try:
        if len(s) >= 10 and "-" in s:
            return datetime.strptime(s[:10], "%Y-%m-%d").date()
        if len(s) == 8 and s.isdigit():
            return datetime.strptime(s, "%Y%m%d").date()
    except Exception:
        return None
    return None

def _fallback_previous_weekday(base: date) -> date:
    d = base - timedelta(days=1)
    for _ in range(60):
        if d.weekday() < 5:
            return d
        d -= timedelta(days=1)
    return base - timedelta(days=1)

async def _resolve_previous_trade_day(db, base: date) -> tuple[str, str]:
    client = TushareClient()
    if client.is_available():
        try:
            start = (base - timedelta(days=60)).strftime("%Y%m%d")
            end = base.strftime("%Y%m%d")
            cal = await client.get_trade_cal(start_date=start, end_date=end)
            if cal is not None and not cal.empty and "cal_date" in cal.columns:
                cal_dates = pd.to_datetime(cal["cal_date"], errors="coerce").dt.date
                is_open = cal["is_open"] if "is_open" in cal.columns else None
                if is_open is not None:
                    open_days = [d for d, open_flag in zip(cal_dates.tolist(), is_open.tolist()) if open_flag == 1 and d and d < base]
                else:
                    open_days = [d for d in cal_dates.tolist() if d and d < base]
                if open_days:
                    prev = max(open_days)
                    return prev.strftime("%Y-%m-%d"), "tushare_trade_cal"
        except Exception as e:
            logger.warning(f"resolve previous trade day via tushare failed: {e}")

    base_str = base.strftime("%Y-%m-%d")

    try:
        cursor = await db.execute("SELECT MAX(date) AS d FROM klines WHERE date < ?", (base_str,))
        row = await cursor.fetchone()
        if row and row["d"]:
            return str(row["d"]), "db_klines"
    except Exception:
        pass

    try:
        cursor = await db.execute(
            "SELECT MAX(DATE(snapshot_time)) AS d FROM quote_history WHERE DATE(snapshot_time) < DATE(?)",
            (base_str,),
        )
        row = await cursor.fetchone()
        if row and row["d"]:
            return str(row["d"]), "db_quote_history"
    except Exception:
        pass

    try:
        cursor = await db.execute("SELECT MAX(trade_date) AS d FROM daily_basic WHERE trade_date < ?", (base_str,))
        row = await cursor.fetchone()
        if row and row["d"]:
            return str(row["d"]), "db_daily_basic"
    except Exception:
        pass

    prev = _fallback_previous_weekday(base)
    return prev.strftime("%Y-%m-%d"), "weekday_fallback"

@router.get("/trade-day/previous")
async def get_previous_trade_day(
    date: str | None = Query(None),
):
    base = _parse_trade_date_param(date) or datetime.now().date()
    try:
        async with get_database() as db:
            prev, source = await _resolve_previous_trade_day(db, base)
            return {
                "success": True,
                "data": {
                    "baseDate": base.strftime("%Y-%m-%d"),
                    "previousTradeDate": prev,
                    "source": source,
                },
            }
    except Exception as e:
        logger.error(f"Error resolving previous trade day: {e}")
        raise HTTPException(status_code=500, detail="Failed to resolve previous trade day")

async def _get_latest_date(db, table: str) -> str | None:
    cursor = await db.execute(f"SELECT MAX(date) FROM {table}")
    row = await cursor.fetchone()
    return row[0] if row and row[0] else None

async def _build_market_overview(db):
    cursor = await db.execute("SELECT COUNT(*) as count FROM stocks")
    total_stocks = await cursor.fetchone()

    cursor = await db.execute("""
        SELECT COUNT(*) as count FROM buy_signals
        WHERE date(created_at) = date('now')
    """)
    today_signals = await cursor.fetchone()

    latest_volume_date = await _get_latest_date(db, "volume_analysis")
    volume_surges = 0
    top_volume_surge = []

    if latest_volume_date:
        cursor = await db.execute("""
            SELECT COUNT(*) as count
            FROM volume_analysis
            WHERE date = ? AND is_volume_surge = 1
        """, (latest_volume_date,))
        surge_count = await cursor.fetchone()
        volume_surges = surge_count[0] if surge_count else 0

        cursor = await db.execute("""
            SELECT
                va.stock_code,
                s.name as name,
                va.volume_ratio,
                va.date
            FROM volume_analysis va
            LEFT JOIN stocks s ON s.code = va.stock_code
            WHERE va.date = ? AND va.is_volume_surge = 1
            ORDER BY va.volume_ratio DESC
            LIMIT 10
        """, (latest_volume_date,))
        rows = await cursor.fetchall()
        top_volume_surge = [dict(r) for r in rows]

    latest_fund_date = await _get_latest_date(db, "fund_flow")
    fund_flow_positive = 0
    if latest_fund_date:
        cursor = await db.execute("""
            SELECT COUNT(*) as count
            FROM fund_flow
            WHERE date = ? AND main_fund_flow > 0
        """, (latest_fund_date,))
        positive = await cursor.fetchone()
        fund_flow_positive = positive[0] if positive else 0

    return {
        "success": True,
        "data": {
            "totalStocks": total_stocks[0] if total_stocks else 0,
            "todaySignals": today_signals[0] if today_signals else 0,
            "volumeSurges": volume_surges,
            "fundFlowPositive": fund_flow_positive,
            "topVolumeSurge": top_volume_surge,
            "dataDate": latest_volume_date or latest_fund_date or None,
        }
    }

@router.get("/overview")
async def get_analysis_overview():
    """Get analysis overview"""
    try:
        async with get_database() as db:
            result = await _build_market_overview(db)
            result["data"].pop("topVolumeSurge", None)
            result["data"].pop("dataDate", None)
            return result
    except Exception as e:
        logger.error(f"Error fetching analysis overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch analysis overview")

@router.get("/market-overview")
async def get_market_overview():
    try:
        async with get_database() as db:
            return await _build_market_overview(db)
    except Exception as e:
        logger.error(f"Error fetching market overview: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market overview")

@router.get("/signals")
async def get_recent_signals(
    days: int = Query(1, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200)
):
    try:
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT
                    bs.stock_code,
                    s.name as stock_name,
                    bs.signal_type,
                    bs.confidence,
                    bs.created_at
                FROM buy_signals bs
                LEFT JOIN stocks s ON bs.stock_code = s.code
                WHERE datetime(bs.created_at) >= datetime(?)
                ORDER BY bs.confidence DESC, bs.created_at DESC
                LIMIT ?
            """, (since, limit))
            rows = await cursor.fetchall()

            return {
                "success": True,
                "data": {
                    "days": days,
                    "signals": [dict(r) for r in rows]
                }
            }
    except Exception as e:
        logger.error(f"Error fetching recent signals: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch recent signals")

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

@router.get("/volume")
async def get_volume_surges(
    days: int = Query(10, ge=1, le=365),
    limit: int = Query(50, ge=1, le=200)
):
    try:
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT
                    va.stock_code,
                    s.name as stock_name,
                    s.exchange as exchange,
                    va.volume_ratio,
                    va.date
                FROM volume_analysis va
                LEFT JOIN stocks s ON s.code = va.stock_code
                WHERE va.date >= ? AND va.is_volume_surge = 1
                ORDER BY va.volume_ratio DESC
                LIMIT ?
            """, (since, limit))
            rows = await cursor.fetchall()

            return {
                "success": True,
                "data": {
                    "days": days,
                    "volumeSurges": [dict(r) for r in rows]
                }
            }
    except Exception as e:
        logger.error(f"Error fetching volume surges: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch volume surges")

@router.get("/main-force")
async def get_main_force(
    days: int = Query(7, ge=1, le=365),
    limit: int = Query(20, ge=1, le=200)
):
    try:
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT
                    ff.stock_code,
                    s.name as name,
                    SUM(ff.main_fund_flow) as main_flow_sum,
                    AVG(COALESCE(ff.large_order_ratio, 0)) as avg_large_ratio
                FROM fund_flow ff
                LEFT JOIN stocks s ON s.code = ff.stock_code
                WHERE ff.date >= ?
                GROUP BY ff.stock_code
                ORDER BY main_flow_sum DESC
                LIMIT ?
            """, (since, limit))
            rows = await cursor.fetchall()

            latest_kline_date = await _get_latest_date(db, "klines")
            volume_map: dict[str, int] = {}

            stock_codes = [r["stock_code"] for r in rows if r and r["stock_code"]]
            if latest_kline_date and stock_codes:
                placeholders = ",".join(["?"] * len(stock_codes))
                cursor = await db.execute(
                    f"SELECT stock_code, volume FROM klines WHERE date = ? AND stock_code IN ({placeholders})",
                    (latest_kline_date, *stock_codes)
                )
                krows = await cursor.fetchall()
                volume_map = {kr["stock_code"]: int(kr["volume"] or 0) for kr in krows}

            main_force = []
            strong_count = 0
            moderate_count = 0
            weak_count = 0
            total_strength = 0.0
            total_volume = 0

            for r in rows:
                stock_code = r["stock_code"]
                name = r["name"] or "未知"
                main_flow_sum = float(r["main_flow_sum"] or 0)
                avg_large_ratio = float(r["avg_large_ratio"] or 0)

                strength_yi = main_flow_sum / 1e8
                if main_flow_sum >= 1e8 and avg_large_ratio >= 0.3:
                    behavior = "强势介入"
                    level = "strong"
                    strong_count += 1
                elif main_flow_sum >= 5e7 and avg_large_ratio >= 0.2:
                    behavior = "稳步建仓"
                    level = "moderate"
                    moderate_count += 1
                elif main_flow_sum > 0:
                    behavior = "小幅流入"
                    level = "weak"
                    weak_count += 1
                else:
                    behavior = "观望"
                    level = "watch"

                strength_index = 0.0
                if main_flow_sum > 0:
                    strength_index = (main_flow_sum / 1e7) * 5 + avg_large_ratio * 50
                    strength_index = max(0.0, min(100.0, strength_index))

                trend = "上升" if main_flow_sum > 0 else "下降"
                volume = volume_map.get(stock_code, 0)

                main_force.append({
                    "stock": stock_code,
                    "name": name,
                    "behavior": behavior,
                    "strength": round(strength_yi, 2),
                    "strengthIndex": round(strength_index, 1),
                    "level": level,
                    "trend": trend,
                    "date": latest_kline_date,
                    "days": days,
                    "volume": volume,
                })

                if main_flow_sum > 0:
                    total_strength += strength_yi
                total_volume += volume

            positive_count = sum(1 for item in main_force if item["level"] != "watch")
            avg_strength = (total_strength / positive_count) if positive_count else 0.0

            return {
                "success": True,
                "data": {
                    "mainForce": main_force,
                    "summary": {
                        "strongCount": strong_count,
                        "moderateCount": moderate_count,
                        "weakCount": weak_count,
                        "avgStrength": round(avg_strength, 2),
                        "totalVolume": total_volume,
                    }
                }
            }
    except Exception as e:
        logger.error(f"Error fetching main force analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch main force analysis")

@router.get("/market-moneyflow")
async def get_market_moneyflow(
    days: int = Query(30, ge=1, le=365),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    try:
        async with get_database() as db:
            if date_from and date_to:
                cursor = await db.execute(
                    """
                    SELECT *
                    FROM market_moneyflow
                    WHERE trade_date >= ? AND trade_date <= ?
                    ORDER BY trade_date DESC
                    """,
                    (date_from, date_to),
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT *
                    FROM market_moneyflow
                    WHERE trade_date >= date('now', '-' || ? || ' days')
                    ORDER BY trade_date DESC
                    """,
                    (days,),
                )

            rows = await cursor.fetchall()
            market_flow = [dict(r) for r in rows]

            summary = {
                "totalNetAmount": 0.0,
                "totalElgAmount": 0.0,
                "totalLgAmount": 0.0,
                "totalMdAmount": 0.0,
                "totalSmAmount": 0.0,
                "avgNetAmountRate": 0.0,
                "latestSHIndex": 0.0,
                "latestSZIndex": 0.0,
                "latestSHChange": 0.0,
                "latestSZChange": 0.0,
            }

            if market_flow:
                latest = market_flow[0]
                summary["latestSHIndex"] = float(latest.get("close_sh") or 0.0)
                summary["latestSZIndex"] = float(latest.get("close_sz") or 0.0)
                summary["latestSHChange"] = float(latest.get("pct_change_sh") or 0.0)
                summary["latestSZChange"] = float(latest.get("pct_change_sz") or 0.0)

                summary["totalNetAmount"] = sum(float(item.get("net_amount") or 0.0) for item in market_flow)
                summary["totalElgAmount"] = sum(float(item.get("buy_elg_amount") or 0.0) for item in market_flow)
                summary["totalLgAmount"] = sum(float(item.get("buy_lg_amount") or 0.0) for item in market_flow)
                summary["totalMdAmount"] = sum(float(item.get("buy_md_amount") or 0.0) for item in market_flow)
                summary["totalSmAmount"] = sum(float(item.get("buy_sm_amount") or 0.0) for item in market_flow)
                summary["avgNetAmountRate"] = (
                    sum(float(item.get("net_amount_rate") or 0.0) for item in market_flow) / len(market_flow)
                )

            return {
                "success": True,
                "data": {
                    "marketFlow": market_flow,
                    "summary": summary,
                },
            }
    except Exception as e:
        logger.error(f"Error fetching market moneyflow: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch market moneyflow")

@router.get("/sector-moneyflow")
async def get_sector_moneyflow(
    days: int = Query(30, ge=1, le=365),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    try:
        async with get_database() as db:
            if date_from and date_to:
                cursor = await db.execute(
                    """
                    SELECT *
                    FROM sector_moneyflow
                    WHERE trade_date >= ? AND trade_date <= ?
                    ORDER BY trade_date DESC, net_amount DESC
                    """,
                    (date_from, date_to),
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT *
                    FROM sector_moneyflow
                    WHERE trade_date >= date('now', '-' || ? || ' days')
                    ORDER BY trade_date DESC, net_amount DESC
                    """,
                    (days,),
                )

            rows = await cursor.fetchall()
            sector_flow = [dict(r) for r in rows]

            summary = {
                "totalNetAmount": 0.0,
                "totalElgAmount": 0.0,
                "totalLgAmount": 0.0,
                "totalMdAmount": 0.0,
                "totalSmAmount": 0.0,
                "avgNetAmountRate": 0.0,
                "inflowSectors": 0,
                "outflowSectors": 0,
            }

            if sector_flow:
                summary["totalNetAmount"] = sum(float(item.get("net_amount") or 0.0) for item in sector_flow)
                summary["totalElgAmount"] = sum(float(item.get("buy_elg_amount") or 0.0) for item in sector_flow)
                summary["totalLgAmount"] = sum(float(item.get("buy_lg_amount") or 0.0) for item in sector_flow)
                summary["totalMdAmount"] = sum(float(item.get("buy_md_amount") or 0.0) for item in sector_flow)
                summary["totalSmAmount"] = sum(float(item.get("buy_sm_amount") or 0.0) for item in sector_flow)
                summary["avgNetAmountRate"] = (
                    sum(float(item.get("net_amount_rate") or 0.0) for item in sector_flow) / len(sector_flow)
                )
                summary["inflowSectors"] = sum(1 for item in sector_flow if float(item.get("net_amount") or 0.0) > 0.0)
                summary["outflowSectors"] = sum(1 for item in sector_flow if float(item.get("net_amount") or 0.0) < 0.0)

            return {
                "success": True,
                "data": {
                    "sectorFlow": sector_flow,
                    "summary": summary,
                },
            }
    except Exception as e:
        logger.error(f"Error fetching sector moneyflow: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sector moneyflow")

@router.get("/sector-volume")
async def get_sector_volume(
    days: int = Query(5, ge=1, le=30),
):
    try:
        async with get_database() as db:
            sql = """
                WITH latest_date AS (
                    SELECT MAX(date) as max_date FROM klines
                ),
                today_sector_data AS (
                    SELECT
                        s.industry as sector,
                        COUNT(DISTINCT k.stock_code) as stock_count,
                        SUM(k.volume) as total_volume,
                        SUM(k.amount) as total_amount,
                        SUM(CASE WHEN (k.close - k.open) > 0 THEN 1 ELSE 0 END) as up_count,
                        SUM(CASE WHEN (k.close - k.open) < 0 THEN 1 ELSE 0 END) as down_count,
                        AVG(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) as avg_change
                    FROM klines k
                    INNER JOIN stocks s ON k.stock_code = s.code
                    WHERE k.date = (SELECT max_date FROM latest_date)
                      AND s.industry IS NOT NULL
                      AND s.industry != ''
                    GROUP BY s.industry
                ),
                historical_sector_data AS (
                    SELECT
                        s.industry as sector,
                        AVG(k.volume) as avg_volume,
                        AVG(k.amount) as avg_amount
                    FROM klines k
                    INNER JOIN stocks s ON k.stock_code = s.code
                    WHERE k.date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
                      AND k.date < (SELECT max_date FROM latest_date)
                      AND s.industry IS NOT NULL
                      AND s.industry != ''
                    GROUP BY s.industry
                ),
                leading_stocks AS (
                    SELECT
                        s.industry as sector,
                        s.name as leading_stock,
                        CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END as leading_change
                    FROM klines k
                    INNER JOIN stocks s ON k.stock_code = s.code
                    WHERE k.date = (SELECT max_date FROM latest_date)
                      AND s.industry IS NOT NULL
                      AND s.industry != ''
                    GROUP BY s.industry
                    HAVING CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END =
                        MAX(CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END)
                )
                SELECT
                    t.sector,
                    t.total_volume as volume,
                    t.total_amount as amount,
                    CASE
                        WHEN h.avg_volume > 0 THEN ROUND(((t.total_volume - h.avg_volume) / h.avg_volume * 100), 2)
                        ELSE 0
                    END as volume_change,
                    t.stock_count,
                    t.up_count,
                    t.down_count,
                    ROUND(t.avg_change, 2) as avg_change,
                    COALESCE(l.leading_stock, '') as leading_stock,
                    COALESCE(ROUND(l.leading_change, 2), 0) as leading_stock_change
                FROM today_sector_data t
                LEFT JOIN historical_sector_data h ON t.sector = h.sector
                LEFT JOIN leading_stocks l ON t.sector = l.sector
                WHERE t.sector IS NOT NULL
                ORDER BY volume_change DESC
            """
            cursor = await db.execute(sql, (days,))
            rows = await cursor.fetchall()
            sectors = [dict(r) for r in rows]

            summary = {
                "totalVolume": 0.0,
                "avgVolumeChange": 0.0,
                "activeSectors": 0,
                "weakSectors": 0,
            }

            if sectors:
                summary["totalVolume"] = sum(float(item.get("volume") or 0.0) for item in sectors)
                summary["avgVolumeChange"] = (
                    sum(float(item.get("volume_change") or 0.0) for item in sectors) / len(sectors)
                )
                summary["activeSectors"] = sum(
                    1 for item in sectors if float(item.get("volume_change") or 0.0) > 20.0
                )
                summary["weakSectors"] = sum(
                    1 for item in sectors if float(item.get("volume_change") or 0.0) < -10.0
                )

            return {
                "success": True,
                "data": {
                    "sectors": sectors,
                    "summary": summary,
                },
            }
    except Exception as e:
        logger.error(f"Error fetching sector volume analysis: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch sector volume analysis")

@router.get("/hot-sector-stocks")
async def get_hot_sector_stocks(
    days: int = Query(1, ge=1, le=30),
    limit: int = Query(10, ge=1, le=50),
):
    try:
        async with get_database() as db:
            sql = """
                WITH latest_date AS (
                    SELECT MAX(date) as max_date FROM klines
                ),
                hot_sectors AS (
                    SELECT DISTINCT
                        s.industry as sector_name,
                        COALESCE(MAX(sm.net_amount), 0) as sector_money_flow,
                        COALESCE(MAX(sm.pct_change), 0) as sector_pct_change
                    FROM stocks s
                    INNER JOIN klines k ON s.code = k.stock_code
                    LEFT JOIN sector_moneyflow sm ON (
                        (sm.name = s.industry
                        OR sm.name LIKE '%' || s.industry || '%'
                        OR s.industry LIKE '%' || sm.name || '%')
                        AND sm.trade_date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
                    )
                    WHERE k.date >= date((SELECT max_date FROM latest_date), '-' || ? || ' days')
                      AND s.industry IS NOT NULL
                      AND s.industry != ''
                    GROUP BY s.industry
                    HAVING COUNT(DISTINCT k.stock_code) >= 3
                ),
                sector_stocks AS (
                    SELECT
                        hs.sector_name,
                        hs.sector_money_flow,
                        hs.sector_pct_change,
                        s.code as stock_code,
                        s.name as stock_name,
                        k.close as price,
                        k.volume,
                        ROUND(((k.close - k.open) / k.open * 100), 2) as change_percent,
                        COALESCE(va.volume_ratio, 1.0) as volume_ratio,
                        COALESCE(ff.main_fund_flow, 0) as main_fund_flow,
                        (
                            (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
                            (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
                            (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
                        ) as score,
                        ROW_NUMBER() OVER (PARTITION BY hs.sector_name ORDER BY
                            (
                                (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
                                (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
                                (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
                            ) DESC
                        ) as rank_in_sector
                    FROM hot_sectors hs
                    INNER JOIN stocks s ON s.industry = hs.sector_name
                    INNER JOIN klines k ON s.code = k.stock_code AND k.date = (SELECT max_date FROM latest_date)
                    LEFT JOIN volume_analysis va ON s.code = va.stock_code AND va.date = (SELECT max_date FROM latest_date)
                    LEFT JOIN fund_flow ff ON s.code = ff.stock_code AND ff.date = (SELECT max_date FROM latest_date)
                    WHERE k.volume > 0
                )
                SELECT
                    sector_name,
                    sector_money_flow,
                    sector_pct_change,
                    stock_code,
                    stock_name,
                    price,
                    volume,
                    change_percent,
                    volume_ratio,
                    main_fund_flow,
                    ROUND(score, 2) as score,
                    rank_in_sector
                FROM sector_stocks
                WHERE rank_in_sector <= ?
                ORDER BY sector_money_flow DESC, rank_in_sector ASC
            """
            cursor = await db.execute(sql, (days, days, limit))
            rows = await cursor.fetchall()
            hot_sector_stocks = [dict(r) for r in rows]

        sector_groups: dict[str, dict] = {}
        for item in hot_sector_stocks:
            name = item.get("sector_name") or ""
            if not name:
                continue
            group = sector_groups.get(name)
            if not group:
                group = {
                    "sectorName": name,
                    "sectorMoneyFlow": float(item.get("sector_money_flow") or 0.0),
                    "sectorPctChange": float(item.get("sector_pct_change") or 0.0),
                    "stocks": [],
                }
                sector_groups[name] = group

            group["stocks"].append(
                {
                    "stockCode": item.get("stock_code") or "",
                    "stockName": item.get("stock_name") or "",
                    "price": float(item.get("price") or 0.0),
                    "volume": int(item.get("volume") or 0),
                    "changePercent": float(item.get("change_percent") or 0.0),
                    "volumeRatio": float(item.get("volume_ratio") or 0.0),
                    "mainFundFlow": float(item.get("main_fund_flow") or 0.0),
                    "score": float(item.get("score") or 0.0),
                    "rank": int(item.get("rank_in_sector") or 0),
                }
            )

        sectors = sorted(
            sector_groups.values(),
            key=lambda x: float(x.get("sectorMoneyFlow") or 0.0),
            reverse=True,
        )

        summary = {
            "totalSectors": len(sectors),
            "totalStocks": len(hot_sector_stocks),
            "avgSectorMoneyFlow": 0.0,
        }

        if sectors:
            summary["avgSectorMoneyFlow"] = sum(
                float(item.get("sectorMoneyFlow") or 0.0) for item in sectors
            ) / len(sectors)

        return {
            "success": True,
            "data": {
                "sectors": sectors,
                "summary": summary,
            },
        }
    except Exception as e:
        logger.error(f"Error fetching hot sector stocks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch hot sector stocks")

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


@router.get("/auction/super-main-force")
async def get_auction_super_main_force(
    limit: int = Query(50, ge=1, le=200),
    trade_date: str | None = Query(None),
    exclude_auction_limit_up: bool = Query(True),
    min_room_to_limit_pct: float = Query(2.0, ge=0.0, le=30.0),
    theme_alpha: float = Query(0.25, ge=0.0, le=0.5),
    pe_filter: bool = Query(False),
):
    try:
        def compute_rank_scores(values: list[float]) -> list[float]:
            n = len(values)
            if n <= 0:
                return []
            if n == 1:
                return [1.0 if values[0] > 0 else 0.0]

            pairs = [(float(v), idx) for idx, v in enumerate(values)]
            pairs.sort(key=lambda x: x[0])

            scores = [0.0] * n
            i = 0
            while i < n:
                v = pairs[i][0]
                j = i + 1
                while j < n and pairs[j][0] == v:
                    j += 1

                avg_rank = ((i + 1) + j) / 2.0
                pct = (avg_rank - 1.0) / (n - 1.0)
                score = (pct ** 0.7) if v > 0 else 0.0
                for k in range(i, j):
                    scores[pairs[k][1]] = score
                i = j

            return scores

        def parse_up_num(v) -> float:
            if v is None:
                return 0.0
            s = str(v).strip()
            if not s:
                return 0.0
            if s in ("持平", "平"):
                return 0.0
            try:
                return float(s.replace("+", ""))
            except Exception:
                return 0.0

        def clamp01(x: float) -> float:
            if x <= 0.0:
                return 0.0
            if x >= 1.0:
                return 1.0
            return x

        def score_ramp(v: float, low: float, high: float) -> float:
            if high <= low:
                return 0.0
            if v <= low:
                return 0.0
            if v >= high:
                return 1.0
            return (v - low) / (high - low)

        def score_tri(v: float, low: float, mid: float, high: float) -> float:
            if not (low < mid < high):
                return 0.0
            if v <= low or v >= high:
                return 0.0
            if v == mid:
                return 1.0
            if v < mid:
                return (v - low) / (mid - low)
            return (high - v) / (high - mid)

        async with get_database() as db:
            target_date = None

            if trade_date:
                s = str(trade_date).strip()
                dt = None
                try:
                    if len(s) >= 10 and "-" in s:
                        dt = datetime.strptime(s[:10], "%Y-%m-%d").date()
                    elif len(s) == 8 and s.isdigit():
                        dt = datetime.strptime(s, "%Y%m%d").date()
                except Exception:
                    dt = None

                if dt:
                    target_date = dt.strftime("%Y-%m-%d")

            if not target_date:
                cursor = await db.execute(
                    "SELECT DATE(snapshot_time) AS d FROM quote_history ORDER BY d DESC LIMIT 1"
                )
                row = await cursor.fetchone()
                if not row or not row[0]:
                    return {
                        "success": True,
                        "data": {
                            "tradeDate": None,
                            "dataSource": "none",
                            "items": [],
                            "summary": {
                                "count": 0,
                                "avgHeat": 0.0,
                                "totalAmount": 0.0,
                                "limitUpCandidates": 0
                            }
                        }
                    }
                target_date = str(row[0])

            data_source = "quote_history"

            snapshot_time = f"{target_date} 09:26:00"
            cursor = await db.execute(
                """
                SELECT
                    stock_code,
                    pre_close,
                    open,
                    high,
                    low,
                    close,
                    vol,
                    amount,
                    num
                FROM quote_history
                WHERE snapshot_time = ?
                """,
                (snapshot_time,),
            )
            rows = await cursor.fetchall()
            records = [dict(row) for row in rows]

            if not records:
                return {
                    "success": True,
                    "message": f"未找到 {target_date} 的集合竞价快照数据",
                    "data": {
                        "tradeDate": target_date,
                        "dataSource": "none",
                        "items": [],
                        "summary": {
                            "count": 0,
                            "avgHeat": 0.0,
                            "totalAmount": 0.0,
                            "limitUpCandidates": 0
                        }
                    }
                }

            stock_codes = [str(r.get("stock_code") or "") for r in records if r.get("stock_code")]
            stock_codes = list({c for c in stock_codes if c})

            stock_info_map: dict[str, dict] = {}
            daily_basic_map: dict[str, dict] = {}
            theme_score_map: dict[str, dict] = {}
            stock_theme_candidates_map: dict[str, list[dict]] = {}
            theme_coverage = 0.0
            closing_info_map: dict[str, dict] = {}

            trade_date_ret = target_date
            theme_date = trade_date_ret

            if stock_codes:
                placeholders = ",".join(["?"] * len(stock_codes))

                cursor = await db.execute(
                    f"SELECT code, name, industry, exchange FROM stocks WHERE code IN ({placeholders})",
                    stock_codes
                )
                stock_rows = await cursor.fetchall()
                for row in stock_rows:
                    code = row["code"]
                    stock_info_map[code] = {
                        "name": row["name"],
                        "industry": row["industry"],
                        "exchange": row["exchange"],
                    }

                cursor = await db.execute(
                    f"""
                    SELECT stock_code, turnover_rate, volume_ratio, float_share, pe, pe_ttm
                    FROM daily_basic
                    WHERE trade_date = ? AND stock_code IN ({placeholders})
                    """,
                    (trade_date_ret, *stock_codes),
                )
                db_rows = await cursor.fetchall()
                for row in db_rows:
                    code = row["stock_code"]
                    daily_basic_map[code] = {
                        "turnover_rate": float(row["turnover_rate"] or 0.0),
                        "volume_ratio": float(row["volume_ratio"] or 0.0),
                        "float_share": float(row["float_share"] or 0.0),
                        "pe": float(row["pe"]) if row["pe"] is not None else None,
                        "pe_ttm": float(row["pe_ttm"]) if row["pe_ttm"] is not None else None,
                    }

                if pe_filter:
                    fallback_codes: list[str] = []
                    for code in stock_codes:
                        info = daily_basic_map.get(code)
                        pe_val = info.get("pe") if info else None
                        pe_ttm_val = info.get("pe_ttm") if info else None
                        pe_missing = pe_val is None or (isinstance(pe_val, float) and math.isnan(pe_val))
                        pe_ttm_missing = pe_ttm_val is None or (isinstance(pe_ttm_val, float) and math.isnan(pe_ttm_val))
                        if pe_missing and pe_ttm_missing:
                            fallback_codes.append(code)

                    if fallback_codes:
                        placeholders_fb = ",".join(["?"] * len(fallback_codes))
                        cursor = await db.execute(
                            f"""
                            SELECT db.stock_code, db.pe, db.pe_ttm
                            FROM daily_basic db
                            JOIN (
                                SELECT stock_code, MAX(trade_date) AS trade_date
                                FROM daily_basic
                                WHERE stock_code IN ({placeholders_fb})
                                  AND trade_date < ?
                                  AND (pe IS NOT NULL OR pe_ttm IS NOT NULL)
                                GROUP BY stock_code
                            ) latest
                            ON db.stock_code = latest.stock_code AND db.trade_date = latest.trade_date
                            """,
                            (*fallback_codes, trade_date_ret),
                        )
                        fb_rows = await cursor.fetchall()
                        for row in fb_rows:
                            code = str(row["stock_code"] or "")
                            if not code:
                                continue
                            info = daily_basic_map.get(code) or {
                                "turnover_rate": 0.0,
                                "volume_ratio": 0.0,
                                "float_share": 0.0,
                                "pe": None,
                                "pe_ttm": None,
                            }
                            if info.get("pe") is None and row["pe"] is not None:
                                info["pe"] = float(row["pe"])
                            if info.get("pe_ttm") is None and row["pe_ttm"] is not None:
                                info["pe_ttm"] = float(row["pe_ttm"])
                            daily_basic_map[code] = info

                placeholders_ci = ",".join(["?"] * len(stock_codes))
                cursor = await db.execute(
                    f"""
                    SELECT
                        q.stock_code as stock,
                        COALESCE(db0.close, k.close, q.close) as close_price
                    FROM quote_history q
                    LEFT JOIN daily_basic db0
                        ON db0.stock_code = q.stock_code
                       AND REPLACE(db0.trade_date, '-', '') = REPLACE(?, '-', '')
                    LEFT JOIN klines k
                        ON k.stock_code = q.stock_code
                       AND k.date = (
                           SELECT MAX(date)
                           FROM klines
                           WHERE stock_code = q.stock_code
                             AND date <= ?
                       )
                    WHERE q.snapshot_time = ?
                      AND q.stock_code IN ({placeholders_ci})
                    """,
                    (trade_date_ret, trade_date_ret, snapshot_time, *stock_codes),
                )
                ci_rows = await cursor.fetchall()
                for row in ci_rows:
                    stock = str(row["stock"] or "")
                    if not stock:
                        continue
                    closing_info_map[stock] = {
                        "close_price": float(row["close_price"] or 0.0),
                    }

            if theme_alpha > 0:
                cursor = await db.execute(
                    "SELECT COUNT(1) as c FROM kpl_concepts WHERE trade_date = ?",
                    (theme_date,),
                )
                row = await cursor.fetchone()
                concept_cnt = int(row["c"] or 0) if row else 0

                cursor = await db.execute(
                    "SELECT COUNT(1) as c FROM kpl_concept_cons WHERE trade_date = ?",
                    (theme_date,),
                )
                row = await cursor.fetchone()
                cons_cnt = int(row["c"] or 0) if row else 0

                if concept_cnt <= 0 or cons_cnt <= 0:
                    client = TushareClient()
                    if client.is_available():
                        df_concept = await client.get_kpl_concept(trade_date_ret)
                        if df_concept is not None and not df_concept.empty:
                            for _, r in df_concept.iterrows():
                                ts_code = str(r.get("ts_code") or "").strip()
                                if not ts_code:
                                    continue
                                name = str(r.get("name") or "").strip()
                                z_t_num = int(r.get("z_t_num") or 0) if pd.notna(r.get("z_t_num")) else 0
                                up_num = str(r.get("up_num") or "")
                                await db.execute(
                                    """
                                    INSERT OR REPLACE INTO kpl_concepts
                                    (trade_date, ts_code, name, z_t_num, up_num, created_at)
                                    VALUES (?, ?, ?, ?, ?, datetime('now'))
                                    """,
                                    (trade_date_ret, ts_code, name, z_t_num, up_num),
                                )

                        df_cons = await client.get_kpl_concept_cons(trade_date_ret)
                        if df_cons is not None and not df_cons.empty:
                            for _, r in df_cons.iterrows():
                                theme_code = str(r.get("ts_code") or "").strip()
                                if not theme_code:
                                    continue
                                theme_name = str(r.get("name") or "").strip()
                                con_code = str(r.get("con_code") or r.get("stock_code") or "").strip()
                                if not con_code:
                                    continue
                                stock_code = con_code.split(".")[0] if "." in con_code else con_code
                                con_name = str(r.get("con_name") or "").strip()
                                desc = str(r.get("desc") or "").strip()
                                hot_num = float(r.get("hot_num") or 0.0) if pd.notna(r.get("hot_num")) else 0.0
                                await db.execute(
                                    """
                                    INSERT OR REPLACE INTO kpl_concept_cons
                                    (trade_date, ts_code, name, stock_code, con_code, con_name, desc, hot_num, created_at)
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                                    """,
                                    (
                                        trade_date_ret,
                                        theme_code,
                                        theme_name,
                                        stock_code,
                                        con_code,
                                        con_name,
                                        desc,
                                        hot_num,
                                    ),
                                )

                        await db.commit()

                cursor = await db.execute(
                    "SELECT COUNT(1) as c FROM kpl_concepts WHERE trade_date = ?",
                    (trade_date_ret,),
                )
                row = await cursor.fetchone()
                concept_cnt = int(row["c"] or 0) if row else 0

                cursor = await db.execute(
                    "SELECT COUNT(1) as c FROM kpl_concept_cons WHERE trade_date = ?",
                    (trade_date_ret,),
                )
                row = await cursor.fetchone()
                cons_cnt = int(row["c"] or 0) if row else 0

                if concept_cnt <= 0 or cons_cnt <= 0:
                    cursor = await db.execute(
                        """
                        SELECT MAX(k.trade_date) as d
                        FROM kpl_concepts k
                        WHERE k.trade_date <= ?
                          AND EXISTS (
                            SELECT 1 FROM kpl_concept_cons c
                            WHERE c.trade_date = k.trade_date
                            LIMIT 1
                          )
                        """,
                        (trade_date_ret,),
                    )
                    row = await cursor.fetchone()
                    fallback = str(row["d"] or "") if row and row["d"] else ""
                    if fallback:
                        theme_date = fallback
                else:
                    theme_date = trade_date_ret

                cursor = await db.execute(
                    "SELECT ts_code, name, COALESCE(z_t_num, 0) as z_t_num, COALESCE(up_num, '') as up_num FROM kpl_concepts WHERE trade_date = ?",
                    (theme_date,),
                )
                theme_rows = await cursor.fetchall()
                theme_list = [dict(r) for r in theme_rows] if theme_rows else []

                if theme_list:
                    theme_coverage = min(1.0, float(len(theme_list)) / 50.0)
                    z_processed = [math.log1p(max(int(t.get("z_t_num") or 0), 0)) for t in theme_list]
                    up_processed = [max(0.0, parse_up_num(t.get("up_num"))) for t in theme_list]
                    z_scores = compute_rank_scores([float(v or 0.0) for v in z_processed])
                    up_scores = compute_rank_scores([float(v or 0.0) for v in up_processed])
                    for idx, t in enumerate(theme_list):
                        code = str(t.get("ts_code") or "")
                        if not code:
                            continue
                        theme_score_map[code] = {
                            "score": float(z_scores[idx]) * 0.6 + float(up_scores[idx]) * 0.4,
                            "name": str(t.get("name") or ""),
                        }

                if stock_codes:
                    placeholders = ",".join(["?"] * len(stock_codes))
                    cursor = await db.execute(
                        f"""
                        SELECT stock_code, ts_code, name, COALESCE(hot_num, 0) as hot_num
                        FROM kpl_concept_cons
                        WHERE trade_date = ? AND stock_code IN ({placeholders})
                        """,
                        (theme_date, *stock_codes),
                    )
                    map_rows = await cursor.fetchall()
                    for r in map_rows:
                        sc = str(r["stock_code"] or "")
                        tc = str(r["ts_code"] or "")
                        if not sc or not tc:
                            continue
                        lst = stock_theme_candidates_map.get(sc)
                        if not lst:
                            lst = []
                            stock_theme_candidates_map[sc] = lst
                        lst.append({
                            "ts_code": tc,
                            "name": str(r["name"] or ""),
                            "hot_num": float(r["hot_num"] or 0.0),
                        })

        pool: list[dict] = []

        for r in records:
            stock_code = str(r.get("stock_code") or "")
            if not stock_code:
                continue
            if stock_code.startswith("920"):
                continue

            info = stock_info_map.get(stock_code, {})

            price = float(r.get("open") or r.get("close") or 0.0)
            pre_close = float(r.get("pre_close") or 0.0)
            vol = int(r.get("vol") or 0)
            amount = float(r.get("amount") or 0.0)

            if vol <= 0 and amount <= 0:
                continue

            daily_basic = daily_basic_map.get(stock_code, {})
            turnover_rate = float(daily_basic.get("turnover_rate") or 0.0)
            volume_ratio = float(daily_basic.get("volume_ratio") or 0.0)
            float_share = float(daily_basic.get("float_share") or 0.0)
            pe_value = daily_basic.get("pe")
            pe_ttm_value = daily_basic.get("pe_ttm")

            closing_info = closing_info_map.get(stock_code, {})
            close_price = float(closing_info.get("close_price") or 0.0)
            change_percent_close = 0.0
            if pre_close > 0 and close_price > 0:
                change_percent_close = (close_price - pre_close) / pre_close * 100.0

            gap_percent = 0.0
            gap_ratio = 0.0
            if pre_close > 0:
                gap_ratio = (price - pre_close) / pre_close
                gap_percent = (price - pre_close) / pre_close * 100.0

            name = str(info.get("name") or "")
            upper_name = name.upper()

            if "ST" in upper_name:
                continue

            limit_pct = 10.0
            if stock_code.startswith(("300", "301", "688", "689")):
                limit_pct = 20.0
            elif stock_code.startswith(("8", "4")):
                limit_pct = 30.0

            gap_ratio_processed = 0.0
            if gap_ratio > 0:
                if gap_ratio > 0.05:
                    gap_ratio_processed = 0.05 + (gap_ratio - 0.05) * 0.3
                else:
                    gap_ratio_processed = gap_ratio

            volume_ratio_processed = 0.0
            if volume_ratio > 0:
                volume_ratio_processed = math.log2(1.0 + min(volume_ratio, 20.0))

            fund_strength = 0.0
            denom_mv = float_share * price * 10000.0
            if denom_mv > 0 and amount > 0:
                fund_strength = amount / denom_mv
                if fund_strength > 0.1:
                    fund_strength = 0.1 + (fund_strength - 0.1) * 0.2

            volume_density = 0.0
            denom_vol = float_share * 10000.0
            if denom_vol > 0 and vol > 0:
                volume_density = vol / denom_vol

            limit_price = round(pre_close * (1.0 + limit_pct / 100.0) + 1e-9, 2) if pre_close > 0 else 0.0
            auction_limit_up = pre_close > 0 and price > 0 and price >= (limit_price - 0.0001)

            room_to_limit_pct = 0.0
            if pre_close > 0 and limit_price > 0 and price > 0:
                room_to_limit_pct = (limit_price - price) / pre_close * 100.0

            bucket = "10cm_small"
            if limit_pct >= 19.9:
                bucket = "20cm"
            elif denom_mv >= 1e10:
                bucket = "10cm_large"

            if bucket == "20cm":
                gap_low, gap_mid, gap_high = 7.5, 12.0, 18.5
                vr_low, vr_mid, vr_high = 1.2, 3.0, 10.0
                room_low, room_mid, room_high = max(min_room_to_limit_pct, 2.5), 5.0, 10.5
                amount_min, amount_mid = 6e7, 2.5e8
                fs_low, fs_mid, fs_high = 0.0015, 0.0055, 0.02
                breakout_threshold = 0.63
            elif bucket == "10cm_large":
                gap_low, gap_mid, gap_high = 5.0, 7.2, 9.0
                vr_low, vr_mid, vr_high = 1.0, 2.2, 7.0
                room_low, room_mid, room_high = max(min_room_to_limit_pct, 1.8), 3.8, 6.5
                amount_min, amount_mid = 8e7, 4e8
                fs_low, fs_mid, fs_high = 0.001, 0.0035, 0.015
                breakout_threshold = 0.60
            else:
                gap_low, gap_mid, gap_high = 6.2, 8.2, 9.8
                vr_low, vr_mid, vr_high = 1.2, 3.0, 12.0
                room_low, room_mid, room_high = max(min_room_to_limit_pct, 1.5), 3.5, 7.0
                amount_min, amount_mid = 3e7, 1.5e8
                fs_low, fs_mid, fs_high = 0.002, 0.008, 0.03
                breakout_threshold = 0.62

            gap_score_breakout = score_tri(gap_percent, gap_low, gap_mid, gap_high)
            vr_score_breakout = score_tri(min(volume_ratio, 20.0), vr_low, vr_mid, vr_high)
            room_score_breakout = score_tri(room_to_limit_pct, room_low, room_mid, room_high)
            amount_score_breakout = score_ramp(amount, amount_min, amount_mid)
            fs_score_breakout = score_tri(fund_strength, fs_low, fs_mid, fs_high)

            breakout_score = (
                gap_score_breakout * 0.34
                + vr_score_breakout * 0.26
                + room_score_breakout * 0.18
                + amount_score_breakout * 0.12
                + fs_score_breakout * 0.10
            )

            if volume_ratio >= 120:
                breakout_score *= 0.55
            elif volume_ratio >= 50:
                breakout_score *= 0.70

            breakout_score = clamp01(breakout_score)

            likely_limit_up = (
                (not auction_limit_up)
                and gap_percent >= gap_low
                and volume_ratio >= vr_low
                and room_to_limit_pct >= min_room_to_limit_pct
                and breakout_score >= breakout_threshold
            )

            exchange = info.get("exchange") or ""
            ts_code = stock_code
            if exchange:
                ts_code = f"{stock_code}.{exchange}"

            theme_heat_score = 0.0
            theme_code = ""
            theme_name = ""
            theme_candidates = stock_theme_candidates_map.get(stock_code) or []
            best_hot = -1.0
            best_score = -1.0
            for cand in theme_candidates:
                c = str(cand.get("ts_code") or "")
                if not c:
                    continue
                hot_num = float(cand.get("hot_num") or 0.0)
                meta = theme_score_map.get(c) or {}
                s = float(meta.get("score") or 0.0)

                if hot_num > best_hot or (hot_num == best_hot and s > best_score):
                    best_hot = hot_num
                    best_score = s
                    theme_code = c
                    theme_heat_score = s
                    theme_name = str(meta.get("name") or cand.get("name") or "")

            if best_hot <= 0.0 and theme_heat_score <= 0.0:
                theme_heat_score = 0.0
                theme_code = ""
                theme_name = ""

            if theme_heat_score > 0.0 and theme_coverage > 0.0 and theme_coverage < 1.0:
                theme_heat_score *= theme_coverage

            if not theme_name:
                theme_heat_score = 0.0
                theme_code = ""
                theme_name = str(info.get("industry") or "")

            pool.append({
                "stock": stock_code,
                "tsCode": ts_code,
                "name": info.get("name") or "",
                "industry": info.get("industry") or "",
                "price": round(price, 3),
                "preClose": round(pre_close, 3),
                "gapPercent": round(gap_percent, 2),
                "close": round(close_price, 3),
                "changePercent": round(change_percent_close, 2),
                "vol": vol,
                "amount": round(amount, 2),
                "turnoverRate": round(turnover_rate, 3),
                "volumeRatio": round(volume_ratio, 3),
                "floatShare": float_share,
                "pe": pe_value,
                "peTtm": pe_ttm_value,
                "likelyLimitUp": likely_limit_up,
                "auctionLimitUp": auction_limit_up,
                "themeHeatScore": round(theme_heat_score, 6),
                "themeCode": theme_code,
                "themeName": theme_name,
                "_volumeRatioProcessed": volume_ratio_processed,
                "_gapProcessed": gap_ratio_processed,
                "_fundStrengthProcessed": fund_strength,
                "_volumeDensityProcessed": volume_density,
            })

        if not pool:
            return {
                "success": True,
                "data": {
                    "tradeDate": trade_date_ret,
                    "dataSource": data_source,
                    "items": [],
                    "summary": {
                        "count": 0,
                        "avgHeat": 0.0,
                        "totalAmount": 0.0,
                        "limitUpCandidates": 0
                    }
                }
            }

        volume_ratio_scores = compute_rank_scores([float(i.get("_volumeRatioProcessed") or 0.0) for i in pool])
        gap_scores = compute_rank_scores([float(i.get("_gapProcessed") or 0.0) for i in pool])
        fund_strength_scores = compute_rank_scores([float(i.get("_fundStrengthProcessed") or 0.0) for i in pool])
        volume_density_scores = compute_rank_scores([float(i.get("_volumeDensityProcessed") or 0.0) for i in pool])
        turnover_scores = compute_rank_scores([float(i.get("turnoverRate") or 0.0) for i in pool])

        items: list[dict] = []
        for idx, item in enumerate(pool):
            base_heat_score = (
                volume_ratio_scores[idx] * 0.35
                + gap_scores[idx] * 0.25
                + fund_strength_scores[idx] * 0.20
                + volume_density_scores[idx] * 0.15
                + turnover_scores[idx] * 0.05
            ) * 100.0

            theme_heat = float(item.get("themeHeatScore") or 0.0)
            enhance_factor = 1.0 + theme_alpha * theme_heat
            final_score = base_heat_score * enhance_factor

            item["baseHeatScore"] = round(base_heat_score, 2)
            item["themeAlpha"] = round(theme_alpha, 4)
            item["themeEnhanceFactor"] = round(enhance_factor, 6)
            item["heatScore"] = round(final_score, 2)
            item.pop("_volumeRatioProcessed", None)
            item.pop("_gapProcessed", None)
            item.pop("_fundStrengthProcessed", None)
            item.pop("_volumeDensityProcessed", None)

            if exclude_auction_limit_up and bool(item.get("auctionLimitUp")):
                continue
            items.append(item)

        if pe_filter:
            def _is_missing_pe(v) -> bool:
                if v is None:
                    return True
                try:
                    return math.isnan(float(v))
                except Exception:
                    return True

            def _is_in_pe_range(v) -> bool:
                try:
                    x = float(v)
                except Exception:
                    return False
                return x > 0.0 and x <= 300.0

            filtered_items: list[dict] = []
            for item in items:
                pe_val = item.get("pe")
                pe_ttm_val = item.get("peTtm")
                pe_missing = _is_missing_pe(pe_val)
                pe_ttm_missing = _is_missing_pe(pe_ttm_val)
                if pe_missing and pe_ttm_missing:
                    continue
                if not pe_missing and not _is_in_pe_range(pe_val):
                    continue
                if not pe_ttm_missing and not _is_in_pe_range(pe_ttm_val):
                    continue
                filtered_items.append(item)
            items = filtered_items

        if not items:
            return {
                "success": True,
                "data": {
                    "tradeDate": trade_date_ret,
                    "dataSource": data_source,
                    "items": [],
                    "summary": {
                        "count": 0,
                        "avgHeat": 0.0,
                        "totalAmount": 0.0,
                        "limitUpCandidates": 0
                    }
                }
            }

        items.sort(key=lambda x: x["heatScore"], reverse=True)
        unique_items: list[dict] = []
        seen_codes: set[str] = set()
        for item in items:
            code = str(item.get("stock") or "")
            if not code or code in seen_codes:
                continue
            seen_codes.add(code)
            unique_items.append(item)

        items = unique_items[:limit]
        total_amount = sum(float(i.get("amount") or 0.0) for i in items)

        for idx, item in enumerate(items, 1):
            item["rank"] = idx

        count = len(items)
        avg_heat = sum(i["heatScore"] for i in items) / count if count else 0.0
        limit_up_candidates = sum(1 for i in items if i["likelyLimitUp"])

        return {
            "success": True,
            "data": {
                "tradeDate": trade_date_ret,
                "dataSource": data_source,
                "items": items,
                "summary": {
                    "count": count,
                    "avgHeat": round(avg_heat, 2),
                    "totalAmount": round(total_amount, 2),
                    "limitUpCandidates": limit_up_candidates
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching auction super main force: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch auction super main force")
