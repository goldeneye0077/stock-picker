from fastapi import APIRouter, HTTPException, BackgroundTasks, Request, Query
from typing import Optional, List, Dict, Any, Callable
from datetime import datetime, timedelta, date
from zoneinfo import ZoneInfo
import logging
import asyncio
import inspect
import uuid
import copy

from ..data_sources.akshare_client import AKShareClient
from ..data_sources.tushare_client import TushareClient
from ..utils.database import get_database

router = APIRouter()
logger = logging.getLogger(__name__)


def _now_sh_iso() -> str:
    return datetime.now(ZoneInfo("Asia/Shanghai")).isoformat()


def _new_backfill_status() -> Dict[str, Any]:
    return {
        "taskId": None,
        "status": "idle",  # idle | running | completed | failed
        "message": "No backfill task started",
        "startedAt": None,
        "updatedAt": _now_sh_iso(),
        "finishedAt": None,
        "range": None,
        "lookbackDays": None,
        "force": None,
        "progress": {
            "currentDay": 0,
            "totalDays": 0,
            "percent": 0,
            "currentTradeDate": None,
            "inserted": 0,
            "daysWithData": 0,
            "daysWithoutData": 0,
        },
        "result": None,
        "error": None,
    }


_auction_backfill_status: Dict[str, Any] = _new_backfill_status()
_auction_backfill_lock = asyncio.Lock()


async def _get_backfill_status_snapshot() -> Dict[str, Any]:
    async with _auction_backfill_lock:
        return copy.deepcopy(_auction_backfill_status)


async def _set_backfill_running(task_id: str, range_data: Dict[str, Any], lookback_days: int, force: bool) -> None:
    async with _auction_backfill_lock:
        _auction_backfill_status.clear()
        _auction_backfill_status.update(
            {
                "taskId": task_id,
                "status": "running",
                "message": "Backfill task started",
                "startedAt": _now_sh_iso(),
                "updatedAt": _now_sh_iso(),
                "finishedAt": None,
                "range": range_data,
                "lookbackDays": int(lookback_days),
                "force": bool(force),
                "progress": {
                    "currentDay": 0,
                    "totalDays": 0,
                    "percent": 0,
                    "currentTradeDate": None,
                    "inserted": 0,
                    "daysWithData": 0,
                    "daysWithoutData": 0,
                },
                "result": None,
                "error": None,
            }
        )


async def _update_backfill_progress(payload: Dict[str, Any]) -> None:
    async with _auction_backfill_lock:
        progress = _auction_backfill_status.get("progress") or {}
        progress.update(
            {
                "currentDay": int(payload.get("currentDay") or 0),
                "totalDays": int(payload.get("totalDays") or 0),
                "percent": int(payload.get("percent") or 0),
                "currentTradeDate": payload.get("currentTradeDate"),
                "inserted": int(payload.get("inserted") or 0),
                "daysWithData": int(payload.get("daysWithData") or 0),
                "daysWithoutData": int(payload.get("daysWithoutData") or 0),
            }
        )
        _auction_backfill_status["progress"] = progress
        _auction_backfill_status["message"] = payload.get(
            "message",
            f"Backfilling {progress.get('currentDay', 0)}/{progress.get('totalDays', 0)}",
        )
        _auction_backfill_status["updatedAt"] = _now_sh_iso()


async def _set_backfill_finished(status: str, message: str, result: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
    async with _auction_backfill_lock:
        _auction_backfill_status["status"] = status
        _auction_backfill_status["message"] = message
        _auction_backfill_status["result"] = result
        _auction_backfill_status["error"] = error
        now_iso = _now_sh_iso()
        _auction_backfill_status["updatedAt"] = now_iso
        _auction_backfill_status["finishedAt"] = now_iso

def _infer_ts_code(stock_code: str) -> str:
    code = str(stock_code or "").strip()
    if not code:
        return ""
    if "." in code:
        return code
    if code.startswith(("00", "30")):
        return f"{code}.SZ"
    return f"{code}.SH"

def _row_get(row: dict, key: str):
    for k, v in row.items():
        if str(k).lower() == key:
            return v
    return None


def _parse_trade_date(value: Optional[str]) -> Optional[date]:
    if not value:
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


async def backfill_auction_history_task(
    tushare_client: TushareClient,
    end_date_dt: date,
    lookback_days: int = 365,
    force: bool = True,
    progress_callback: Optional[Callable[[Dict[str, Any]], Any]] = None,
) -> dict:
    start_date_dt = end_date_dt - timedelta(days=max(1, int(lookback_days)))
    start_str = start_date_dt.strftime("%Y-%m-%d")
    end_str = end_date_dt.strftime("%Y-%m-%d")

    cal_df = await tushare_client.get_trade_cal(
        start_date=start_date_dt.strftime("%Y%m%d"),
        end_date=end_date_dt.strftime("%Y%m%d"),
    )
    if cal_df is None or cal_df.empty:
        logger.warning(f"No trade calendar for backfill range: {start_str} ~ {end_str}")
        return {
            "success": False,
            "startDate": start_str,
            "endDate": end_str,
            "tradingDays": 0,
            "daysWithData": 0,
            "daysWithoutData": 0,
            "inserted": 0,
        }

    trading_days: list[str] = []
    for _, row in cal_df.iterrows():
        try:
            is_open = int(row.get("is_open") or 0)
        except Exception:
            is_open = 0
        if is_open != 1:
            continue

        cal_date_val = row.get("cal_date")
        parsed_day: date | None = None
        if hasattr(cal_date_val, "to_pydatetime"):
            cal_date_val = cal_date_val.to_pydatetime()
        if isinstance(cal_date_val, datetime):
            parsed_day = cal_date_val.date()
        elif isinstance(cal_date_val, date):
            parsed_day = cal_date_val
        else:
            parsed_day = _parse_trade_date(str(cal_date_val))
        if parsed_day:
            trading_days.append(parsed_day.strftime("%Y-%m-%d"))

    trading_days = sorted(set(trading_days))
    if not trading_days:
        if progress_callback:
            progress_payload = {
                "currentDay": 0,
                "totalDays": 0,
                "percent": 100,
                "currentTradeDate": None,
                "inserted": 0,
                "daysWithData": 0,
                "daysWithoutData": 0,
                "message": "No trading days in selected range",
            }
            maybe_awaitable = progress_callback(progress_payload)
            if inspect.isawaitable(maybe_awaitable):
                await maybe_awaitable
        return {
            "success": True,
            "startDate": start_str,
            "endDate": end_str,
            "tradingDays": 0,
            "daysWithData": 0,
            "daysWithoutData": 0,
            "inserted": 0,
        }

    inserted_total = 0
    days_with_data = 0
    days_without_data = 0
    total_days = len(trading_days)
    logger.info(
        f"Start auction history backfill: {start_str} ~ {end_str}, days={total_days}, force={force}"
    )
    if progress_callback:
        start_payload = {
            "currentDay": 0,
            "totalDays": total_days,
            "percent": 0,
            "currentTradeDate": None,
            "inserted": 0,
            "daysWithData": 0,
            "daysWithoutData": 0,
            "message": f"Backfill started, {total_days} trading days",
        }
        maybe_awaitable = progress_callback(start_payload)
        if inspect.isawaitable(maybe_awaitable):
            await maybe_awaitable

    for idx, trade_day in enumerate(trading_days, start=1):
        inserted = await update_auction_from_tushare_task(
            tushare_client=tushare_client,
            trade_date=trade_day,
            force=force,
        )
        inserted_int = int(inserted or 0)
        inserted_total += inserted_int
        if inserted_int > 0:
            days_with_data += 1
        else:
            days_without_data += 1

        if progress_callback:
            percent = int((idx / total_days) * 100) if total_days > 0 else 100
            progress_payload = {
                "currentDay": idx,
                "totalDays": total_days,
                "percent": percent,
                "currentTradeDate": trade_day,
                "inserted": inserted_total,
                "daysWithData": days_with_data,
                "daysWithoutData": days_without_data,
                "message": f"Backfilling {idx}/{total_days} ({trade_day})",
            }
            maybe_awaitable = progress_callback(progress_payload)
            if inspect.isawaitable(maybe_awaitable):
                await maybe_awaitable

        if idx % 20 == 0 or idx == total_days:
            logger.info(
                f"Auction history backfill progress: {idx}/{total_days}, inserted={inserted_total}"
            )

    return {
        "success": True,
        "startDate": start_str,
        "endDate": end_str,
        "tradingDays": total_days,
        "daysWithData": days_with_data,
        "daysWithoutData": days_without_data,
        "inserted": inserted_total,
    }


@router.post("/update-realtime")
async def update_realtime_quotes(
    request: Request,
    background_tasks: BackgroundTasks,
    ts_codes: Optional[List[str]] = None,
):
    """批量更新实时行情数据"""
    akshare_client = request.app.state.akshare_client
    background_tasks.add_task(update_realtime_quotes_task, akshare_client, ts_codes)
    return {
        "status": "success",
        "message": "实时行情更新任务已启动",
        "task": "update_realtime_quotes",
    }


async def update_realtime_quotes_task(
    akshare_client: AKShareClient, ts_codes: Optional[List[str]] = None
):
    """更新实时行情的后台任务"""
    try:
        logger.info(f"开始更新实时行情，股票代码: {ts_codes if ts_codes else '全部'}")

        now_sh = datetime.now(ZoneInfo("Asia/Shanghai"))
        now_str = now_sh.strftime("%Y-%m-%d %H:%M:%S")

        df = await akshare_client.get_realtime_quotes(ts_codes)
        if df is None or df.empty:
            logger.warning("未获取到实时行情数据")
            return

        logger.info(f"获取到 {len(df)} 条实时行情数据")

        async with get_database() as db:
            # 批量更新 realtime_quotes 表
            for _, row in df.iterrows():
                await db.execute(
                    """
                    INSERT OR REPLACE INTO realtime_quotes (
                        stock_code, ts_code, name, pre_close, open, high, low,
                        close, vol, amount, num, ask_volume1, bid_volume1,
                        change_percent, change_amount, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        row["ts_code"].split(".")[0],  # 提取股票代码（去掉后缀）
                        row["ts_code"],
                        row.get("name", ""),
                        row.get("pre_close"),
                        row.get("open"),
                        row.get("high"),
                        row.get("low"),
                        row.get("close"),
                        row.get("vol"),
                        row.get("amount"),
                        row.get("num", 0),
                        row.get("ask_volume1", 0),
                        row.get("bid_volume1", 0),
                        row.get("change_percent"),
                        row.get("change_amount"),
                        now_str,
                    ),
                )

                await db.execute(
                    """
                    INSERT INTO quote_history (
                        stock_code, pre_close, open, high, low,
                        close, vol, amount, num, change_percent, snapshot_time
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        row["ts_code"].split(".")[0],
                        row.get("pre_close"),
                        row.get("open"),
                        row.get("high"),
                        row.get("low"),
                        row.get("close"),
                        row.get("vol"),
                        row.get("amount"),
                        row.get("num", 0),
                        row.get("change_percent"),
                        now_str,
                    ),
                )

            await db.commit()

        logger.info(f"实时行情更新完成，共更新 {len(df)} 条数据")

    except Exception as e:
        logger.error(f"更新实时行情失败: {str(e)}", exc_info=True)

@router.get("/realtime-quote")
async def get_realtime_quote(
    request: Request,
    ts_code: Optional[str] = None,
    stock_code: Optional[str] = None,
    src: str = "sina",
    force: bool = False,
    max_age_seconds: int = 1,
):
    tushare_client: TushareClient = request.app.state.tushare_client
    resolved = (ts_code or "").strip() or _infer_ts_code(stock_code or "")
    if not resolved:
        raise HTTPException(status_code=400, detail="ts_code or stock_code is required")

    resolved = resolved.replace(" ", "")
    simple_code = resolved.split(".")[0]

    now_sh = datetime.now(ZoneInfo("Asia/Shanghai"))
    if not force and max_age_seconds > 0:
        async with get_database() as db:
            cursor = await db.execute(
                "SELECT * FROM realtime_quotes WHERE stock_code = ? ORDER BY updated_at DESC LIMIT 1",
                (simple_code,),
            )
            row = await cursor.fetchone()
        if row:
            updated_at = str(row["updated_at"] or "")
            try:
                updated_dt = datetime.strptime(updated_at[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=ZoneInfo("Asia/Shanghai"))
            except Exception:
                updated_dt = None
            if updated_dt and (now_sh - updated_dt).total_seconds() <= max_age_seconds:
                return {"success": True, "data": {"quote": dict(row), "source": "db"}}

    df = await tushare_client.get_realtime_quote(resolved, src=src)
    if df is None or df.empty:
        raise HTTPException(status_code=503, detail="realtime quote unavailable")

    first = df.iloc[0].to_dict()
    name = _row_get(first, "name") or ""
    price = _row_get(first, "price")
    open_ = _row_get(first, "open")
    pre_close = _row_get(first, "pre_close")
    high = _row_get(first, "high")
    low = _row_get(first, "low")
    volume = _row_get(first, "volume")
    amount = _row_get(first, "amount")
    bid = _row_get(first, "bid")
    ask = _row_get(first, "ask")

    try:
        price_f = float(price) if price is not None else None
    except Exception:
        price_f = None
    try:
        pre_close_f = float(pre_close) if pre_close is not None else None
    except Exception:
        pre_close_f = None

    change_amount = (price_f - pre_close_f) if (price_f is not None and pre_close_f is not None) else None
    change_percent = (change_amount / pre_close_f * 100) if (change_amount is not None and pre_close_f) else None

    b1_v = _row_get(first, "b1_v")
    a1_v = _row_get(first, "a1_v")

    vol_i = None
    if volume is not None:
        try:
            vol_i = int(float(volume))
            if src == "dc":
                vol_i = vol_i * 100
        except Exception:
            vol_i = None

    amount_f = None
    if amount is not None:
        try:
            amount_f = float(amount)
        except Exception:
            amount_f = None

    now_str = now_sh.strftime("%Y-%m-%d %H:%M:%S")
    async with get_database() as db:
        await db.execute(
            """
            INSERT OR REPLACE INTO realtime_quotes (
                stock_code, ts_code, name, pre_close, open, high, low,
                close, vol, amount, num, ask_volume1, bid_volume1,
                change_percent, change_amount, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                simple_code,
                resolved,
                name,
                pre_close_f,
                float(open_) if open_ is not None else None,
                float(high) if high is not None else None,
                float(low) if low is not None else None,
                price_f,
                vol_i,
                amount_f,
                0,
                int(float(a1_v)) if a1_v is not None else 0,
                int(float(b1_v)) if b1_v is not None else 0,
                float(change_percent) if change_percent is not None else None,
                float(change_amount) if change_amount is not None else None,
                now_str,
            ),
        )
        await db.commit()

    return {
        "success": True,
        "data": {
            "quote": {
                "ts_code": resolved,
                "stock_code": simple_code,
                "name": name,
                "date": _row_get(first, "date"),
                "time": _row_get(first, "time"),
                "open": open_,
                "pre_close": pre_close,
                "price": price,
                "high": high,
                "low": low,
                "bid": bid,
                "ask": ask,
                "volume": volume,
                "amount": amount,
                "change_amount": change_amount,
                "change_percent": change_percent,
                "levels": {
                    "bids": [
                        {"p": _row_get(first, "b1_p"), "v": _row_get(first, "b1_v")},
                        {"p": _row_get(first, "b2_p"), "v": _row_get(first, "b2_v")},
                        {"p": _row_get(first, "b3_p"), "v": _row_get(first, "b3_v")},
                        {"p": _row_get(first, "b4_p"), "v": _row_get(first, "b4_v")},
                        {"p": _row_get(first, "b5_p"), "v": _row_get(first, "b5_v")},
                    ],
                    "asks": [
                        {"p": _row_get(first, "a1_p"), "v": _row_get(first, "a1_v")},
                        {"p": _row_get(first, "a2_p"), "v": _row_get(first, "a2_v")},
                        {"p": _row_get(first, "a3_p"), "v": _row_get(first, "a3_v")},
                        {"p": _row_get(first, "a4_p"), "v": _row_get(first, "a4_v")},
                        {"p": _row_get(first, "a5_p"), "v": _row_get(first, "a5_v")},
                    ],
                },
            },
            "source": "tushare",
        },
    }


@router.post("/update-auction")
async def update_auction_from_tushare(
    request: Request,
    background_tasks: BackgroundTasks,
    trade_date: Optional[str] = None,
    ts_codes: Optional[List[str]] = Query(None),
    sync: bool = Query(False),
    force: bool = Query(False),
):
    """采集当日集合竞价成交数据（数据源：Tushare stk_auction）"""
    tushare_client = request.app.state.tushare_client
    if sync:
        inserted = await update_auction_from_tushare_task(
            tushare_client, trade_date, ts_codes, force
        )
        return {
            "status": "success",
            "message": "集合竞价采集任务已完成",
            "task": "update_auction_from_tushare",
            "inserted": int(inserted or 0),
        }

    background_tasks.add_task(
        update_auction_from_tushare_task, tushare_client, trade_date, ts_codes, force
    )
    return {
        "status": "success",
        "message": "集合竞价采集任务已启动",
        "task": "update_auction_from_tushare",
    }


@router.get("/backfill-auction-year/status")
async def get_backfill_auction_year_status():
    status = await _get_backfill_status_snapshot()
    return {
        "success": True,
        "status": "success",
        "data": status,
    }


async def _run_backfill_auction_year_task(
    tushare_client: TushareClient,
    end_date_dt: date,
    lookback_days: int,
    force: bool,
):
    try:
        stats = await backfill_auction_history_task(
            tushare_client=tushare_client,
            end_date_dt=end_date_dt,
            lookback_days=lookback_days,
            force=force,
            progress_callback=_update_backfill_progress,
        )
        if stats.get("success", True):
            await _set_backfill_finished(
                status="completed",
                message="Backfill task completed",
                result=stats,
            )
        else:
            await _set_backfill_finished(
                status="completed",
                message="Backfill task completed with warnings",
                result=stats,
            )
    except Exception as exc:
        logger.error(f"Backfill auction year task failed: {exc}", exc_info=True)
        await _set_backfill_finished(
            status="failed",
            message="Backfill task failed",
            error=str(exc),
        )


@router.post("/backfill-auction-year")
async def backfill_auction_year(
    request: Request,
    background_tasks: BackgroundTasks,
    end_date: Optional[str] = Query(None),
    lookback_days: int = Query(365, ge=30, le=730),
    force: bool = Query(True),
    sync: bool = Query(False),
):
    """Backfill auction snapshots in the previous year (trading days only)."""
    tushare_client: TushareClient = request.app.state.tushare_client
    if not tushare_client or not tushare_client.is_available():
        raise HTTPException(status_code=503, detail="Tushare source unavailable")

    end_date_dt = _parse_trade_date(end_date)
    if not end_date_dt:
        end_date_dt = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    start_date_dt = end_date_dt - timedelta(days=max(1, int(lookback_days)))

    range_data = {
        "startDate": start_date_dt.strftime("%Y-%m-%d"),
        "endDate": end_date_dt.strftime("%Y-%m-%d"),
        "lookbackDays": int(lookback_days),
    }

    status_snapshot = await _get_backfill_status_snapshot()
    if status_snapshot.get("status") == "running":
        return {
            "success": True,
            "status": "running",
            "message": "Backfill task is already running",
            "task": "backfill_auction_year",
            "data": {
                "range": status_snapshot.get("range") or range_data,
                "job": status_snapshot,
            },
        }

    task_id = uuid.uuid4().hex
    await _set_backfill_running(task_id, range_data, lookback_days, force)

    if sync:
        await _run_backfill_auction_year_task(
            tushare_client=tushare_client,
            end_date_dt=end_date_dt,
            lookback_days=lookback_days,
            force=force,
        )
        final_status = await _get_backfill_status_snapshot()
        return {
            "success": True,
            "status": "success",
            "message": final_status.get("message") or "Backfill task completed",
            "task": "backfill_auction_year",
            "data": {
                "taskId": task_id,
                "range": range_data,
                "job": final_status,
                "stats": final_status.get("result"),
            },
        }

    background_tasks.add_task(
        _run_backfill_auction_year_task,
        tushare_client,
        end_date_dt,
        lookback_days,
        force,
    )
    return {
        "success": True,
        "status": "success",
        "message": "Backfill task started",
        "task": "backfill_auction_year",
        "data": {
            "taskId": task_id,
            "range": range_data,
            "job": await _get_backfill_status_snapshot(),
        },
    }

async def update_auction_from_tushare_task(
    tushare_client: TushareClient,
    trade_date: Optional[str] = None,
    ts_codes: Optional[List[str]] = None,
    force: bool = False,
):
    """后台任务：调用 Tushare stk_auction 并保存到 quote_history 的 09:25 快照"""
    try:
        # 统一日期格式
        target_date_dt = None
        if trade_date:
            s = str(trade_date).strip()
            try:
                if len(s) >= 10 and "-" in s:
                    target_date_dt = datetime.strptime(s[:10], "%Y-%m-%d").date()
                elif len(s) == 8 and s.isdigit():
                    target_date_dt = datetime.strptime(s, "%Y%m%d").date()
            except Exception:
                target_date_dt = None
        if not target_date_dt:
            target_date_dt = datetime.now(ZoneInfo("Asia/Shanghai")).date()
        target_date_str = target_date_dt.strftime("%Y-%m-%d")
        snapshot_time = f"{target_date_str} 09:26:00"

        # 拉取数据
        if ts_codes and len(ts_codes) > 0:
            frames = []
            for ts_code in ts_codes:
                df = await tushare_client.get_stk_auction(
                    trade_date=target_date_str, ts_code=ts_code
                )
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
                    # Do a partial upsert so auction refresh will not wipe existing
                    # valuation/close fields (pe, pe_ttm, close, etc.) in daily_basic.
                    await db.execute(
                        """
                        INSERT INTO daily_basic (
                            stock_code, trade_date, turnover_rate, volume_ratio, float_share
                        ) VALUES (?, ?, ?, ?, ?)
                        ON CONFLICT(stock_code, trade_date) DO UPDATE SET
                            turnover_rate = CASE
                                WHEN excluded.turnover_rate > 0 THEN excluded.turnover_rate
                                ELSE daily_basic.turnover_rate
                            END,
                            volume_ratio = CASE
                                WHEN excluded.volume_ratio > 0 THEN excluded.volume_ratio
                                ELSE daily_basic.volume_ratio
                            END,
                            float_share = CASE
                                WHEN excluded.float_share > 0 THEN excluded.float_share
                                ELSE daily_basic.float_share
                            END
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

        logger.info(
            f"集合竞价数据保存完成，插入 {inserted} 条记录（snapshot={snapshot_time}）"
        )
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
                    return {"status": "success", "tradeDate": None, "inserted": 0}
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
                return {"status": "success", "tradeDate": target_date, "inserted": 0}

            stock_codes = [
                str(r.get("stock_code") or "") for r in records if r.get("stock_code")
            ]
            stock_codes = list({c for c in stock_codes if c})

            stock_info_map = {}
            pre_close_map = {}

            if stock_codes:
                placeholders = ",".join(["?"] * len(stock_codes))

                cursor = await db.execute(
                    f"SELECT code, name, exchange FROM stocks WHERE code IN ({placeholders})",
                    stock_codes,
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
                prev_date = (
                    prev_date_row[0] if prev_date_row and prev_date_row[0] else None
                )

                if prev_date:
                    cursor = await db.execute(
                        f"SELECT stock_code, close FROM klines WHERE date = ? AND stock_code IN ({placeholders})",
                        (prev_date, *stock_codes),
                    )
                    krows = await cursor.fetchall()
                    pre_close_map = {
                        row["stock_code"]: float(row["close"] or 0.0) for row in krows
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

            return {"status": "success", "tradeDate": target_date, "inserted": inserted}
    except Exception as e:
        logger.error(f"生成模拟集合竞价快照失败: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500, detail="Failed to generate mock auction snapshots"
        )


@router.get("/{stock_code}/history")
async def get_quote_history(
    stock_code: str,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: int = 100,
):
    """获取股票的历史行情快照"""
    try:
        async with get_database() as db:
            if start_time and end_time:
                cursor = await db.execute(
                    """
                    SELECT * FROM quote_history
                    WHERE stock_code = ?
                    AND snapshot_time BETWEEN ? AND ?
                    ORDER BY snapshot_time DESC
                    LIMIT ?
                """,
                    (stock_code, start_time, end_time, limit),
                )
            else:
                cursor = await db.execute(
                    """
                    SELECT * FROM quote_history
                    WHERE stock_code = ?
                    ORDER BY snapshot_time DESC
                    LIMIT ?
                """,
                    (stock_code, limit),
                )

            rows = await cursor.fetchall()
            columns = [description[0] for description in cursor.description]

            history = [dict(zip(columns, row)) for row in rows]

            return {
                "status": "success",
                "stock_code": stock_code,
                "count": len(history),
                "data": history,
            }
    except Exception as e:
        logger.error(f"获取历史行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{stock_code}/intraday")
async def get_intraday_quotes(stock_code: str):
    """获取股票今日的分时行情"""
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        start_time = f"{today} 00:00:00"
        end_time = f"{today} 23:59:59"

        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT * FROM quote_history
                WHERE stock_code = ?
                AND snapshot_time BETWEEN ? AND ?
                ORDER BY snapshot_time ASC
            """,
                (stock_code, start_time, end_time),
            )

            rows = await cursor.fetchall()
            columns = [description[0] for description in cursor.description]

            intraday = [dict(zip(columns, row)) for row in rows]

            return {
                "status": "success",
                "stock_code": stock_code,
                "date": today,
                "count": len(intraday),
                "data": intraday,
            }
    except Exception as e:
        logger.error(f"获取分时行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{stock_code}/latest")
async def get_latest_quote(stock_code: str):
    """获取股票的最新实时行情"""
    try:
        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT * FROM realtime_quotes
                WHERE stock_code = ?
            """,
                (stock_code,),
            )

            row = await cursor.fetchone()

            if not row:
                raise HTTPException(status_code=404, detail="未找到该股票的实时行情")

            columns = [description[0] for description in cursor.description]
            quote = dict(zip(columns, row))

            return {"status": "success", "data": quote}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取最新行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/realtime")
async def get_realtime_quote(ts_code: str = Query(...)):
    """获取单只股票的实时行情（用于前端实时刷新）"""
    try:
        # 解析 ts_code 获取 stock_code
        if "." in ts_code:
            stock_code = ts_code.split(".")[0]
        else:
            stock_code = ts_code

        async with get_database() as db:
            cursor = await db.execute(
                """
                SELECT * FROM realtime_quotes
                WHERE stock_code = ?
            """,
                (stock_code,),
            )

            row = await cursor.fetchone()

            if not row:
                # 如果没有实时行情，尝试从 klines 获取
                cursor = await db.execute(
                    """
                    SELECT * FROM klines
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT 1
                """,
                    (stock_code,),
                )

                kline_row = await cursor.fetchone()

                if not kline_row:
                    raise HTTPException(
                        status_code=404, detail="未找到该股票的任何行情数据"
                    )

                kline_dict = dict(kline_row) if kline_row else {}

                return {
                    "status": "success",
                    "data": {
                        "stock_code": stock_code,
                        "ts_code": ts_code,
                        "close": kline_dict.get("close"),
                        "open": kline_dict.get("open"),
                        "high": kline_dict.get("high"),
                        "low": kline_dict.get("low"),
                        "pre_close": kline_dict.get("close"),
                        "change_percent": 0,
                        "change_amount": 0,
                        "volume": kline_dict.get("volume"),
                        "amount": kline_dict.get("amount"),
                        "updated_at": datetime.now(ZoneInfo("Asia/Shanghai")).strftime(
                            "%Y-%m-%d %H:%M:%S"
                        ),
                    },
                }

            quote_dict = dict(row) if row else {}

            return {"status": "success", "data": quote_dict}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取实时行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/realtime-batch")
async def get_realtime_quotes_batch(
    request: Request,
    ts_codes: List[str] = Query(...),
    src: str = "sina",
    force: bool = False,
    max_age_seconds: int = 30,
):
    """批量获取实时行情：优先读库，过期则拉取并写回库"""
    try:
        codes_in = [str(c or "").strip() for c in (ts_codes or []) if str(c or "").strip()]
        if not codes_in:
            raise HTTPException(status_code=400, detail="ts_codes is required")
        if len(codes_in) > 50:
            raise HTTPException(status_code=400, detail="Max 50 stocks per request")

        resolved_codes = [_infer_ts_code(c) for c in codes_in]
        resolved_codes = [c for c in resolved_codes if c]
        simple_codes = [c.split(".")[0] for c in resolved_codes]

        now_sh = datetime.now(ZoneInfo("Asia/Shanghai"))
        now_str = now_sh.strftime("%Y-%m-%d %H:%M:%S")

        existing_by_code: dict[str, dict] = {}
        stale_resolved: list[str] = []

        if not force and max_age_seconds > 0:
            placeholders = ",".join(["?"] * len(simple_codes))
            async with get_database() as db:
                cursor = await db.execute(
                    f"SELECT * FROM realtime_quotes WHERE stock_code IN ({placeholders})",
                    tuple(simple_codes),
                )
                rows = await cursor.fetchall()
            for row in rows:
                existing_by_code[str(row["stock_code"])] = dict(row)

            for resolved in resolved_codes:
                sc = resolved.split(".")[0]
                row = existing_by_code.get(sc)
                if not row:
                    stale_resolved.append(resolved)
                    continue
                updated_at = str(row.get("updated_at") or "")
                try:
                    updated_dt = datetime.strptime(updated_at[:19], "%Y-%m-%d %H:%M:%S").replace(
                        tzinfo=ZoneInfo("Asia/Shanghai")
                    )
                except Exception:
                    updated_dt = None
                if not updated_dt or (now_sh - updated_dt).total_seconds() > max_age_seconds:
                    stale_resolved.append(resolved)
        else:
            stale_resolved = list(resolved_codes)

        if stale_resolved:
            tushare_client: TushareClient = request.app.state.tushare_client
            df = await tushare_client.get_realtime_quotes(stale_resolved)
            if df is not None and not df.empty:
                cols = {str(c).lower(): c for c in df.columns}

                async with get_database() as db:
                    for _, r in df.iterrows():
                        ts_code = str(r.get(cols.get("ts_code")) or r.get("ts_code") or "").strip()
                        if not ts_code or "." not in ts_code:
                            continue
                        stock_code = ts_code.split(".")[0]
                        name = r.get(cols.get("name")) if cols.get("name") else r.get("name")
                        pre_close = r.get(cols.get("pre_close")) if cols.get("pre_close") else r.get("pre_close")
                        open_ = r.get(cols.get("open")) if cols.get("open") else r.get("open")
                        high = r.get(cols.get("high")) if cols.get("high") else r.get("high")
                        low = r.get(cols.get("low")) if cols.get("low") else r.get("low")
                        close = r.get(cols.get("close")) if cols.get("close") else r.get("close")
                        vol = r.get(cols.get("vol")) if cols.get("vol") else r.get("vol")
                        amount = r.get(cols.get("amount")) if cols.get("amount") else r.get("amount")
                        num = r.get(cols.get("num")) if cols.get("num") else r.get("num")
                        ask_volume1 = r.get(cols.get("ask_volume1")) if cols.get("ask_volume1") else r.get("ask_volume1")
                        bid_volume1 = r.get(cols.get("bid_volume1")) if cols.get("bid_volume1") else r.get("bid_volume1")
                        change_percent = r.get(cols.get("change_percent")) if cols.get("change_percent") else r.get("change_percent")
                        change_amount = r.get(cols.get("change_amount")) if cols.get("change_amount") else r.get("change_amount")

                        try:
                            close_f = float(close) if close is not None else None
                        except Exception:
                            close_f = None
                        try:
                            pre_close_f = float(pre_close) if pre_close is not None else None
                        except Exception:
                            pre_close_f = None
                        if change_amount is None and close_f is not None and pre_close_f is not None:
                            change_amount = close_f - pre_close_f
                        if change_percent is None and change_amount is not None and pre_close_f:
                            change_percent = float(change_amount) / pre_close_f * 100.0

                        await db.execute(
                            """
                            INSERT OR REPLACE INTO realtime_quotes (
                                stock_code, ts_code, name, pre_close, open, high, low,
                                close, vol, amount, num, ask_volume1, bid_volume1,
                                change_percent, change_amount, updated_at
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                stock_code,
                                ts_code,
                                str(name or ""),
                                pre_close_f,
                                float(open_) if open_ is not None else None,
                                float(high) if high is not None else None,
                                float(low) if low is not None else None,
                                close_f,
                                int(float(vol)) if vol is not None else None,
                                float(amount) if amount is not None else None,
                                int(float(num)) if num is not None else 0,
                                int(float(ask_volume1)) if ask_volume1 is not None else 0,
                                int(float(bid_volume1)) if bid_volume1 is not None else 0,
                                float(change_percent) if change_percent is not None else None,
                                float(change_amount) if change_amount is not None else None,
                                now_str,
                            ),
                        )
                    await db.commit()

        placeholders = ",".join(["?"] * len(simple_codes))
        async with get_database() as db:
            cursor = await db.execute(
                f"SELECT * FROM realtime_quotes WHERE stock_code IN ({placeholders})",
                tuple(simple_codes),
            )
            rows = await cursor.fetchall()

        by_code = {str(r["stock_code"]): dict(r) for r in rows}
        ordered = [by_code.get(sc) for sc in simple_codes if by_code.get(sc)]
        return {"status": "success", "data": ordered, "meta": {"src": src, "updated_at": now_str}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量获取实时行情失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

