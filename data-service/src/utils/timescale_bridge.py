from __future__ import annotations

import json
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import asyncpg
from loguru import logger

from .database import get_database

_pool: asyncpg.Pool | None = None
_schema_checked = False


def _is_enabled() -> bool:
    raw = (os.getenv("TIMESCALE_ENABLED") or "").strip().lower()
    if not raw:
        return bool(os.getenv("TIMESCALE_URL"))
    return raw in {"1", "true", "yes", "y", "on"}


def _as_jsonb(value) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        if not stripped:
            return None
        try:
            json.loads(stripped)
            return stripped
        except Exception:
            return json.dumps({"raw": stripped}, ensure_ascii=False)
    try:
        return json.dumps(value, ensure_ascii=False)
    except Exception:
        return None


def _as_text(value) -> str:
    if value is None:
        return ""
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


async def _get_pool() -> asyncpg.Pool | None:
    global _pool

    if not _is_enabled():
        return None

    if _pool is not None:
        return _pool

    dsn = os.getenv("TIMESCALE_URL")
    if not dsn:
        return None

    _pool = await asyncpg.create_pool(
        dsn=dsn,
        min_size=1,
        max_size=int(os.getenv("TIMESCALE_POOL_MAX", "6")),
        command_timeout=float(os.getenv("TIMESCALE_COMMAND_TIMEOUT", "30")),
    )
    return _pool


async def _ensure_schema(pool: asyncpg.Pool) -> None:
    global _schema_checked
    if _schema_checked:
        return

    statements = [
        """
        CREATE TABLE IF NOT EXISTS stock_dim (
            stock_code TEXT PRIMARY KEY,
            name TEXT,
            exchange TEXT,
            industry TEXT,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS kline_timeseries (
            stock_code TEXT NOT NULL,
            trade_date DATE NOT NULL,
            open DOUBLE PRECISION NOT NULL,
            high DOUBLE PRECISION NOT NULL,
            low DOUBLE PRECISION NOT NULL,
            close DOUBLE PRECISION NOT NULL,
            volume BIGINT NOT NULL,
            amount DOUBLE PRECISION NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (stock_code, trade_date)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS daily_basic_timeseries (
            stock_code TEXT NOT NULL,
            trade_date DATE NOT NULL,
            close DOUBLE PRECISION,
            turnover_rate DOUBLE PRECISION,
            turnover_rate_f DOUBLE PRECISION,
            volume_ratio DOUBLE PRECISION,
            pe DOUBLE PRECISION,
            pe_ttm DOUBLE PRECISION,
            pb DOUBLE PRECISION,
            ps DOUBLE PRECISION,
            ps_ttm DOUBLE PRECISION,
            dv_ratio DOUBLE PRECISION,
            dv_ttm DOUBLE PRECISION,
            total_share DOUBLE PRECISION,
            float_share DOUBLE PRECISION,
            free_share DOUBLE PRECISION,
            total_mv DOUBLE PRECISION,
            circ_mv DOUBLE PRECISION,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (stock_code, trade_date)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS signal_events (
            id BIGSERIAL PRIMARY KEY,
            stock_code TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            confidence DOUBLE PRECISION,
            price DOUBLE PRECISION,
            volume BIGINT,
            analysis_data JSONB,
            created_at TIMESTAMPTZ NOT NULL,
            UNIQUE (stock_code, signal_type, created_at)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS market_moneyflow_timeseries (
            trade_date DATE PRIMARY KEY,
            close_sh DOUBLE PRECISION,
            pct_change_sh DOUBLE PRECISION,
            close_sz DOUBLE PRECISION,
            pct_change_sz DOUBLE PRECISION,
            net_amount DOUBLE PRECISION,
            net_amount_rate DOUBLE PRECISION,
            buy_elg_amount DOUBLE PRECISION,
            buy_elg_amount_rate DOUBLE PRECISION,
            buy_lg_amount DOUBLE PRECISION,
            buy_lg_amount_rate DOUBLE PRECISION,
            buy_md_amount DOUBLE PRECISION,
            buy_md_amount_rate DOUBLE PRECISION,
            buy_sm_amount DOUBLE PRECISION,
            buy_sm_amount_rate DOUBLE PRECISION,
            updated_at TIMESTAMPTZ DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS sector_moneyflow_timeseries (
            trade_date DATE NOT NULL,
            name TEXT NOT NULL,
            ts_code TEXT,
            pct_change DOUBLE PRECISION,
            close DOUBLE PRECISION,
            net_amount DOUBLE PRECISION,
            net_amount_rate DOUBLE PRECISION,
            buy_elg_amount DOUBLE PRECISION,
            buy_elg_amount_rate DOUBLE PRECISION,
            buy_lg_amount DOUBLE PRECISION,
            buy_lg_amount_rate DOUBLE PRECISION,
            buy_md_amount DOUBLE PRECISION,
            buy_md_amount_rate DOUBLE PRECISION,
            buy_sm_amount DOUBLE PRECISION,
            buy_sm_amount_rate DOUBLE PRECISION,
            rank INTEGER,
            updated_at TIMESTAMPTZ DEFAULT NOW(),
            PRIMARY KEY (trade_date, name)
        )
        """,
    ]

    async with pool.acquire() as conn:
        try:
            await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
        except Exception as exc:
            logger.warning(f"Timescale extension check skipped: {exc}")

        for statement in statements:
            await conn.execute(statement)

        for hypertable in [
            ("kline_timeseries", "trade_date"),
            ("daily_basic_timeseries", "trade_date"),
            ("market_moneyflow_timeseries", "trade_date"),
            ("sector_moneyflow_timeseries", "trade_date"),
        ]:
            try:
                await conn.execute(
                    f"SELECT create_hypertable('{hypertable[0]}', '{hypertable[1]}', if_not_exists => TRUE)"
                )
            except Exception as exc:
                logger.warning(f"create_hypertable skipped for {hypertable[0]}: {exc}")

    _schema_checked = True


async def sync_recent_to_timescale(days: int = 14) -> dict:
    pool = await _get_pool()
    if pool is None:
        return {"enabled": False, "synced": False}

    await _ensure_schema(pool)

    days = max(1, min(int(days), 365))
    start_date = (datetime.now(ZoneInfo("Asia/Shanghai")).date() - timedelta(days=days)).isoformat()
    stats: dict[str, int | bool | str] = {
        "enabled": True,
        "synced": True,
        "startDate": start_date,
        "stocks": 0,
        "klines": 0,
        "dailyBasic": 0,
        "signals": 0,
        "marketFlow": 0,
        "sectorFlow": 0,
    }

    async with get_database() as db:
        stock_rows = await (await db.execute(
            "SELECT code, name, exchange, industry, updated_at FROM stocks"
        )).fetchall()
        kline_rows = await (await db.execute(
            """
            SELECT stock_code, date, open, high, low, close, volume, amount, created_at
            FROM klines
            WHERE date >= ?
            """,
            (start_date,),
        )).fetchall()
        daily_basic_rows = await (await db.execute(
            """
            SELECT stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                   pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                   total_share, float_share, free_share, total_mv, circ_mv, created_at
            FROM daily_basic
            WHERE trade_date >= ?
            """,
            (start_date,),
        )).fetchall()
        signal_rows = await (await db.execute(
            """
            SELECT stock_code, signal_type, confidence, price, volume, analysis_data, created_at
            FROM buy_signals
            WHERE date(created_at) >= date(?)
            """,
            (start_date,),
        )).fetchall()
        market_flow_rows = await (await db.execute(
            """
            SELECT trade_date, close_sh, pct_change_sh, close_sz, pct_change_sz,
                   net_amount, net_amount_rate, buy_elg_amount, buy_elg_amount_rate,
                   buy_lg_amount, buy_lg_amount_rate, buy_md_amount, buy_md_amount_rate,
                   buy_sm_amount, buy_sm_amount_rate, updated_at
            FROM market_moneyflow
            WHERE trade_date >= ?
            """,
            (start_date,),
        )).fetchall()
        sector_flow_rows = await (await db.execute(
            """
            SELECT trade_date, name, ts_code, pct_change, close, net_amount, net_amount_rate,
                   buy_elg_amount, buy_elg_amount_rate, buy_lg_amount, buy_lg_amount_rate,
                   buy_md_amount, buy_md_amount_rate, buy_sm_amount, buy_sm_amount_rate,
                   rank, updated_at
            FROM sector_moneyflow
            WHERE trade_date >= ?
            """,
            (start_date,),
        )).fetchall()

    batch_size = max(100, min(int(os.getenv("TIMESCALE_SYNC_BATCH_SIZE", "2000")), 20000))

    def _chunks(rows: list[tuple]):
        for idx in range(0, len(rows), batch_size):
            yield rows[idx: idx + batch_size]

    async with pool.acquire() as conn:
        if stock_rows:
            stock_payload = [
                (row["code"], row["name"], row["exchange"], row["industry"], _as_text(row["updated_at"]))
                for row in stock_rows
            ]
            for chunk in _chunks(stock_payload):
                await conn.executemany(
                    """
                    INSERT INTO stock_dim (stock_code, name, exchange, industry, updated_at)
                    VALUES ($1, $2, $3, $4, COALESCE(NULLIF($5::text, '')::timestamptz, NOW()))
                    ON CONFLICT (stock_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        exchange = EXCLUDED.exchange,
                        industry = EXCLUDED.industry,
                        updated_at = EXCLUDED.updated_at
                    """,
                    chunk,
                )
            stats["stocks"] = len(stock_rows)

        if kline_rows:
            kline_payload = [
                (
                    row["stock_code"], _as_text(row["date"]), row["open"], row["high"], row["low"], row["close"],
                    row["volume"], row["amount"], _as_text(row["created_at"])
                )
                for row in kline_rows
            ]
            for chunk in _chunks(kline_payload):
                await conn.executemany(
                    """
                    INSERT INTO kline_timeseries
                    (stock_code, trade_date, open, high, low, close, volume, amount, created_at)
                    VALUES ($1, NULLIF($2::text, '')::date, $3, $4, $5, $6, $7, $8, COALESCE(NULLIF($9::text, '')::timestamptz, NOW()))
                    ON CONFLICT (stock_code, trade_date) DO UPDATE
                    SET open = EXCLUDED.open,
                        high = EXCLUDED.high,
                        low = EXCLUDED.low,
                        close = EXCLUDED.close,
                        volume = EXCLUDED.volume,
                        amount = EXCLUDED.amount,
                        created_at = EXCLUDED.created_at
                    """,
                    chunk,
                )
            stats["klines"] = len(kline_rows)

        if daily_basic_rows:
            daily_basic_payload = [
                (
                    row["stock_code"], _as_text(row["trade_date"]), row["close"], row["turnover_rate"], row["turnover_rate_f"],
                    row["volume_ratio"], row["pe"], row["pe_ttm"], row["pb"], row["ps"], row["ps_ttm"],
                    row["dv_ratio"], row["dv_ttm"], row["total_share"], row["float_share"], row["free_share"],
                    row["total_mv"], row["circ_mv"], _as_text(row["created_at"])
                )
                for row in daily_basic_rows
            ]
            for chunk in _chunks(daily_basic_payload):
                await conn.executemany(
                    """
                    INSERT INTO daily_basic_timeseries
                    (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                     pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                     total_share, float_share, free_share, total_mv, circ_mv, created_at)
                    VALUES
                    ($1, NULLIF($2::text, '')::date, $3, $4, $5, $6,
                     $7, $8, $9, $10, $11, $12, $13,
                     $14, $15, $16, $17, $18, COALESCE(NULLIF($19::text, '')::timestamptz, NOW()))
                    ON CONFLICT (stock_code, trade_date) DO UPDATE
                    SET close = EXCLUDED.close,
                        turnover_rate = EXCLUDED.turnover_rate,
                        turnover_rate_f = EXCLUDED.turnover_rate_f,
                        volume_ratio = EXCLUDED.volume_ratio,
                        pe = EXCLUDED.pe,
                        pe_ttm = EXCLUDED.pe_ttm,
                        pb = EXCLUDED.pb,
                        ps = EXCLUDED.ps,
                        ps_ttm = EXCLUDED.ps_ttm,
                        dv_ratio = EXCLUDED.dv_ratio,
                        dv_ttm = EXCLUDED.dv_ttm,
                        total_share = EXCLUDED.total_share,
                        float_share = EXCLUDED.float_share,
                        free_share = EXCLUDED.free_share,
                        total_mv = EXCLUDED.total_mv,
                        circ_mv = EXCLUDED.circ_mv,
                        created_at = EXCLUDED.created_at
                    """,
                    chunk,
                )
            stats["dailyBasic"] = len(daily_basic_rows)

        if signal_rows:
            signal_payload = [
                (
                    row["stock_code"], row["signal_type"], row["confidence"], row["price"],
                    row["volume"], _as_jsonb(row["analysis_data"]), _as_text(row["created_at"])
                )
                for row in signal_rows
            ]
            for chunk in _chunks(signal_payload):
                await conn.executemany(
                    """
                    INSERT INTO signal_events
                    (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
                    VALUES
                    ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb), NULLIF($7::text, '')::timestamptz)
                    ON CONFLICT (stock_code, signal_type, created_at) DO UPDATE
                    SET confidence = EXCLUDED.confidence,
                        price = EXCLUDED.price,
                        volume = EXCLUDED.volume,
                        analysis_data = EXCLUDED.analysis_data
                    """,
                    chunk,
                )
            stats["signals"] = len(signal_rows)

        if market_flow_rows:
            market_flow_payload = [
                (
                    _as_text(row["trade_date"]), row["close_sh"], row["pct_change_sh"], row["close_sz"], row["pct_change_sz"],
                    row["net_amount"], row["net_amount_rate"], row["buy_elg_amount"], row["buy_elg_amount_rate"],
                    row["buy_lg_amount"], row["buy_lg_amount_rate"], row["buy_md_amount"], row["buy_md_amount_rate"],
                    row["buy_sm_amount"], row["buy_sm_amount_rate"], _as_text(row["updated_at"])
                )
                for row in market_flow_rows
            ]
            for chunk in _chunks(market_flow_payload):
                await conn.executemany(
                    """
                    INSERT INTO market_moneyflow_timeseries
                    (trade_date, close_sh, pct_change_sh, close_sz, pct_change_sz,
                     net_amount, net_amount_rate, buy_elg_amount, buy_elg_amount_rate,
                     buy_lg_amount, buy_lg_amount_rate, buy_md_amount, buy_md_amount_rate,
                     buy_sm_amount, buy_sm_amount_rate, updated_at)
                    VALUES
                    (NULLIF($1::text, '')::date, $2, $3, $4, $5,
                     $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                     COALESCE(NULLIF($16::text, '')::timestamptz, NOW()))
                    ON CONFLICT (trade_date) DO UPDATE
                    SET close_sh = EXCLUDED.close_sh,
                        pct_change_sh = EXCLUDED.pct_change_sh,
                        close_sz = EXCLUDED.close_sz,
                        pct_change_sz = EXCLUDED.pct_change_sz,
                        net_amount = EXCLUDED.net_amount,
                        net_amount_rate = EXCLUDED.net_amount_rate,
                        buy_elg_amount = EXCLUDED.buy_elg_amount,
                        buy_elg_amount_rate = EXCLUDED.buy_elg_amount_rate,
                        buy_lg_amount = EXCLUDED.buy_lg_amount,
                        buy_lg_amount_rate = EXCLUDED.buy_lg_amount_rate,
                        buy_md_amount = EXCLUDED.buy_md_amount,
                        buy_md_amount_rate = EXCLUDED.buy_md_amount_rate,
                        buy_sm_amount = EXCLUDED.buy_sm_amount,
                        buy_sm_amount_rate = EXCLUDED.buy_sm_amount_rate,
                        updated_at = EXCLUDED.updated_at
                    """,
                    chunk,
                )
            stats["marketFlow"] = len(market_flow_rows)

        if sector_flow_rows:
            sector_flow_payload = [
                (
                    _as_text(row["trade_date"]), row["name"], row["ts_code"], row["pct_change"], row["close"],
                    row["net_amount"], row["net_amount_rate"], row["buy_elg_amount"], row["buy_elg_amount_rate"],
                    row["buy_lg_amount"], row["buy_lg_amount_rate"], row["buy_md_amount"], row["buy_md_amount_rate"],
                    row["buy_sm_amount"], row["buy_sm_amount_rate"], row["rank"], _as_text(row["updated_at"])
                )
                for row in sector_flow_rows
            ]
            for chunk in _chunks(sector_flow_payload):
                await conn.executemany(
                    """
                    INSERT INTO sector_moneyflow_timeseries
                    (trade_date, name, ts_code, pct_change, close, net_amount, net_amount_rate,
                     buy_elg_amount, buy_elg_amount_rate, buy_lg_amount, buy_lg_amount_rate,
                     buy_md_amount, buy_md_amount_rate, buy_sm_amount, buy_sm_amount_rate,
                     rank, updated_at)
                    VALUES
                    (NULLIF($1::text, '')::date, $2, $3, $4, $5, $6, $7,
                     $8, $9, $10, $11, $12, $13, $14, $15,
                     $16, COALESCE(NULLIF($17::text, '')::timestamptz, NOW()))
                    ON CONFLICT (trade_date, name) DO UPDATE
                    SET ts_code = EXCLUDED.ts_code,
                        pct_change = EXCLUDED.pct_change,
                        close = EXCLUDED.close,
                        net_amount = EXCLUDED.net_amount,
                        net_amount_rate = EXCLUDED.net_amount_rate,
                        buy_elg_amount = EXCLUDED.buy_elg_amount,
                        buy_elg_amount_rate = EXCLUDED.buy_elg_amount_rate,
                        buy_lg_amount = EXCLUDED.buy_lg_amount,
                        buy_lg_amount_rate = EXCLUDED.buy_lg_amount_rate,
                        buy_md_amount = EXCLUDED.buy_md_amount,
                        buy_md_amount_rate = EXCLUDED.buy_md_amount_rate,
                        buy_sm_amount = EXCLUDED.buy_sm_amount,
                        buy_sm_amount_rate = EXCLUDED.buy_sm_amount_rate,
                        rank = EXCLUDED.rank,
                        updated_at = EXCLUDED.updated_at
                    """,
                    chunk,
                )
            stats["sectorFlow"] = len(sector_flow_rows)

    logger.info(f"Timescale sync completed: {stats}")
    return stats


async def close_timescale_bridge() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None
