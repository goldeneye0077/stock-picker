#!/usr/bin/env python3
"""
Auto collector for market data (Linux-friendly standalone scheduler).

Schedules (Asia/Shanghai):
1) 09:26 (Mon-Fri): collect today's auction data
2) 15:10 (Mon-Fri): collect today's all-stock K-line data
"""

from __future__ import annotations

import asyncio
import os
import signal
import sys
import time
from datetime import datetime, time as dtime
from pathlib import Path
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from loguru import logger


REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_SERVICE_ROOT = REPO_ROOT / "data-service"
DATA_SERVICE_SRC = DATA_SERVICE_ROOT / "src"

if str(DATA_SERVICE_ROOT) not in sys.path:
    sys.path.insert(0, str(DATA_SERVICE_ROOT))
if str(DATA_SERVICE_SRC) not in sys.path:
    sys.path.insert(0, str(DATA_SERVICE_SRC))

load_dotenv(DATA_SERVICE_ROOT / ".env")

from src.data_sources.tushare_client import TushareClient  # noqa: E402
from src.routes.data_collection import get_multi_source_manager  # noqa: E402
from src.routes.quotes import update_auction_from_tushare_task  # noqa: E402
from src.utils.database import get_database  # noqa: E402


SCHEDULER_TZ = ZoneInfo(os.getenv("SCHEDULER_TZ", "Asia/Shanghai"))


def is_trading_day(now: datetime | None = None) -> bool:
    current = now or datetime.now(SCHEDULER_TZ)
    return current.weekday() < 5


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return max(minimum, default)
    try:
        value = int(raw)
    except Exception:
        return max(minimum, default)
    return max(minimum, value)


def _to_float(value: object, default: float = 0.0) -> float:
    try:
        f = float(value)
        if f != f:  # NaN guard
            return default
        return f
    except Exception:
        return default


async def collect_today_auction_data() -> None:
    now = datetime.now(SCHEDULER_TZ)
    if not is_trading_day(now):
        logger.info("Skip auction collection: non-trading day")
        return

    trade_date = now.strftime("%Y-%m-%d")
    logger.info(f"[09:26 job] Start auction collection for {trade_date}")

    client = TushareClient()
    max_attempts = _env_int("AUCTION_COLLECT_MAX_ATTEMPTS", 3, minimum=1)
    retry_interval_sec = _env_int("AUCTION_COLLECT_RETRY_INTERVAL_SEC", 120, minimum=10)

    inserted = 0
    for attempt in range(1, max_attempts + 1):
        inserted = int(await update_auction_from_tushare_task(client, trade_date) or 0)
        if inserted > 0:
            break
        if attempt < max_attempts:
            logger.warning(
                f"[09:26 job] inserted=0 on attempt {attempt}/{max_attempts}, retry in {retry_interval_sec}s"
            )
            await asyncio.sleep(retry_interval_sec)

    logger.info(f"[09:26 job] Auction collection finished, inserted={inserted}")
    if inserted == 0:
        logger.warning(
            "[09:26 job] inserted=0. Usually means Tushare returned no rows/token issue/rate limit; "
            "run a manual force collect later."
        )


async def collect_today_all_klines() -> None:
    now = datetime.now(SCHEDULER_TZ)
    if not is_trading_day(now):
        logger.info("Skip daily kline collection: non-trading day")
        return

    trade_date_yyyymmdd = now.strftime("%Y%m%d")
    trade_date_ymd = now.strftime("%Y-%m-%d")
    logger.info(f"[15:10 job] Start K-line collection for {trade_date_yyyymmdd}")

    manager = get_multi_source_manager()
    if not manager.sources:
        logger.error("K-line collection aborted: no data source available")
        return

    df = await manager.get_with_fallback("get_daily_data_by_date", trade_date_yyyymmdd)
    if df is None or df.empty:
        logger.warning(f"K-line collection returned empty data for {trade_date_yyyymmdd}")
        return

    inserted = 0
    async with get_database() as db:
        for _, row in df.iterrows():
            ts_code = str(row.get("ts_code") or "").strip()
            if not ts_code:
                continue

            stock_code = ts_code.split(".")[0]
            trade_value = row.get("trade_date")
            if hasattr(trade_value, "strftime"):
                row_trade_date = trade_value.strftime("%Y-%m-%d")
            else:
                row_trade_date = trade_date_ymd

            await db.execute(
                """
                INSERT OR REPLACE INTO klines
                (stock_code, date, open, high, low, close, volume, amount, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """,
                (
                    stock_code,
                    row_trade_date,
                    _to_float(row.get("open")),
                    _to_float(row.get("high")),
                    _to_float(row.get("low")),
                    _to_float(row.get("close")),
                    int(_to_float(row.get("vol")) * 100),
                    _to_float(row.get("amount")) * 1000,
                ),
            )
            inserted += 1

        await db.commit()

    logger.info(f"[15:10 job] K-line collection finished, trade_date={trade_date_ymd}, inserted={inserted}")


async def has_today_auction_snapshot() -> bool:
    now = datetime.now(SCHEDULER_TZ)
    today = now.date()
    window_start = datetime.combine(today, dtime(9, 20, 0), tzinfo=SCHEDULER_TZ)
    window_end = datetime.combine(today, dtime(9, 31, 0), tzinfo=SCHEDULER_TZ)

    async with get_database() as db:
        cursor = await db.execute(
            """
            SELECT 1
            FROM quote_history
            WHERE snapshot_time >= ? AND snapshot_time < ?
            LIMIT 1
            """,
            (window_start, window_end),
        )
        row = await cursor.fetchone()
        return bool(row)


def _run_async_job(coro) -> None:
    loop = asyncio.new_event_loop()
    try:
        asyncio.set_event_loop(loop)
        loop.run_until_complete(coro)
    finally:
        loop.close()


def auction_job_wrapper() -> None:
    try:
        _run_async_job(collect_today_auction_data())
    except Exception as exc:
        logger.error(f"Auction scheduler wrapper failure: {exc}")


def kline_job_wrapper() -> None:
    try:
        _run_async_job(collect_today_all_klines())
    except Exception as exc:
        logger.error(f"K-line scheduler wrapper failure: {exc}")


def auction_startup_catchup_wrapper() -> None:
    try:
        now = datetime.now(SCHEDULER_TZ)
        if not is_trading_day(now):
            return
        if now.time() < dtime(9, 26, 0):
            return

        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            has_snapshot = loop.run_until_complete(has_today_auction_snapshot())
            if not has_snapshot:
                logger.warning("No auction snapshot found for today after 09:26, running catch-up now")
                loop.run_until_complete(collect_today_auction_data())
        finally:
            loop.close()
    except Exception as exc:
        logger.error(f"Auction startup catch-up failed: {exc}")


def main() -> None:
    scheduler = BackgroundScheduler(timezone=SCHEDULER_TZ)

    scheduler.add_job(
        func=auction_job_wrapper,
        trigger=CronTrigger(
            hour=9,
            minute=26,
            second=0,
            day_of_week="mon-fri",
            timezone=SCHEDULER_TZ,
        ),
        id="auction_collect_0926",
        name="Collect auction data at 09:26",
        replace_existing=True,
        misfire_grace_time=21600,
    )

    scheduler.add_job(
        func=kline_job_wrapper,
        trigger=CronTrigger(
            hour=15,
            minute=10,
            second=0,
            day_of_week="mon-fri",
            timezone=SCHEDULER_TZ,
        ),
        id="daily_kline_collect_1510",
        name="Collect all-stock daily K-lines at 15:10",
        replace_existing=True,
        misfire_grace_time=21600,
    )

    scheduler.start()
    logger.info("Market timed collector started")
    logger.info("Auction schedule: 09:26 (Mon-Fri, Asia/Shanghai)")
    logger.info("K-line schedule: 15:10 (Mon-Fri, Asia/Shanghai)")
    auction_startup_catchup_wrapper()

    should_exit = False

    def _handle_signal(signum, _frame):
        nonlocal should_exit
        logger.info(f"Received signal {signum}, shutting down...")
        should_exit = True

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        while not should_exit:
            time.sleep(1)
    finally:
        scheduler.shutdown(wait=False)
        logger.info("Market timed collector stopped")


if __name__ == "__main__":
    main()
