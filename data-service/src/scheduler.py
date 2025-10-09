"""
定时任务调度器模块
自动在交易日收盘后采集股票数据
"""
import os
import sys
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from loguru import logger

# 添加项目根目录到sys.path,以便导入模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

scheduler = BackgroundScheduler()
_is_running = False


def is_trading_day() -> bool:
    """
    检查今天是否是交易日
    简单规则: 周一到周五(后续可接入交易日历API)
    """
    today = datetime.now()
    # 0=周一, 6=周日
    is_weekday = today.weekday() < 5

    # TODO: 后续可接入节假日API,如tushare的trade_cal接口
    # 现在简单判断为周末非交易日

    return is_weekday


async def collect_daily_data_task():
    """
    每日数据采集任务
    """
    try:
        if not is_trading_day():
            logger.info("今天不是交易日,跳过数据采集")
            return

        logger.info("⏰ 定时任务触发: 开始采集每日股票数据")

        # 导入数据采集函数
        from routes.data_collection import batch_collect_7days_data

        # 执行数据采集
        result = await batch_collect_7days_data()

        if result.get("success"):
            logger.info(f"✅ 定时数据采集成功: {result.get('message')}")
        else:
            logger.error(f"❌ 定时数据采集失败: {result.get('message')}")

    except Exception as e:
        logger.error(f"❌ 定时任务执行错误: {e}")


def schedule_sync_wrapper():
    """
    同步包装器,用于APScheduler调用异步函数
    在BackgroundScheduler的线程池中创建新的事件循环
    """
    import asyncio
    try:
        # 在线程池执行器中,需要创建新的事件循环
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


def start_scheduler():
    """
    启动定时任务调度器
    """
    global _is_running

    if _is_running:
        logger.warning("调度器已经在运行中")
        return

    try:
        # 配置定时任务: 每天15:30执行(A股收盘后)
        # 只在周一到周五执行
        scheduler.add_job(
            func=schedule_sync_wrapper,
            trigger=CronTrigger(
                hour=15,
                minute=30,
                day_of_week='mon-fri'  # 周一到周五
            ),
            id='daily_data_collection',
            name='每日股票数据采集',
            replace_existing=True,
            misfire_grace_time=3600  # 错过执行时间1小时内仍然执行
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
