#!/usr/bin/env python3
"""
One-off migration utility:
    SQLite -> PostgreSQL/TimescaleDB

Usage:
    TIMESCALE_URL=postgresql://postgres:postgres@127.0.0.1:5432/stock_picker \
    SQLITE_DB_PATH=./data/stock_picker.db \
    python scripts/migrate/migrate_sqlite_to_timescale.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sqlite3
from pathlib import Path
from typing import Any

import asyncpg


def resolve_sqlite_path() -> Path:
    raw = os.getenv("SQLITE_DB_PATH")
    if raw:
        return Path(raw).expanduser().resolve()
    return (Path(__file__).resolve().parents[2] / "data" / "stock_picker.db").resolve()


def load_schema_sql() -> str:
    schema_path = Path(__file__).resolve().parent / "timescaledb_schema.sql"
    return schema_path.read_text(encoding="utf-8")


def as_jsonb(value: Any) -> str | None:
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


async def ensure_schema(conn: asyncpg.Connection) -> None:
    sql = load_schema_sql()
    # Split on semicolons conservatively.
    statements = [statement.strip() for statement in sql.split(";") if statement.strip()]
    for statement in statements:
        try:
            await conn.execute(statement)
        except Exception as exc:
            # Do not fail hard on Timescale specific calls in environments without extension.
            print(f"[schema] warning: {exc} :: {statement[:80]}...")


def fetch_rows(cursor: sqlite3.Cursor, query: str, batch_size: int):
    cursor.execute(query)
    while True:
        rows = cursor.fetchmany(batch_size)
        if not rows:
            break
        yield rows


async def migrate() -> None:
    timescale_url = os.getenv("TIMESCALE_URL")
    if not timescale_url:
        raise RuntimeError("TIMESCALE_URL is required")

    sqlite_path = resolve_sqlite_path()
    if not sqlite_path.exists():
        raise FileNotFoundError(f"SQLite DB not found: {sqlite_path}")

    batch_size = int(os.getenv("MIGRATION_BATCH_SIZE", "2000"))
    print(f"[migrate] sqlite={sqlite_path}")
    print(f"[migrate] batch_size={batch_size}")

    sqlite_conn = sqlite3.connect(str(sqlite_path))
    sqlite_conn.row_factory = sqlite3.Row
    sqlite_cursor = sqlite_conn.cursor()

    pg_conn = await asyncpg.connect(timescale_url)
    await ensure_schema(pg_conn)

    # stocks -> stock_dim
    migrated_stock_rows = 0
    for rows in fetch_rows(
        sqlite_cursor,
        "SELECT code, name, exchange, industry, updated_at FROM stocks ORDER BY code",
        batch_size,
    ):
        values = [
            (r["code"], r["name"], r["exchange"], r["industry"], r["updated_at"])
            for r in rows
            if r["code"]
        ]
        await pg_conn.executemany(
            """
            INSERT INTO stock_dim (stock_code, name, exchange, industry, updated_at)
            VALUES ($1, $2, $3, $4, COALESCE($5::timestamptz, NOW()))
            ON CONFLICT (stock_code) DO UPDATE
            SET name = EXCLUDED.name,
                exchange = EXCLUDED.exchange,
                industry = EXCLUDED.industry,
                updated_at = EXCLUDED.updated_at
            """,
            values,
        )
        migrated_stock_rows += len(values)
    print(f"[migrate] stock_dim rows={migrated_stock_rows}")

    # klines -> kline_timeseries
    migrated_klines = 0
    for rows in fetch_rows(
        sqlite_cursor,
        """
        SELECT stock_code, date, open, high, low, close, volume, amount, created_at
        FROM klines
        ORDER BY date, stock_code
        """,
        batch_size,
    ):
        values = [
            (
                r["stock_code"],
                r["date"],
                r["open"],
                r["high"],
                r["low"],
                r["close"],
                r["volume"],
                r["amount"],
                r["created_at"],
            )
            for r in rows
            if r["stock_code"] and r["date"]
        ]
        await pg_conn.executemany(
            """
            INSERT INTO kline_timeseries
            (stock_code, trade_date, open, high, low, close, volume, amount, created_at)
            VALUES ($1, $2::date, $3, $4, $5, $6, $7, $8, COALESCE($9::timestamptz, NOW()))
            ON CONFLICT (stock_code, trade_date) DO UPDATE
            SET open = EXCLUDED.open,
                high = EXCLUDED.high,
                low = EXCLUDED.low,
                close = EXCLUDED.close,
                volume = EXCLUDED.volume,
                amount = EXCLUDED.amount,
                created_at = EXCLUDED.created_at
            """,
            values,
        )
        migrated_klines += len(values)
    print(f"[migrate] kline_timeseries rows={migrated_klines}")

    # daily_basic -> daily_basic_timeseries
    migrated_daily_basic = 0
    for rows in fetch_rows(
        sqlite_cursor,
        """
        SELECT stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
               pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
               total_share, float_share, free_share, total_mv, circ_mv, created_at
        FROM daily_basic
        ORDER BY trade_date, stock_code
        """,
        batch_size,
    ):
        values = [
            (
                r["stock_code"],
                r["trade_date"],
                r["close"],
                r["turnover_rate"],
                r["turnover_rate_f"],
                r["volume_ratio"],
                r["pe"],
                r["pe_ttm"],
                r["pb"],
                r["ps"],
                r["ps_ttm"],
                r["dv_ratio"],
                r["dv_ttm"],
                r["total_share"],
                r["float_share"],
                r["free_share"],
                r["total_mv"],
                r["circ_mv"],
                r["created_at"],
            )
            for r in rows
            if r["stock_code"] and r["trade_date"]
        ]
        await pg_conn.executemany(
            """
            INSERT INTO daily_basic_timeseries
            (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
             pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
             total_share, float_share, free_share, total_mv, circ_mv, created_at)
            VALUES
            ($1, $2::date, $3, $4, $5, $6,
             $7, $8, $9, $10, $11, $12, $13,
             $14, $15, $16, $17, $18, COALESCE($19::timestamptz, NOW()))
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
            values,
        )
        migrated_daily_basic += len(values)
    print(f"[migrate] daily_basic_timeseries rows={migrated_daily_basic}")

    # buy_signals -> signal_events
    migrated_signals = 0
    for rows in fetch_rows(
        sqlite_cursor,
        """
        SELECT stock_code, signal_type, confidence, price, volume, analysis_data, created_at
        FROM buy_signals
        ORDER BY created_at, stock_code
        """,
        batch_size,
    ):
        values = [
            (
                r["stock_code"],
                r["signal_type"],
                r["confidence"],
                r["price"],
                r["volume"],
                as_jsonb(r["analysis_data"]),
                r["created_at"],
            )
            for r in rows
            if r["stock_code"] and r["created_at"]
        ]
        await pg_conn.executemany(
            """
            INSERT INTO signal_events
            (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6::jsonb, '{}'::jsonb), $7::timestamptz)
            ON CONFLICT (stock_code, signal_type, created_at) DO UPDATE
            SET confidence = EXCLUDED.confidence,
                price = EXCLUDED.price,
                volume = EXCLUDED.volume,
                analysis_data = EXCLUDED.analysis_data
            """,
            values,
        )
        migrated_signals += len(values)
    print(f"[migrate] signal_events rows={migrated_signals}")

    await pg_conn.close()
    sqlite_conn.close()
    print("[migrate] completed")


if __name__ == "__main__":
    asyncio.run(migrate())
