"""
定时任务调度器模块
自动在交易日收盘后采集股票数据
"""
import os
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger
from pathlib import Path
from dotenv import load_dotenv

# 添加项目根目录到sys.path,以便导入模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

env_path = Path(__file__).parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

scheduler_tz = ZoneInfo(os.getenv("SCHEDULER_TZ", "Asia/Shanghai"))
scheduler = BackgroundScheduler(timezone=scheduler_tz)
_is_running = False


def is_trading_day() -> bool:
    today = datetime.now(scheduler_tz)
    is_weekday = today.weekday() < 5
    return is_weekday


async def collect_daily_data_task():
    try:
        if not is_trading_day():
            logger.info("今天不是交易日,跳过数据采集")
            return

        logger.info("⏰ 定时任务触发: 开始采集每日股票数据")

        try:
            from .routes.data_collection import batch_collect_7days_data
        except ImportError:
            from routes.data_collection import batch_collect_7days_data

        result = await batch_collect_7days_data()

        if result.get("success"):
            logger.info(f"✅ 定时数据采集成功: {result.get('message')}")
        else:
            logger.error(f"❌ 定时数据采集失败: {result.get('message')}")

    except Exception as e:
        logger.error(f"❌ 定时任务执行错误: {e}")


async def collect_realtime_quotes_task():
    try:
        if not is_trading_day():
            logger.info("今天不是交易日,跳过实时行情采集")
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

        logger.info("集合竞价实时行情采集任务执行完成")
    except Exception as e:
        logger.error(f"实时行情采集任务执行错误: {e}")

async def collect_auction_data_task():
    try:
        if not is_trading_day():
            logger.info("今天不是交易日,跳过集合竞价采集")
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
        await update_auction_from_tushare_task(tushare_client)
        logger.info("集合竞价数据采集任务执行完成")
    except Exception as e:
        logger.error(f"集合竞价采集任务执行错误: {e}")


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
        logger.error(f"任务执行异常: {e}")
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
        logger.error(f"任务执行异常: {e}")
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
        logger.error(f"任务执行异常: {e}")
        import traceback
        logger.error(traceback.format_exc())


def start_scheduler():
    """
    启动定时任务调度器
    """
    global _is_running

    if _is_running:
        logger.warning("调度器已经在运行中")
        return

    try:
        scheduler.add_job(
            func=schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=15,
                minute=30,
                day_of_week='mon-fri',
                timezone=scheduler_tz
            ),
            id='daily_data_collection',
            name='每日股票数据采集',
            replace_existing=True,
            misfire_grace_time=3600
        )

        scheduler.add_job(
            func=realtime_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=9,
                minute='15-25',
                second='*/5',
                day_of_week='mon-fri',
                timezone=scheduler_tz
            ),
            id='auction_realtime_quotes',
            name='集合竞价实时行情采集',
            replace_existing=True,
            misfire_grace_time=10
        )
        scheduler.add_job(
            func=auction_schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=9,
                minute='26-29',
                second=0,
                day_of_week='mon-fri',
                timezone=scheduler_tz
            ),
            id='auction_stk_auction',
            name='集合竞价成交采集(Tushare)',
            replace_existing=True,
            misfire_grace_time=10
        )


        scheduler.start()
        _is_running = True

        logger.info("🚀 定时任务调度器已启动")
        logger.info("📅 采集时间: 每天15:30 (周一至周五)")

        # 显示下次执行时间
        next_run = scheduler.get_job('daily_data_collection').next_run_time
        if next_run:
            logger.info(f"⏰ 下次执行时间: {next_run.strftime('%Y-%m-%d %H:%M:%S')}")

    except Exception as e:
        logger.error(f"❌ 启动调度器失败: {e}")
        _is_running = False


def stop_scheduler():
    """
    停止定时任务调度器
    """
    global _is_running

    if not _is_running:
        return

    try:
        scheduler.shutdown(wait=False)
        _is_running = False
        logger.info("🛑 定时任务调度器已停止")
    except Exception as e:
        logger.error(f"❌ 停止调度器失败: {e}")


def get_scheduler_status():
    """
    获取调度器状态
    """
    if not _is_running:
        return {
            "running": False,
            "next_run_time": None,
            "jobs": []
        }

    try:
        jobs = []
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None
            })

        return {
            "running": True,
            "jobs": jobs
        }
    except Exception as e:
        logger.error(f"获取调度器状态失败: {e}")
        return {
            "running": False,
            "error": str(e)
        }
