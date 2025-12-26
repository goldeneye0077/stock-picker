from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Query
from typing import Optional, List
from datetime import datetime, timedelta
import logging

from ..data_sources.akshare_client import AKShareClient
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
    akshare_client = request.app.state.akshare_client
    background_tasks.add_task(update_realtime_quotes_task, akshare_client, ts_codes)
    return {
        "status": "success",
        "message": "实时行情更新任务已启动",
        "task": "update_realtime_quotes"
    }


async def update_realtime_quotes_task(akshare_client: AKShareClient, ts_codes: Optional[List[str]] = None):
    """更新实时行情的后台任务"""
    try:
        logger.info(f"开始更新实时行情，股票代码: {ts_codes if ts_codes else '全部'}")

        df = await akshare_client.get_realtime_quotes(ts_codes)
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

                await db.execute('''
                    INSERT INTO quote_history (
                        stock_code, pre_close, open, high, low,
                        close, vol, amount, num, change_percent, snapshot_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    row['ts_code'].split('.')[0],
                    row.get('pre_close'),
                    row.get('open'),
                    row.get('high'),
                    row.get('low'),
                    row.get('close'),
                    row.get('vol'),
                    row.get('amount'),
                    row.get('num', 0),
                    row.get('change_percent'),
                    datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                ))

            await db.commit()

        logger.info(f"实时行情更新完成，共更新 {len(df)} 条数据")

    except Exception as e:
        logger.error(f"更新实时行情失败: {str(e)}", exc_info=True)

@router.post("/update-auction")
async def update_auction_from_tushare(
    request: Request,
    background_tasks: BackgroundTasks,
    trade_date: Optional[str] = None,
    ts_codes: Optional[List[str]] = Query(None),
    sync: bool = Query(False),
    force: bool = Query(False)
):
    """采集当日集合竞价成交数据（数据源：Tushare stk_auction）"""
    tushare_client = request.app.state.tushare_client
    if sync:
        inserted = await update_auction_from_tushare_task(tushare_client, trade_date, ts_codes, force)
        return {
            "status": "success",
            "message": "集合竞价采集任务已完成",
            "task": "update_auction_from_tushare",
            "inserted": int(inserted or 0),
        }

    background_tasks.add_task(update_auction_from_tushare_task, tushare_client, trade_date, ts_codes, force)
    return {
        "status": "success",
        "message": "集合竞价采集任务已启动",
        "task": "update_auction_from_tushare"
    }

async def update_auction_from_tushare_task(
    tushare_client: TushareClient,
    trade_date: Optional[str] = None,
    ts_codes: Optional[List[str]] = None,
    force: bool = False
):
    """后台任务：调用 Tushare stk_auction 并保存到 quote_history 的 09:25 快照"""
    try:
        # 统一日期格式
        target_date_dt = None
        if trade_date:
            s = str(trade_date).strip()
            try:
                if len(s) >= 10 and "-" in s:
                    target_date_dt = datetime.strptime(s[:10], "%Y-%m-%d")
                elif len(s) == 8 and s.isdigit():
                    target_date_dt = datetime.strptime(s, "%Y%m%d")
            except Exception:
                target_date_dt = None
        if not target_date_dt:
            target_date_dt = datetime.now()
        target_date_str = target_date_dt.strftime("%Y-%m-%d")
        snapshot_time = f"{target_date_str} 09:26:00"

        # 拉取数据
        if ts_codes and len(ts_codes) > 0:
            frames = []
            for ts_code in ts_codes:
                df = await tushare_client.get_stk_auction(trade_date=target_date_str, ts_code=ts_code)
                if df is not None and not df.empty:
                    frames.append(df)
            import pandas as pd
            data_df = pd.concat(frames, ignore_index=True) if frames else None
        else:
            data_df = await tushare_client.get_stk_auction(trade_date=target_date_str)

        if data_df is None or data_df.empty:
            logger.info(f"未获取到 {target_date_str} 的集合竞价数据")
            return 0

        logger.info(f"获取到 {len(data_df)} 条集合竞价数据（{target_date_str}）")

        # 写入数据库
        async with get_database() as db:
            if force:
                delete_start = f"{target_date_str} 09:20:00"
                delete_end = f"{target_date_str} 09:30:00"
                await db.execute(
                    "DELETE FROM quote_history WHERE snapshot_time >= ? AND snapshot_time < ?",
                    (delete_start, delete_end),
                )
            else:
                await db.execute(
                    "DELETE FROM quote_history WHERE snapshot_time = ?",
                    (snapshot_time,),
                )
            inserted = 0
            for _, row in data_df.iterrows():
                ts_code = str(row.get("ts_code") or "")
                if not ts_code or "." not in ts_code:
                    continue
                stock_code = ts_code.split(".")[0]
                pre_close = float(row.get("pre_close") or 0.0)
                price = float(row.get("price") or 0.0)
                vol = int(row.get("vol") or 0)
                amount = float(row.get("amount") or 0.0)
                turnover_rate = float(row.get("turnover_rate") or 0.0)
                volume_ratio = float(row.get("volume_ratio") or 0.0)
                float_share = float(row.get("float_share") or 0.0)
                change_percent = 0.0
                if pre_close > 0 and price > 0:
                    change_percent = (price - pre_close) / pre_close * 100.0

                # 使用 price 作为 open；close 保留为 pre_close 以便后续使用
                await db.execute(
                    """
                    INSERT INTO quote_history (
                        stock_code, pre_close, open, high, low,
                        close, vol, amount, num, change_percent, snapshot_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stock_code,
                        pre_close,
                        price,
                        price,
                        price,
                        pre_close,
                        vol,
                        amount,
                        0,
                        change_percent,
                        snapshot_time,
                    ),
                )

                if turnover_rate > 0 or volume_ratio > 0 or float_share > 0:
                    await db.execute(
                        """
                        INSERT OR REPLACE INTO daily_basic (
                            stock_code, trade_date, turnover_rate, volume_ratio, float_share
                        ) VALUES (?, ?, ?, ?, ?)
                        """,
                        (
                            stock_code,
                            target_date_str,
                            turnover_rate,
                            volume_ratio,
                            float_share,
                        ),
                    )
                inserted += 1
            await db.commit()

        logger.info(f"集合竞价数据保存完成，插入 {inserted} 条记录（snapshot={snapshot_time}）")
        return inserted
    except Exception as e:
        logger.error(f"采集合竞价数据失败: {str(e)}", exc_info=True)
        return 0


@router.post("/mock-auction-from-daily")
async def create_mock_auction_from_daily(trade_date: Optional[str] = None):
    try:
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
                cursor = await db.execute("SELECT MAX(date) FROM klines")
                row = await cursor.fetchone()
                if not row or not row[0]:
                    return {
                        "status": "success",
                        "tradeDate": None,
                        "inserted": 0
                    }
                target_date = str(row[0])

            cursor = await db.execute(
                """
                SELECT stock_code, open, high, low, close, volume, amount
                FROM klines
                WHERE date = ?
                """,
                (target_date,),
            )
            rows = await cursor.fetchall()
            records = [dict(row) for row in rows]

            if not records:
                return {
                    "status": "success",
                    "tradeDate": target_date,
                    "inserted": 0
                }

            stock_codes = [str(r.get("stock_code") or "") for r in records if r.get("stock_code")]
            stock_codes = list({c for c in stock_codes if c})

            stock_info_map = {}
            pre_close_map = {}

            if stock_codes:
                placeholders = ",".join(["?"] * len(stock_codes))

                cursor = await db.execute(
                    f"SELECT code, name, exchange FROM stocks WHERE code IN ({placeholders})",
                    stock_codes
                )
                stock_rows = await cursor.fetchall()
                for row in stock_rows:
                    code = row["code"]
                    stock_info_map[code] = {
                        "name": row["name"],
                        "exchange": row["exchange"],
                    }

                cursor = await db.execute(
                    "SELECT MAX(date) FROM klines WHERE date < ?",
                    (target_date,),
                )
                prev_date_row = await cursor.fetchone()
                prev_date = prev_date_row[0] if prev_date_row and prev_date_row[0] else None

                if prev_date:
                    cursor = await db.execute(
                        f"SELECT stock_code, close FROM klines WHERE date = ? AND stock_code IN ({placeholders})",
                        (prev_date, *stock_codes),
                    )
                    krows = await cursor.fetchall()
                    pre_close_map = {
                        row["stock_code"]: float(row["close"] or 0.0)
                        for row in krows
                    }

            snapshot_time = f"{target_date} 09:26:00"
            inserted = 0

            for r in records:
                stock_code = str(r.get("stock_code") or "")
                if not stock_code:
                    continue

                info = stock_info_map.get(stock_code, {})

                open_price = float(r.get("open") or 0.0)
                high = float(r.get("high") or 0.0)
                low = float(r.get("low") or 0.0)
                close = float(r.get("close") or 0.0)
                vol = int(r.get("volume") or 0)
                amount = float(r.get("amount") or 0.0)

                pre_close = pre_close_map.get(stock_code, close)
                change_amount = close - pre_close
                change_percent = 0.0
                if pre_close > 0:
                    change_percent = (change_amount / pre_close) * 100.0

                exchange = info.get("exchange") or ""
                ts_code = stock_code
                if exchange:
                    ts_code = f"{stock_code}.{exchange}"

                await db.execute(
                    """
                    INSERT INTO quote_history (
                        stock_code, pre_close, open, high, low,
                        close, vol, amount, num, change_percent, snapshot_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        stock_code,
                        pre_close,
                        open_price,
                        high,
                        low,
                        close,
                        vol,
                        amount,
                        0,
                        change_percent,
                        snapshot_time,
                    ),
                )
                inserted += 1

            await db.commit()

            return {
                "status": "success",
                "tradeDate": target_date,
                "inserted": inserted
            }
    except Exception as e:
        logger.error(f"生成模拟集合竞价快照失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate mock auction snapshots")


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
