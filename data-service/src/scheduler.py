"""
Scheduler module for automatic market data tasks.
"""

import asyncio
import os
import sys
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from dotenv import load_dotenv
from loguru import logger


sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

scheduler_tz = ZoneInfo(os.getenv("SCHEDULER_TZ", "Asia/Shanghai"))
scheduler = BackgroundScheduler(timezone=scheduler_tz)
_is_running = False


def is_trading_day() -> bool:
    today = datetime.now(scheduler_tz)
    return today.weekday() < 5


def _env_int(name: str, default: int, minimum: int = 0) -> int:
    raw = str(os.getenv(name, "")).strip()
    if not raw:
        return max(minimum, default)
    try:
        value = int(raw)
    except Exception:
        return max(minimum, default)
    return max(minimum, value)


async def collect_daily_data_task():
    try:
        if not is_trading_day():
            logger.info("Skip daily collection: non-trading day")
            return

        logger.info("Scheduled task triggered: daily full collection")

        try:
            from .routes.data_collection import batch_collect_7days_data
        except ImportError:
            from routes.data_collection import batch_collect_7days_data

        result = await batch_collect_7days_data()

        if result.get("success"):
            logger.info(f"Scheduled data collection success: {result.get('message')}")
            try:
                from .routes.market_insights import generate_market_insights_task
            except ImportError:
                from routes.market_insights import generate_market_insights_task
            insight_result = await generate_market_insights_task(force=True, publish_event=True)
            if insight_result.get("success"):
                logger.info("Daily market insights generated")
            else:
                logger.warning(f"Daily market insights skipped: {insight_result.get('message')}")
        else:
            logger.error(f"Scheduled data collection failed: {result.get('message')}")

    except Exception as e:
        logger.error(f"Daily scheduler execution failed: {e}")


async def run_market_insight_generation_task():
    try:
        if not is_trading_day():
            logger.info("Skip market insight generation: non-trading day")
            return

        try:
            from .routes.market_insights import generate_market_insights_task as generate_insights
        except ImportError:
            from routes.market_insights import generate_market_insights_task as generate_insights

        result = await generate_insights(force=False, publish_event=True)
        if result.get("success"):
            logger.info("Scheduled market insight generation finished")
        else:
            logger.warning(f"Scheduled market insight generation skipped: {result.get('message')}")
    except Exception as e:
        logger.error(f"Market insight scheduler execution failed: {e}")


async def collect_realtime_quotes_task():
    try:
        if not is_trading_day():
            logger.info("Skip realtime quotes collection: non-trading day")
            return

        try:
            from .routes.quotes import update_realtime_quotes_task
        except ImportError:
            from routes.quotes import update_realtime_quotes_task
        try:
            from .data_sources.akshare_client import AKShareClient
        except ImportError:
            from data_sources.akshare_client import AKShareClient

        akshare_client = AKShareClient()
        await update_realtime_quotes_task(akshare_client)

        try:
            from .utils.event_bus import publish_market_event
        except ImportError:
            from utils.event_bus import publish_market_event
        await publish_market_event("quotes_updated", {"source": "scheduler"})

        logger.info("Realtime quotes collection finished")
    except Exception as e:
        logger.error(f"Realtime quotes collection failed: {e}")


async def collect_auction_data_task():
    try:
        if not is_trading_day():
            logger.info("Skip auction collection: non-trading day")
            return

        try:
            from .routes.quotes import update_auction_from_tushare_task
        except ImportError:
            from routes.quotes import update_auction_from_tushare_task
        try:
            from .data_sources.tushare_client import TushareClient
        except ImportError:
            from data_sources.tushare_client import TushareClient

        tushare_client = TushareClient()
        max_attempts = _env_int("AUCTION_COLLECT_MAX_ATTEMPTS", 3, minimum=1)
        retry_interval_sec = _env_int("AUCTION_COLLECT_RETRY_INTERVAL_SEC", 120, minimum=10)

        inserted = 0
        for attempt in range(1, max_attempts + 1):
            inserted = int(await update_auction_from_tushare_task(tushare_client) or 0)
            if inserted > 0:
                break
            if attempt < max_attempts:
                logger.warning(
                    f"Auction collection inserted=0 on attempt {attempt}/{max_attempts}, retry in {retry_interval_sec}s"
                )
                await asyncio.sleep(retry_interval_sec)

        if inserted == 0:
            logger.warning(
                "Auction scheduler inserted=0. Possible reasons: no Tushare rows yet/token issue/rate limit."
            )
        logger.info("Auction data collection finished")
    except Exception as e:
        logger.error(f"Auction data collection failed: {e}")


async def _has_today_auction_snapshot() -> bool:
    try:
        try:
            from .utils.database import get_database
        except ImportError:
            from utils.database import get_database

        now = datetime.now(scheduler_tz)
        today = now.date()
        window_start = datetime.combine(today, time(9, 20, 0), tzinfo=scheduler_tz)
        window_end = datetime.combine(today, time(9, 31, 0), tzinfo=scheduler_tz)

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
    except Exception as e:
        logger.warning(f"Failed to check today's auction snapshot: {e}")
        return False


def auction_startup_catchup_wrapper():
    import asyncio

    try:
        now = datetime.now(scheduler_tz)
        if now.weekday() >= 5:
            return

        # If the service restarts after 09:26, catch up once in the same day.
        if now.time() < time(9, 26, 0):
            return

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            has_snapshot = loop.run_until_complete(_has_today_auction_snapshot())
            if not has_snapshot:
                logger.warning("No auction snapshot found for today after 09:26, running catch-up collection now")
                loop.run_until_complete(collect_auction_data_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Auction startup catch-up failed: {e}")


async def collect_daily_klines_task():
    try:
        if not is_trading_day():
            logger.info("Skip daily K-line collection: non-trading day")
            return

        logger.info("Scheduled task triggered: collect daily K-lines")
        today_sh = datetime.now(scheduler_tz).strftime("%Y-%m-%d")
        try:
            from .routes.data_collection import collect_trade_date_klines_data
        except ImportError:
            from routes.data_collection import collect_trade_date_klines_data

        result = await collect_trade_date_klines_data(today_sh)
        if result.get("success"):
            logger.info(
                f"Daily K-line collection finished: {result.get('stats', {}).get('trade_date')} "
                f"inserted={result.get('stats', {}).get('inserted', 0)}"
            )
        else:
            logger.warning(f"Daily K-line collection skipped/failed: {result.get('message')}")
    except Exception as e:
        logger.error(f"Daily K-line scheduler execution failed: {e}")


def schedule_sync_wrapper():
    import asyncio

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(collect_daily_data_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Scheduler wrapper failure: {e}")
        import traceback

        logger.error(traceback.format_exc())


def daily_kline_schedule_sync_wrapper():
    import asyncio

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(collect_daily_klines_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Daily K-line scheduler wrapper failure: {e}")
        import traceback

        logger.error(traceback.format_exc())


def realtime_schedule_sync_wrapper():
    import asyncio

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(collect_realtime_quotes_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Realtime scheduler wrapper failure: {e}")
        import traceback

        logger.error(traceback.format_exc())


def market_insight_schedule_sync_wrapper():
    import asyncio

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(run_market_insight_generation_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Market insight scheduler wrapper failure: {e}")
        import traceback

        logger.error(traceback.format_exc())


def auction_schedule_sync_wrapper():
    import asyncio

    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(collect_auction_data_task())
        finally:
            loop.close()
    except Exception as e:
        logger.error(f"Auction scheduler wrapper failure: {e}")
        import traceback

        logger.error(traceback.format_exc())


def start_scheduler():
    """Start scheduler jobs."""
    global _is_running

    if _is_running:
        logger.warning("Scheduler is already running")
        return

    try:
        scheduler.add_job(
            func=daily_kline_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=15,
                minute=10,
                second=0,
                day_of_week="mon-fri",
                timezone=scheduler_tz,
            ),
            id="daily_kline_collection",
            name="Daily K-line collection",
            replace_existing=True,
            misfire_grace_time=3600,
        )

        scheduler.add_job(
            func=realtime_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=9,
                minute="15-25",
                second="*/5",
                day_of_week="mon-fri",
                timezone=scheduler_tz,
            ),
            id="auction_realtime_quotes",
            name="Auction realtime quotes collection",
            replace_existing=True,
            misfire_grace_time=10,
        )

        scheduler.add_job(
            func=auction_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=9,
                minute=26,
                second=0,
                day_of_week="mon-fri",
                timezone=scheduler_tz,
            ),
            id="auction_stk_auction",
            name="Auction collection (Tushare)",
            replace_existing=True,
            misfire_grace_time=21600,
        )

        scheduler.add_job(
            func=market_insight_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=15,
                minute=40,
                day_of_week="mon-fri",
                timezone=scheduler_tz,
            ),
            id="daily_market_insight_generation",
            name="Daily market insight generation",
            replace_existing=True,
            misfire_grace_time=3600,
        )

        scheduler.start()
        _is_running = True

        logger.info("Scheduler started")
        logger.info("Auction collection time: 09:26 (Mon-Fri)")
        logger.info("Daily K-line collection time: 15:10 (Mon-Fri)")
        logger.info("Daily market insight generation time: 15:40 (Mon-Fri)")

        next_run = scheduler.get_job("daily_kline_collection").next_run_time
        if next_run:
            logger.info(f"Next run time: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")
        insight_next_run = scheduler.get_job("daily_market_insight_generation").next_run_time
        if insight_next_run:
            logger.info(f"Next insight generation time: {insight_next_run.strftime('%Y-%m-%d %H:%M:%S')}")

        auction_startup_catchup_wrapper()

    except Exception as e:
        logger.error(f"Failed to start scheduler: {e}")
        _is_running = False


def stop_scheduler():
    """Stop scheduler."""
    global _is_running

    if not _is_running:
        return

    try:
        scheduler.shutdown(wait=False)
        _is_running = False
        logger.info("Scheduler stopped")
    except Exception as e:
        logger.error(f"Failed to stop scheduler: {e}")


def get_scheduler_status():
    """Get scheduler status."""
    if not _is_running:
        return {
            "running": False,
            "next_run_time": None,
            "jobs": [],
        }

    try:
        jobs = []
        for job in scheduler.get_jobs():
            jobs.append(
                {
                    "id": job.id,
                    "name": job.name,
                    "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
                }
            )

        return {"running": True, "jobs": jobs}
    except Exception as e:
        logger.error(f"Failed to fetch scheduler status: {e}")
        return {"running": False, "error": str(e)}
