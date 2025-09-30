from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from ..data_sources.tushare_client import TushareClient
from ..utils.database import get_database

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/update-realtime")
async def update_realtime_quotes(
    request: Request,
    background_tasks: BackgroundTasks,
    ts_codes: Optional[List[str]] = None
):
    """批量更新实时行情数据"""
    tushare_client = request.app.state.tushare_client
    background_tasks.add_task(update_realtime_quotes_task, tushare_client, ts_codes)
    return {
        "status": "success",
        "message": "实时行情更新任务已启动",
        "task": "update_realtime_quotes"
    }


async def update_realtime_quotes_task(tushare_client: TushareClient, ts_codes: Optional[List[str]] = None):
    """更新实时行情的后台任务"""
    try:
        logger.info(f"开始更新实时行情，股票代码: {ts_codes if ts_codes else '全部'}")

        # 获取实时行情数据
        df = await tushare_client.get_realtime_quotes(ts_codes)
        if df is None or df.empty:
            logger.warning("未获取到实时行情数据")
            return

        logger.info(f"获取到 {len(df)} 条实时行情数据")

        async with get_database() as db:
            # 批量更新 realtime_quotes 表
            for _, row in df.iterrows():
                await db.execute('''
                    INSERT OR REPLACE INTO realtime_quotes (
                        stock_code, ts_code, name, pre_close, open, high, low,
                        close, vol, amount, num, ask_volume1, bid_volume1,
                        change_percent, change_amount, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    row['ts_code'].split('.')[0],  # 提取股票代码（去掉后缀）
                    row['ts_code'],
                    row.get('name', ''),
                    row.get('pre_close'),
                    row.get('open'),
                    row.get('high'),
                    row.get('low'),
                    row.get('close'),
                    row.get('vol'),
                    row.get('amount'),
                    row.get('num', 0),
                    row.get('ask_volume1', 0),
                    row.get('bid_volume1', 0),
                    row.get('change_percent'),
                    row.get('change_amount'),
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))

                # 同时插入到 quote_history 表
                await db.execute('''
                    INSERT INTO quote_history (
                        stock_code, ts_code, name, pre_close, open, high, low,
                        close, vol, amount, num, ask_volume1, bid_volume1,
                        change_percent, change_amount, snapshot_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    row['ts_code'].split('.')[0],
                    row['ts_code'],
                    row.get('name', ''),
                    row.get('pre_close'),
                    row.get('open'),
                    row.get('high'),
                    row.get('low'),
                    row.get('close'),
                    row.get('vol'),
                    row.get('amount'),
                    row.get('num', 0),
                    row.get('ask_volume1', 0),
                    row.get('bid_volume1', 0),
                    row.get('change_percent'),
                    row.get('change_amount'),
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))

            await db.commit()

        logger.info(f"实时行情更新完成，共更新 {len(df)} 条数据")

    except Exception as e:
        logger.error(f"更新实时行情失败: {str(e)}", exc_info=True)


@router.get("/{stock_code}/history")
async def get_quote_history(
    stock_code: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: int = 100
):
    """获取股票的历史行情快照"""
    try:
        async with get_database() as db:
            if start_time and end_time:
                cursor = await db.execute('''
                    SELECT * FROM quote_history
                    WHERE stock_code = ?
                    AND snapshot_time BETWEEN ? AND ?
                    ORDER BY snapshot_time DESC
                    LIMIT ?
                ''', (stock_code, start_time, end_time, limit))
            else:
                cursor = await db.execute('''
                    SELECT * FROM quote_history
                    WHERE stock_code = ?
                    ORDER BY snapshot_time DESC
                    LIMIT ?
                ''', (stock_code, limit))

            rows = await cursor.fetchall()
            columns = [description[0] for description in cursor.description]

            history = [dict(zip(columns, row)) for row in rows]

            return {
                "status": "success",
                "stock_code": stock_code,
                "count": len(history),
                "data": history
            }
    except Exception as e:
        logger.error(f"获取历史行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{stock_code}/intraday")
async def get_intraday_quotes(stock_code: str):
    """获取股票今日的分时行情"""
    try:
        today = datetime.now().strftime('%Y-%m-%d')
        start_time = f"{today} 00:00:00"
        end_time = f"{today} 23:59:59"

        async with get_database() as db:
            cursor = await db.execute('''
                SELECT * FROM quote_history
                WHERE stock_code = ?
                AND snapshot_time BETWEEN ? AND ?
                ORDER BY snapshot_time ASC
            ''', (stock_code, start_time, end_time))

            rows = await cursor.fetchall()
            columns = [description[0] for description in cursor.description]

            intraday = [dict(zip(columns, row)) for row in rows]

            return {
                "status": "success",
                "stock_code": stock_code,
                "date": today,
                "count": len(intraday),
                "data": intraday
            }
    except Exception as e:
        logger.error(f"获取分时行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{stock_code}/latest")
async def get_latest_quote(stock_code: str):
    """获取股票的最新实时行情"""
    try:
        async with get_database() as db:
            cursor = await db.execute('''
                SELECT * FROM realtime_quotes
                WHERE stock_code = ?
            ''', (stock_code,))

            row = await cursor.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="未找到该股票的实时行情")

            columns = [description[0] for description in cursor.description]
            quote = dict(zip(columns, row))

            return {
                "status": "success",
                "data": quote
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取最新行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))