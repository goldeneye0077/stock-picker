from fastapi import APIRouter, HTTPException, Query
from ..utils.database import get_database
from ..data_sources.tushare_client import TushareClient
from loguru import logger
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
import math
import pandas as pd
from typing import Any

router = APIRouter()

_SUPER_MAIN_FORCE_TUNE_CACHE: dict[str, tuple[datetime, dict[str, Any]]] = {}
_SUPER_MAIN_FORCE_TUNE_CACHE_TTL_SECONDS = 600

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
    sort_mode: str = Query("heat"),
    dynamic_theme_alpha: bool = Query(True),
    rolling_window_days: int = Query(20, ge=5, le=120),
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

        def normalize_weights(
            raw_weights: dict[str, float],
            default_weights: dict[str, float],
            min_weight: float = 0.005,
        ) -> dict[str, float]:
            keys = list(default_weights.keys())
            prepared: dict[str, float] = {}
            for key in keys:
                v = float(raw_weights.get(key, 0.0) or 0.0)
                if not math.isfinite(v):
                    v = 0.0
                prepared[key] = max(v, min_weight)

            s = sum(prepared.values())
            if s <= 0:
                return dict(default_weights)
            return {k: prepared[k] / s for k in keys}

        def blend_weights(
            default_weights: dict[str, float],
            tuned_weights: dict[str, float],
            tuned_strength: float = 0.65,
        ) -> dict[str, float]:
            alpha = max(0.0, min(1.0, float(tuned_strength)))
            mixed = {
                key: float(default_weights.get(key, 0.0)) * (1.0 - alpha)
                + float(tuned_weights.get(key, 0.0)) * alpha
                for key in default_weights.keys()
            }
            return normalize_weights(mixed, default_weights)

        def infer_limit_pct(stock_code: str) -> float:
            code = str(stock_code or "")
            if code.startswith(("300", "301", "688", "689")):
                return 20.0
            if code.startswith(("8", "4")):
                return 30.0
            return 10.0

        def resolve_bucket(limit_pct: float, denom_mv: float) -> str:
            if limit_pct >= 19.9:
                return "20cm"
            if denom_mv >= 1e10:
                return "10cm_large"
            return "10cm_small"

        def get_bucket_params(bucket: str, room_floor: float) -> dict[str, float]:
            if bucket == "20cm":
                return {
                    "gap_low": 7.5,
                    "gap_mid": 12.0,
                    "gap_high": 18.5,
                    "vr_low": 1.2,
                    "vr_mid": 3.0,
                    "vr_high": 10.0,
                    "room_low": max(room_floor, 2.5),
                    "room_mid": 5.0,
                    "room_high": 10.5,
                    "amount_min": 6e7,
                    "amount_mid": 2.5e8,
                    "fs_low": 0.0015,
                    "fs_mid": 0.0055,
                    "fs_high": 0.02,
                    "default_breakout_threshold": 0.63,
                }
            if bucket == "10cm_large":
                return {
                    "gap_low": 5.0,
                    "gap_mid": 7.2,
                    "gap_high": 9.0,
                    "vr_low": 1.0,
                    "vr_mid": 2.2,
                    "vr_high": 7.0,
                    "room_low": max(room_floor, 1.8),
                    "room_mid": 3.8,
                    "room_high": 6.5,
                    "amount_min": 8e7,
                    "amount_mid": 4e8,
                    "fs_low": 0.001,
                    "fs_mid": 0.0035,
                    "fs_high": 0.015,
                    "default_breakout_threshold": 0.60,
                }
            return {
                "gap_low": 6.2,
                "gap_mid": 8.2,
                "gap_high": 9.8,
                "vr_low": 1.2,
                "vr_mid": 3.0,
                "vr_high": 12.0,
                "room_low": max(room_floor, 1.5),
                "room_mid": 3.5,
                "room_high": 7.0,
                "amount_min": 3e7,
                "amount_mid": 1.5e8,
                "fs_low": 0.002,
                "fs_mid": 0.008,
                "fs_high": 0.03,
                "default_breakout_threshold": 0.62,
            }

        def weighted_score(components: dict[str, float], weights: dict[str, float]) -> float:
            return sum(float(components.get(k, 0.0) or 0.0) * float(weights.get(k, 0.0) or 0.0) for k in weights.keys())

        def calc_fbeta(tp: int, fp: int, fn: int, beta: float = 0.5) -> float:
            precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
            recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
            b2 = beta * beta
            denom = (b2 * precision + recall)
            if denom <= 0:
                return 0.0
            return (1.0 + b2) * precision * recall / denom

        async def load_rolling_tune_profile(db_conn, end_date: str, window_days: int) -> dict[str, Any]:
            default_breakout_weights = {
                "gap_score": 0.24,
                "vr_score": 0.18,
                "room_score": 0.13,
                "amount_score": 0.09,
                "fs_score": 0.08,
                "kline_momentum": 0.12,
                "fund_flow_hist": 0.08,
                "gap_vr_synergy": 0.04,
                "fund_room_synergy": 0.04,
            }
            default_heat_weights = {
                "volume_ratio_rank": 0.28,
                "gap_rank": 0.20,
                "fund_strength_rank": 0.16,
                "volume_density_rank": 0.10,
                "turnover_rank": 0.04,
                "kline_momentum_rank": 0.12,
                "fund_flow_hist_rank": 0.10,
            }
            default_profile: dict[str, Any] = {
                "breakout_weights": default_breakout_weights,
                "breakout_threshold": 0.62,
                "heat_weights": default_heat_weights,
                "market_regime": "neutral",
                "market_hit_rate": 0.0,
                "theme_alpha_multiplier": 1.0,
                "window_days_used": 0,
            }

            cache_key = f"{end_date}|{window_days}|{min_room_to_limit_pct:.2f}"
            cache = _SUPER_MAIN_FORCE_TUNE_CACHE.get(cache_key)
            if cache:
                ts, profile = cache
                if (datetime.now() - ts).total_seconds() <= _SUPER_MAIN_FORCE_TUNE_CACHE_TTL_SECONDS:
                    return profile

            cursor = await db_conn.execute(
                """
                SELECT DISTINCT DATE(snapshot_time) AS d
                FROM quote_history
                WHERE DATE(snapshot_time) < DATE(?)
                ORDER BY d DESC
                LIMIT ?
                """,
                (end_date, int(window_days)),
            )
            date_rows = await cursor.fetchall()
            trade_days = [str(r["d"]) for r in date_rows if r and r["d"]]
            if not trade_days:
                _SUPER_MAIN_FORCE_TUNE_CACHE[cache_key] = (datetime.now(), default_profile)
                return default_profile

            samples: list[dict[str, Any]] = []
            for d in trade_days:
                cursor = await db_conn.execute(
                    """
                    SELECT snapshot_time AS st
                    FROM quote_history
                    WHERE snapshot_time >= ? AND snapshot_time < ?
                    GROUP BY snapshot_time
                    ORDER BY snapshot_time DESC
                    LIMIT 1
                    """,
                    (f"{d} 09:20:00", f"{d} 09:31:00"),
                )
                st_row = await cursor.fetchone()
                snapshot_time = str(st_row["st"]) if st_row and st_row["st"] else ""
                if not snapshot_time:
                    cursor = await db_conn.execute(
                        """
                        SELECT snapshot_time AS st
                        FROM quote_history
                        WHERE DATE(snapshot_time) = DATE(?)
                        GROUP BY snapshot_time
                        ORDER BY snapshot_time DESC
                        LIMIT 1
                        """,
                        (d,),
                    )
                    st_row = await cursor.fetchone()
                    snapshot_time = str(st_row["st"]) if st_row and st_row["st"] else ""
                if not snapshot_time:
                    continue

                cursor = await db_conn.execute(
                    """
                    SELECT
                        q.stock_code,
                        q.pre_close,
                        q.open,
                        q.close AS quote_close,
                        q.vol,
                        q.amount,
                        COALESCE(db.turnover_rate, 0) AS turnover_rate,
                        COALESCE(db.volume_ratio, 0) AS volume_ratio,
                        COALESCE(db.float_share, 0) AS float_share,
                        db.close AS db_close,
                        k.close AS k_close,
                        COALESCE(s.name, '') AS stock_name
                    FROM quote_history q
                    LEFT JOIN daily_basic db
                      ON db.stock_code = q.stock_code
                     AND db.trade_date = ?
                    LEFT JOIN klines k
                      ON k.stock_code = q.stock_code
                     AND k.date = ?
                    LEFT JOIN stocks s
                      ON s.code = q.stock_code
                    WHERE q.snapshot_time = ?
                    """,
                    (d, d, snapshot_time),
                )
                rows = await cursor.fetchall()
                day_samples: list[dict[str, Any]] = []
                for row in rows:
                    stock_code = str(row["stock_code"] or "")
                    if not stock_code or stock_code.startswith("920"):
                        continue

                    stock_name = str(row["stock_name"] or "").upper()
                    if "ST" in stock_name:
                        continue

                    pre_close = float(row["pre_close"] or 0.0)
                    if pre_close <= 0:
                        continue

                    price = float(row["open"] or row["quote_close"] or 0.0)
                    vol = int(row["vol"] or 0)
                    amount = float(row["amount"] or 0.0)
                    if vol <= 0 and amount <= 0:
                        continue

                    close_price_raw = row["db_close"] if row["db_close"] is not None else row["k_close"]
                    if close_price_raw is None:
                        continue
                    close_price = float(close_price_raw or 0.0)
                    if close_price <= 0:
                        continue

                    volume_ratio = float(row["volume_ratio"] or 0.0)
                    turnover_rate = float(row["turnover_rate"] or 0.0)
                    float_share = float(row["float_share"] or 0.0)

                    gap_ratio = (price - pre_close) / pre_close if pre_close > 0 else 0.0
                    gap_percent = gap_ratio * 100.0
                    gap_ratio_processed = 0.0
                    if gap_ratio > 0:
                        gap_ratio_processed = 0.05 + (gap_ratio - 0.05) * 0.3 if gap_ratio > 0.05 else gap_ratio

                    volume_ratio_processed = math.log2(1.0 + min(volume_ratio, 20.0)) if volume_ratio > 0 else 0.0

                    denom_mv = float_share * price * 10000.0
                    fund_strength = 0.0
                    if denom_mv > 0 and amount > 0:
                        fund_strength = amount / denom_mv
                        if fund_strength > 0.1:
                            fund_strength = 0.1 + (fund_strength - 0.1) * 0.2

                    denom_vol = float_share * 10000.0
                    volume_density = (vol / denom_vol) if (denom_vol > 0 and vol > 0) else 0.0

                    limit_pct = infer_limit_pct(stock_code)
                    limit_price = round(pre_close * (1.0 + limit_pct / 100.0) + 1e-9, 2)
                    auction_limit_up = price > 0 and price >= (limit_price - 0.0001)
                    room_to_limit_pct = (limit_price - price) / pre_close * 100.0 if (pre_close > 0 and price > 0) else 0.0

                    bucket = resolve_bucket(limit_pct, denom_mv)
                    bp = get_bucket_params(bucket, min_room_to_limit_pct)
                    gap_score = score_tri(gap_percent, bp["gap_low"], bp["gap_mid"], bp["gap_high"])
                    vr_score = score_tri(min(volume_ratio, 20.0), bp["vr_low"], bp["vr_mid"], bp["vr_high"])
                    room_score = score_tri(room_to_limit_pct, bp["room_low"], bp["room_mid"], bp["room_high"])
                    amount_score = score_ramp(amount, bp["amount_min"], bp["amount_mid"])
                    fs_score = score_tri(fund_strength, bp["fs_low"], bp["fs_mid"], bp["fs_high"])

                    close_change_pct = (close_price - pre_close) / pre_close * 100.0
                    hit_label = close_change_pct >= limit_pct

                    day_samples.append(
                        {
                            "date": d,
                            "auction_limit_up": auction_limit_up,
                            "room_to_limit_pct": room_to_limit_pct,
                            "volume_ratio": volume_ratio,
                            "hit_label": hit_label,
                            "gap_score": gap_score,
                            "vr_score": vr_score,
                            "room_score": room_score,
                            "amount_score": amount_score,
                            "fs_score": fs_score,
                            "volume_ratio_processed": volume_ratio_processed,
                            "gap_ratio_processed": gap_ratio_processed,
                            "fund_strength": fund_strength,
                            "volume_density": volume_density,
                            "turnover_rate": turnover_rate,
                        }
                    )

                if day_samples:
                    for src_key, dst_key in (
                        ("volume_ratio_processed", "volume_ratio_rank"),
                        ("gap_ratio_processed", "gap_rank"),
                        ("fund_strength", "fund_strength_rank"),
                        ("volume_density", "volume_density_rank"),
                        ("turnover_rate", "turnover_rank"),
                    ):
                        ranks = compute_rank_scores([float(s.get(src_key) or 0.0) for s in day_samples])
                        for i, s in enumerate(day_samples):
                            s[dst_key] = float(ranks[i] if i < len(ranks) else 0.0)
                    samples.extend(day_samples)

            if not samples:
                _SUPER_MAIN_FORCE_TUNE_CACHE[cache_key] = (datetime.now(), default_profile)
                return default_profile

            train_samples = [s for s in samples if not bool(s.get("auction_limit_up"))]
            if len(train_samples) < 200:
                profile = dict(default_profile)
                profile["window_days_used"] = len(trade_days)
                _SUPER_MAIN_FORCE_TUNE_CACHE[cache_key] = (datetime.now(), profile)
                return profile

            pos = [s for s in train_samples if bool(s.get("hit_label"))]
            neg = [s for s in train_samples if not bool(s.get("hit_label"))]

            breakout_weights = dict(default_breakout_weights)
            if len(pos) >= 20 and len(neg) >= 20:
                raw = {}
                for k in default_breakout_weights.keys():
                    p_mean = sum(float(s.get(k) or 0.0) for s in pos) / len(pos)
                    n_mean = sum(float(s.get(k) or 0.0) for s in neg) / len(neg)
                    raw[k] = max(p_mean - n_mean, 0.001)
                tuned = normalize_weights(raw, default_breakout_weights)
                breakout_weights = blend_weights(default_breakout_weights, tuned, tuned_strength=0.45)

            eval_samples = [s for s in train_samples if float(s.get("room_to_limit_pct") or 0.0) >= min_room_to_limit_pct]
            breakout_threshold = 0.62
            if len(eval_samples) >= 200:
                best = {
                    "f": -1.0,
                    "precision": 0.0,
                    "recall": 0.0,
                    "threshold": 0.62,
                }
                for step in range(100):
                    threshold = 0.40 + step * 0.005
                    tp = fp = fn = 0
                    pred_pos = 0
                    for s in eval_samples:
                        components = {
                            "gap_score": float(s.get("gap_score") or 0.0),
                            "vr_score": float(s.get("vr_score") or 0.0),
                            "room_score": float(s.get("room_score") or 0.0),
                            "amount_score": float(s.get("amount_score") or 0.0),
                            "fs_score": float(s.get("fs_score") or 0.0),
                        }
                        prob = clamp01(weighted_score(components, breakout_weights))
                        vr = float(s.get("volume_ratio") or 0.0)
                        if vr >= 120:
                            prob *= 0.55
                        elif vr >= 50:
                            prob *= 0.70
                        pred = prob >= threshold
                        label = bool(s.get("hit_label"))
                        if pred:
                            pred_pos += 1
                            if label:
                                tp += 1
                            else:
                                fp += 1
                        elif label:
                            fn += 1
                    min_pred = max(8, int(len(eval_samples) * 0.004))
                    if pred_pos < min_pred:
                        continue
                    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
                    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
                    # P2-1: 精确率下界约束，低于8%直接跳过
                    if precision < 0.08:
                        continue
                    f = calc_fbeta(tp, fp, fn, beta=0.5)
                    if (
                        f > best["f"]
                        or (f == best["f"] and precision > best["precision"])
                        or (f == best["f"] and precision == best["precision"] and recall > best["recall"])
                    ):
                        best = {
                            "f": f,
                            "precision": precision,
                            "recall": recall,
                            "threshold": threshold,
                        }
                breakout_threshold = float(best["threshold"])

            heat_weights = dict(default_heat_weights)
            if len(pos) >= 20 and len(neg) >= 20:
                raw = {}
                for k in default_heat_weights.keys():
                    p_mean = sum(float(s.get(k) or 0.0) for s in pos) / len(pos)
                    n_mean = sum(float(s.get(k) or 0.0) for s in neg) / len(neg)
                    raw[k] = max(p_mean - n_mean, 0.001)
                tuned = normalize_weights(raw, default_heat_weights)
                heat_weights = blend_weights(default_heat_weights, tuned, tuned_strength=0.40)

            daily_stats: dict[str, tuple[int, int]] = {}
            for s in train_samples:
                d = str(s.get("date") or "")
                if not d:
                    continue
                hit = 1 if bool(s.get("hit_label")) else 0
                total, ok = daily_stats.get(d, (0, 0))
                daily_stats[d] = (total + 1, ok + hit)
            daily_hit_rates = [(ok / total) for total, ok in daily_stats.values() if total > 0]
            market_hit_rate = sum(daily_hit_rates) / len(daily_hit_rates) if daily_hit_rates else 0.0
            market_regime = "neutral"
            theme_alpha_multiplier = 1.0
            if market_hit_rate >= 0.16:
                market_regime = "hot"
                theme_alpha_multiplier = 1.35
            elif market_hit_rate >= 0.12:
                market_regime = "warm"
                theme_alpha_multiplier = 1.15
            elif market_hit_rate <= 0.06:
                market_regime = "cold"
                theme_alpha_multiplier = 0.65
            elif market_hit_rate <= 0.09:
                market_regime = "cool"
                theme_alpha_multiplier = 0.82

            profile = {
                "breakout_weights": breakout_weights,
                "breakout_threshold": breakout_threshold,
                "heat_weights": heat_weights,
                "market_regime": market_regime,
                "market_hit_rate": market_hit_rate,
                "theme_alpha_multiplier": theme_alpha_multiplier,
                "window_days_used": len(trade_days),
            }
            _SUPER_MAIN_FORCE_TUNE_CACHE[cache_key] = (datetime.now(), profile)
            return profile

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
            else:
                cursor = await db.execute(
                    """
                    SELECT MAX(DATE(snapshot_time)) AS d
                    FROM quote_history
                    WHERE DATE(snapshot_time) <= DATE(?)
                    """,
                    (target_date,),
                )
                row = await cursor.fetchone()
                if row and row["d"]:
                    target_date = str(row["d"])

            data_source = "quote_history"

            desired_snapshot_time = f"{target_date} 09:26:00"
            window_start = f"{target_date} 09:20:00"
            window_end = f"{target_date} 09:31:00"

            snapshot_time = desired_snapshot_time
            cursor = await db.execute(
                """
                SELECT snapshot_time AS st
                FROM quote_history
                WHERE snapshot_time >= ? AND snapshot_time < ?
                GROUP BY snapshot_time
                ORDER BY snapshot_time DESC
                LIMIT 1
                """,
                (window_start, window_end),
            )
            row = await cursor.fetchone()
            if row and row["st"]:
                snapshot_time = str(row["st"])
            else:
                cursor = await db.execute(
                    """
                    SELECT snapshot_time AS st
                    FROM quote_history
                    WHERE DATE(snapshot_time) = DATE(?)
                    GROUP BY snapshot_time
                    ORDER BY snapshot_time DESC
                    LIMIT 1
                    """,
                    (target_date,),
                )
                row = await cursor.fetchone()
                if row and row["st"]:
                    snapshot_time = str(row["st"])
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
            ths_industry_map: dict[str, str] = {}
            prev_kline_map: dict[str, list[dict]] = {}  # P0-1: 前5日K线
            fund_flow_hist_map: dict[str, dict] = {}    # P0-2: 资金流向历史

            trade_date_ret = target_date
            theme_date = trade_date_ret
            sort_mode_normalized = str(sort_mode or "heat").strip().lower()
            if sort_mode_normalized not in {"heat", "candidate_first"}:
                sort_mode_normalized = "heat"

            tune_profile = await load_rolling_tune_profile(
                db_conn=db,
                end_date=trade_date_ret,
                window_days=int(rolling_window_days),
            )
            breakout_weights = dict(tune_profile.get("breakout_weights") or {})
            tuned_breakout_threshold = float(tune_profile.get("breakout_threshold") or 0.62)
            heat_weights = dict(tune_profile.get("heat_weights") or {})
            market_regime = str(tune_profile.get("market_regime") or "neutral")
            market_hit_rate = float(tune_profile.get("market_hit_rate") or 0.0)
            theme_alpha_multiplier = float(tune_profile.get("theme_alpha_multiplier") or 1.0)
            effective_theme_alpha = float(theme_alpha)
            if dynamic_theme_alpha:
                effective_theme_alpha = max(0.0, min(0.5, effective_theme_alpha * theme_alpha_multiplier))

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

                trade_date_cutoff = trade_date_ret.replace("-", "")
                cursor = await db.execute(
                    f"""
                    SELECT
                        m.stock_code AS stock_code,
                        i.name AS industry_name
                    FROM ths_members m
                    JOIN ths_indices i
                      ON i.ts_code = m.ts_code
                    WHERE i.type = 'I'
                      AND m.stock_code IN ({placeholders})
                      AND (m.out_date IS NULL OR m.out_date = '' OR m.out_date >= ?)
                    ORDER BY
                      m.stock_code,
                      COALESCE(m.weight, 0) DESC,
                      COALESCE(m.in_date, '') DESC
                    """,
                    (*stock_codes, trade_date_cutoff),
                )
                ths_rows = await cursor.fetchall()
                for row in ths_rows:
                    code = str(row["stock_code"] or "")
                    if not code or code in ths_industry_map:
                        continue
                    ths_industry_map[code] = str(row["industry_name"] or "")

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
                    SELECT stock_code as stock, close as close_price
                    FROM daily_basic
                    WHERE trade_date = ?
                      AND close IS NOT NULL
                      AND close > 0
                      AND stock_code IN ({placeholders_ci})
                    """,
                    (trade_date_ret, *stock_codes),
                )
                ci_rows = await cursor.fetchall()
                for row in ci_rows:
                    stock = str(row["stock"] or "")
                    if not stock:
                        continue
                    if row["close_price"] is None:
                        continue
                    closing_info_map[stock] = {
                        "close_price": float(row["close_price"]),
                    }

                missing_codes = [c for c in stock_codes if c not in closing_info_map]
                if missing_codes:
                    placeholders_ci2 = ",".join(["?"] * len(missing_codes))
                    cursor = await db.execute(
                        f"""
                        SELECT stock_code as stock, close as close_price
                        FROM klines
                        WHERE date = ?
                          AND close IS NOT NULL
                          AND close > 0
                          AND stock_code IN ({placeholders_ci2})
                        """,
                        (trade_date_ret, *missing_codes),
                    )
                    ci_rows = await cursor.fetchall()
                    for row in ci_rows:
                        stock = str(row["stock"] or "")
                        if not stock:
                            continue
                        if row["close_price"] is None:
                            continue
                        closing_info_map[stock] = {
                            "close_price": float(row["close_price"]),
                        }

                # 盘中场景：当天的 daily_basic/klines 可能尚未落地，回退到实时行情 close/change_percent。
                missing_codes = [c for c in stock_codes if c not in closing_info_map]
                if missing_codes:
                    today_shanghai = datetime.now(ZoneInfo("Asia/Shanghai")).strftime("%Y-%m-%d")
                    if trade_date_ret == today_shanghai:
                        placeholders_ci3 = ",".join(["?"] * len(missing_codes))
                        cursor = await db.execute(
                            f"""
                            SELECT stock_code as stock, close as close_price, change_percent
                            FROM realtime_quotes
                            WHERE stock_code IN ({placeholders_ci3})
                              AND close IS NOT NULL
                              AND close > 0
                            """,
                            (*missing_codes,),
                        )
                        ci_rows = await cursor.fetchall()
                        for row in ci_rows:
                            stock = str(row["stock"] or "")
                            if not stock:
                                continue
                            if row["close_price"] is None:
                                continue
                            change_percent_val = None
                            if row["change_percent"] is not None:
                                try:
                                    change_percent_val = float(row["change_percent"])
                                except Exception:
                                    change_percent_val = None
                            closing_info_map[stock] = {
                                "close_price": float(row["close_price"]),
                                "change_percent": change_percent_val,
                            }

                # --- P0-1: 查询前5日K线数据 ---
                cursor = await db.execute(
                    f"""
                    SELECT stock_code, date, open, high, low, close, volume, amount
                    FROM klines
                    WHERE stock_code IN ({placeholders})
                      AND date < ?
                    ORDER BY stock_code, date DESC
                    """,
                    (*stock_codes, trade_date_ret),
                )
                kline_rows = await cursor.fetchall()
                _kline_counts: dict[str, int] = {}
                for row in kline_rows:
                    code = str(row["stock_code"] or "")
                    if not code:
                        continue
                    cnt = _kline_counts.get(code, 0)
                    if cnt >= 5:
                        continue
                    _kline_counts[code] = cnt + 1
                    lst = prev_kline_map.get(code)
                    if lst is None:
                        lst = []
                        prev_kline_map[code] = lst
                    lst.append({
                        "date": row["date"],
                        "open": float(row["open"] or 0),
                        "high": float(row["high"] or 0),
                        "low": float(row["low"] or 0),
                        "close": float(row["close"] or 0),
                        "volume": int(row["volume"] or 0),
                        "amount": float(row["amount"] or 0),
                    })

                # --- P0-2: 查询近5日主力资金流向 ---
                cursor = await db.execute(
                    f"""
                    SELECT stock_code,
                           SUM(main_fund_flow) as cum_main,
                           SUM(institutional_flow) as cum_inst,
                           COUNT(*) as flow_days,
                           SUM(CASE WHEN main_fund_flow > 0 THEN 1 ELSE 0 END) as pos_days,
                           AVG(COALESCE(large_order_ratio, 0)) as avg_large_order
                    FROM fund_flow
                    WHERE stock_code IN ({placeholders})
                      AND date >= DATE(?, '-7 days') AND date < ?
                    GROUP BY stock_code
                    """,
                    (*stock_codes, trade_date_ret, trade_date_ret),
                )
                ff_rows = await cursor.fetchall()
                for row in ff_rows:
                    code = str(row["stock_code"] or "")
                    if not code:
                        continue
                    flow_days = int(row["flow_days"] or 0)
                    fund_flow_hist_map[code] = {
                        "cum_main": float(row["cum_main"] or 0),
                        "cum_inst": float(row["cum_inst"] or 0),
                        "flow_days": flow_days,
                        "flow_consistency": float(row["pos_days"] or 0) / max(flow_days, 1),
                        "avg_large_order": float(row["avg_large_order"] or 0),
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
            industry_name = ths_industry_map.get(stock_code) or str(info.get("industry") or "")

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
            close_price_raw = closing_info.get("close_price")
            close_price = float(close_price_raw) if close_price_raw is not None else None
            change_percent_close = None
            if closing_info.get("change_percent") is not None:
                try:
                    change_percent_close = float(closing_info.get("change_percent"))
                except Exception:
                    change_percent_close = None
            if pre_close > 0 and close_price is not None and close_price > 0:
                # 优先使用 pre_close 重新计算，保证口径一致。
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

            limit_pct = infer_limit_pct(stock_code)

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

            # --- P0-1: 前日K线形态特征 ---
            prev_klines = prev_kline_map.get(stock_code, [])
            prev_limit_up = False
            consecutive_up_days = 0
            recent_volatility = 0.0
            prev_1d_change_pct = 0.0
            if prev_klines:
                # 前日涨跌幅
                pk0 = prev_klines[0]  # 最近一天
                if pk0["open"] > 0:
                    prev_1d_change_pct = (pk0["close"] - pk0["open"]) / pk0["open"] * 100.0
                # 前日是否涨停
                prev_limit_up = prev_1d_change_pct >= (limit_pct - 0.5)
                # 连续阳线天数
                for pk in prev_klines:
                    if pk["close"] > pk["open"]:
                        consecutive_up_days += 1
                    else:
                        break
                # 近5日振幅
                if len(prev_klines) >= 2:
                    highs = [pk["high"] for pk in prev_klines]
                    lows = [pk["low"] for pk in prev_klines]
                    base = prev_klines[-1]["close"]
                    if base > 0:
                        recent_volatility = (max(highs) - min(lows)) / base

            # P0-1 breakout 子分数
            prev_limit_up_score = 1.0 if prev_limit_up else 0.0
            consecutive_score = clamp01(score_ramp(float(consecutive_up_days), 0.5, 3.5))
            volatility_score = clamp01(score_ramp(recent_volatility, 0.03, 0.15))
            kline_momentum_score = (prev_limit_up_score * 0.50
                                    + consecutive_score * 0.30
                                    + volatility_score * 0.20)

            # --- P0-2: 主力资金历史特征 ---
            ff_hist = fund_flow_hist_map.get(stock_code, {})
            cum_main_flow = float(ff_hist.get("cum_main", 0))
            flow_consistency = float(ff_hist.get("flow_consistency", 0))
            avg_large_order = float(ff_hist.get("avg_large_order", 0))
            # 归一化: 累计主力净流入 / 流通市值
            main_flow_strength = 0.0
            if denom_mv > 0 and cum_main_flow > 0:
                main_flow_strength = min(cum_main_flow / denom_mv, 0.1)
            fund_flow_hist_score = (score_ramp(main_flow_strength, 0.0, 0.02) * 0.40
                                    + flow_consistency * 0.35
                                    + score_ramp(avg_large_order, 0.0, 0.3) * 0.25)

            bucket = resolve_bucket(limit_pct, denom_mv)
            bp = get_bucket_params(bucket, min_room_to_limit_pct)

            gap_score_breakout = score_tri(gap_percent, bp["gap_low"], bp["gap_mid"], bp["gap_high"])
            vr_score_breakout = score_tri(min(volume_ratio, 20.0), bp["vr_low"], bp["vr_mid"], bp["vr_high"])
            room_score_breakout = score_tri(room_to_limit_pct, bp["room_low"], bp["room_mid"], bp["room_high"])
            amount_score_breakout = score_ramp(amount, bp["amount_min"], bp["amount_mid"])
            fs_score_breakout = score_tri(fund_strength, bp["fs_low"], bp["fs_mid"], bp["fs_high"])

            # P2-3: 特征交互项
            gap_vr_synergy = gap_score_breakout * vr_score_breakout
            fund_room_synergy = fs_score_breakout * room_score_breakout

            breakout_components = {
                "gap_score": gap_score_breakout,
                "vr_score": vr_score_breakout,
                "room_score": room_score_breakout,
                "amount_score": amount_score_breakout,
                "fs_score": fs_score_breakout,
                "kline_momentum": kline_momentum_score,
                "fund_flow_hist": fund_flow_hist_score,
                "gap_vr_synergy": gap_vr_synergy,
                "fund_room_synergy": fund_room_synergy,
            }
            breakout_score = weighted_score(breakout_components, breakout_weights)

            # P2-2: 分桶渐进式量比惩罚
            if bucket == "20cm":
                _vr_pen_lo, _vr_pen_hi = 80.0, 150.0
            elif bucket == "10cm_large":
                _vr_pen_lo, _vr_pen_hi = 60.0, 120.0
            else:
                _vr_pen_lo, _vr_pen_hi = 50.0, 100.0
            if volume_ratio >= _vr_pen_hi:
                _pen_ratio = min((volume_ratio - _vr_pen_hi) / 100.0, 1.0)
                breakout_score *= 0.55 + 0.15 * (1.0 - _pen_ratio)
            elif volume_ratio >= _vr_pen_lo:
                _pen_ratio = (volume_ratio - _vr_pen_lo) / (_vr_pen_hi - _vr_pen_lo)
                breakout_score *= 1.0 - _pen_ratio * 0.30

            breakout_score = clamp01(breakout_score)
            bucket_breakout_threshold = clamp01(
                tuned_breakout_threshold + (float(bp["default_breakout_threshold"]) - 0.62) * 0.5
            )

            likely_limit_up_prob = breakout_score
            likely_limit_up = (
                (not auction_limit_up)
                and room_to_limit_pct >= min_room_to_limit_pct
                and likely_limit_up_prob >= bucket_breakout_threshold
                and gap_percent > 0
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
                theme_name = industry_name

            item = {
                "stock": stock_code,
                "tsCode": ts_code,
                "name": info.get("name") or "",
                "industry": industry_name,
                "price": round(price, 3),
                "preClose": round(pre_close, 3),
                "gapPercent": round(gap_percent, 2),
                "vol": vol,
                "amount": round(amount, 2),
                "turnoverRate": round(turnover_rate, 3),
                "volumeRatio": round(volume_ratio, 3),
                "floatShare": float_share,
                "pe": pe_value,
                "peTtm": pe_ttm_value,
                "likelyLimitUp": likely_limit_up,
                "likelyLimitUpProb": round(likely_limit_up_prob, 4),
                "auctionLimitUp": auction_limit_up,
                "breakoutScore": round(breakout_score, 4),
                "breakoutThreshold": round(bucket_breakout_threshold, 4),
                "themeHeatScore": round(theme_heat_score, 6),
                "themeCode": theme_code,
                "themeName": theme_name,
                "prevLimitUp": prev_limit_up,
                "consecutiveUpDays": consecutive_up_days,
                "klineMomentumScore": round(kline_momentum_score, 4),
                "fundFlowHistScore": round(fund_flow_hist_score, 4),
                "mainFlowStrength": round(main_flow_strength, 6),
                "flowConsistency": round(flow_consistency, 4),
                "_volumeRatioProcessed": volume_ratio_processed,
                "_gapProcessed": gap_ratio_processed,
                "_fundStrengthProcessed": fund_strength,
                "_volumeDensityProcessed": volume_density,
                "_klineMomentum": kline_momentum_score,
                "_fundFlowHist": fund_flow_hist_score,
            }
            if change_percent_close is not None:
                item["close"] = round(float(close_price or 0.0), 3)
                item["changePercent"] = round(float(change_percent_close), 2)
            pool.append(item)

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
        kline_momentum_scores = compute_rank_scores([float(i.get("_klineMomentum") or 0.0) for i in pool])
        fund_flow_hist_scores = compute_rank_scores([float(i.get("_fundFlowHist") or 0.0) for i in pool])

        items: list[dict] = []
        for idx, item in enumerate(pool):
            base_heat_score = (
                volume_ratio_scores[idx] * float(heat_weights.get("volume_ratio_rank", 0.28) or 0.28)
                + gap_scores[idx] * float(heat_weights.get("gap_rank", 0.20) or 0.20)
                + fund_strength_scores[idx] * float(heat_weights.get("fund_strength_rank", 0.16) or 0.16)
                + volume_density_scores[idx] * float(heat_weights.get("volume_density_rank", 0.10) or 0.10)
                + turnover_scores[idx] * float(heat_weights.get("turnover_rank", 0.04) or 0.04)
                + kline_momentum_scores[idx] * float(heat_weights.get("kline_momentum_rank", 0.12) or 0.12)
                + fund_flow_hist_scores[idx] * float(heat_weights.get("fund_flow_hist_rank", 0.10) or 0.10)
            ) * 100.0

            theme_heat = float(item.get("themeHeatScore") or 0.0)
            enhance_factor = 1.0 + effective_theme_alpha * theme_heat
            final_score = base_heat_score * enhance_factor

            item["baseHeatScore"] = round(base_heat_score, 2)
            item["themeAlpha"] = round(effective_theme_alpha, 4)
            item["themeEnhanceFactor"] = round(enhance_factor, 6)
            item["heatScore"] = round(final_score, 2)
            item.pop("_volumeRatioProcessed", None)
            item.pop("_gapProcessed", None)
            item.pop("_fundStrengthProcessed", None)
            item.pop("_volumeDensityProcessed", None)
            item.pop("_klineMomentum", None)
            item.pop("_fundFlowHist", None)

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

        if sort_mode_normalized == "candidate_first":
            items.sort(
                key=lambda x: (
                    1 if bool(x.get("likelyLimitUp")) else 0,
                    float(x.get("likelyLimitUpProb") or 0.0),
                    float(x.get("heatScore") or 0.0),
                ),
                reverse=True,
            )
        else:
            items.sort(key=lambda x: float(x.get("heatScore") or 0.0), reverse=True)
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
                    "limitUpCandidates": limit_up_candidates,
                    "sortMode": sort_mode_normalized,
                    "marketRegime": market_regime,
                    "marketHitRate": round(market_hit_rate, 4),
                    "themeAlphaInput": round(float(theme_alpha), 4),
                    "themeAlphaEffective": round(float(effective_theme_alpha), 4),
                    "rollingWindowDays": int(rolling_window_days),
                    "rollingWindowDaysUsed": int(tune_profile.get("window_days_used") or 0),
                    "candidateThreshold": round(float(tuned_breakout_threshold), 4),
                    "algorithmVersion": "super_main_force_v3",
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching auction super main force: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch auction super main force")
