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
from datetime import datetime
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
from src.routes.quotes import create_mock_auction_from_daily, update_auction_from_tushare_task  # noqa: E402
from src.utils.database import get_database  # noqa: E402


SCHEDULER_TZ = ZoneInfo(os.getenv("SCHEDULER_TZ", "Asia/Shanghai"))


def is_trading_day(now: datetime | None = None) -> bool:
    current = now or datetime.now(SCHEDULER_TZ)
    return current.weekday() < 5


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
    inserted = await update_auction_from_tushare_task(client, trade_date)

    # In non-production env, fallback to mock auction snapshot if API returns no rows.
    if int(inserted or 0) == 0 and os.getenv("ENV", "").strip().lower() != "production":
        try:
            mock_result = await create_mock_auction_from_daily(trade_date)
            inserted = int((mock_result or {}).get("inserted") or 0)
            logger.info(f"Auction fallback(mock) inserted={inserted}")
        except Exception as exc:
            logger.warning(f"Auction fallback(mock) failed: {exc}")

    logger.info(f"[09:26 job] Auction collection finished, inserted={int(inserted or 0)}")


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
        misfire_grace_time=300,
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
        misfire_grace_time=900,
    )

    scheduler.start()
    logger.info("Market timed collector started")
    logger.info("Auction schedule: 09:26 (Mon-Fri, Asia/Shanghai)")
    logger.info("K-line schedule: 15:10 (Mon-Fri, Asia/Shanghai)")

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
