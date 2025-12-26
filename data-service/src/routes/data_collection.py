from fastapi import APIRouter, HTTPException, BackgroundTasks
from pathlib import Path
from pydantic import BaseModel
from ..data_sources.tushare_client import TushareClient
from ..data_sources.akshare_client import AKShareClient
from ..data_sources.multi_source_manager import MultiSourceManager, ConsistencyMonitor
from ..utils.database import get_database
from loguru import logger
import pandas as pd
from datetime import datetime, timedelta
from .quotes import update_auction_from_tushare_task

router = APIRouter()

# 初始化多数据源管理器
multi_source_manager = None

def get_multi_source_manager():
    """获取多数据源管理器（单例模式）"""
    global multi_source_manager
    if multi_source_manager is None:
        multi_source_manager = MultiSourceManager()

        # 注册数据源
        tushare_client = TushareClient()
        if tushare_client.is_available():
            multi_source_manager.register_source(tushare_client)
            multi_source_manager.set_preferred_source("tushare")
            logger.info("Tushare数据源已注册")
        else:
            logger.warning("Tushare数据源不可用")

        akshare_client = AKShareClient()
        if akshare_client.is_available():
            multi_source_manager.register_source(akshare_client)
            logger.info("AKShare数据源已注册")
        else:
            logger.warning("AKShare数据源不可用")

        # 设置备用顺序
        multi_source_manager.set_fallback_order(["akshare"])

        logger.info("多数据源管理器初始化完成")

    return multi_source_manager


class RunScriptRequest(BaseModel):
    """运行脚本请求体"""
    script_name: str


async def batch_collect_7days_data(include_moneyflow: bool = True) -> dict:
    """
    批量采集7天数据的独立函数(供scheduler调用)

    Returns:
        dict: {"success": bool, "message": str, "stats": dict}
    """
    try:
        await batch_collect_7days_task(include_moneyflow)
        return {
            "success": True,
            "message": "数据采集成功",
            "stats": {}
        }
    except Exception as e:
        logger.error(f"数据采集失败: {e}")
        return {
            "success": False,
            "message": f"数据采集失败: {str(e)}"
        }


@router.post("/fetch-stocks")
async def fetch_stock_list(background_tasks: BackgroundTasks):
    """Fetch and update stock list from multi-source"""
    try:
        manager = get_multi_source_manager()

        # 检查是否有可用的数据源
        if not manager.sources:
            raise HTTPException(status_code=400, detail="No data source available")

        # Run in background
        background_tasks.add_task(fetch_stocks_task)

        return {
            "success": True,
            "message": "Stock list fetch started in background"
        }
    except Exception as e:
        logger.error(f"Error starting stock fetch: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def fetch_stocks_task():
    """Background task to fetch stocks"""
    try:
        manager = get_multi_source_manager()

        # 使用多数据源管理器获取股票列表
        df = await manager.get_with_fallback("get_stock_basic")

        if df is None or df.empty:
            logger.warning("No stock data received from any data source")
            return

        async with get_database() as db:
            for _, row in df.iterrows():
                # Convert ts_code (000001.SZ) to simple code (000001)
                code = row['ts_code'].split('.')[0]

                await db.execute("""
                    INSERT OR REPLACE INTO stocks
                    (code, name, exchange, industry, created_at, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (
                    code,
                    row['name'],
                    row['exchange'],
                    row.get('industry', '')
                ))

            await db.commit()
            logger.info(f"Successfully updated {len(df)} stocks")

    except Exception as e:
        logger.error(f"Error in fetch_stocks_task: {e}")

@router.post("/fetch-klines/{stock_code}")
async def fetch_stock_klines(stock_code: str, background_tasks: BackgroundTasks, days: int = 30):
    """Fetch K-line data for a specific stock"""
    try:
        manager = get_multi_source_manager()

        # 检查是否有可用的数据源
        if not manager.sources:
            raise HTTPException(status_code=400, detail="No data source available")

        # Add task to background
        background_tasks.add_task(fetch_klines_task, stock_code, days)

        return {
            "success": True,
            "message": f"K-line data fetch started for {stock_code}"
        }
    except Exception as e:
        logger.error(f"Error starting K-line fetch: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def fetch_klines_task(stock_code: str, days: int = 30):
    """Background task to fetch K-line data"""
    try:
        manager = get_multi_source_manager()

        # Convert code to ts_code format
        ts_code = f"{stock_code}.SZ" if stock_code.startswith('00') else f"{stock_code}.SH"

        # Calculate date range
        end_date = datetime.now().strftime('%Y%m%d')
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y%m%d')

        # 使用多数据源管理器获取日线数据
        df = await manager.get_with_fallback("get_daily_data", ts_code, start_date, end_date)

        if df is None or df.empty:
            logger.warning(f"No K-line data received for {stock_code}")
            return

        async with get_database() as db:
            for _, row in df.iterrows():
                await db.execute("""
                    INSERT OR REPLACE INTO klines
                    (stock_code, date, open, high, low, close, volume, amount, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    stock_code,
                    row['trade_date'].strftime('%Y-%m-%d'),
                    float(row['open']),
                    float(row['high']),
                    float(row['low']),
                    float(row['close']),
                    int(row['vol']),
                    float(row['amount'])
                ))

            await db.commit()
            logger.info(f"Successfully updated {len(df)} K-line records for {stock_code}")

    except Exception as e:
        logger.error(f"Error in fetch_klines_task: {e}")

@router.post("/analyze-volume/{stock_code}")
async def analyze_stock_volume(stock_code: str, background_tasks: BackgroundTasks):
    """Analyze volume for a specific stock"""
    try:
        background_tasks.add_task(analyze_volume_task, stock_code)

        return {
            "success": True,
            "message": f"Volume analysis started for {stock_code}"
        }
    except Exception as e:
        logger.error(f"Error starting volume analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))

async def analyze_volume_task(stock_code: str):
    """Background task to analyze volume"""
    try:
        async with get_database() as db:
            # Get recent K-line data
            cursor = await db.execute("""
                SELECT * FROM klines
                WHERE stock_code = ?
                ORDER BY date DESC
                LIMIT 30
            """, (stock_code,))

            rows = await cursor.fetchall()
            if not rows:
                logger.warning(f"No K-line data found for volume analysis: {stock_code}")
                return

            # Convert to DataFrame
            df = pd.DataFrame([dict(row) for row in rows])
            df = df.sort_values('date')

            # Calculate volume analysis
            if len(df) >= 20:
                df['avg_volume_20'] = df['volume'].rolling(window=20).mean()
                df['volume_ratio'] = df['volume'] / df['avg_volume_20']
                df['is_volume_surge'] = df['volume_ratio'] > 2.0

                # Save analysis results
                for _, row in df.iterrows():
                    if pd.notna(row['volume_ratio']):
                        await db.execute("""
                            INSERT OR REPLACE INTO volume_analysis
                            (stock_code, date, volume_ratio, avg_volume_20, is_volume_surge, analysis_result, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            row['date'],
                            float(row['volume_ratio']),
                            int(row['avg_volume_20']),
                            bool(row['is_volume_surge']),
                            f"量比{row['volume_ratio']:.2f}倍" + ("，异常放量" if row['is_volume_surge'] else "")
                        ))

                await db.commit()
                logger.info(f"Volume analysis completed for {stock_code}")

    except Exception as e:
        logger.error(f"Error in analyze_volume_task: {e}")

@router.post("/batch-collect-7days")
async def batch_collect_7days(background_tasks: BackgroundTasks, include_moneyflow: bool = True):
    """
    批量采集最近 7 天 A 股全量数据

    采用批量接口，大幅减少 API 调用次数（约 15 次）

    Args:
        include_moneyflow: 是否包含资金流向数据
    """
    try:
        manager = get_multi_source_manager()

        # 检查是否有可用的数据源
        if not manager.sources:
            raise HTTPException(status_code=400, detail="No data source available")

        # 添加后台任务
        background_tasks.add_task(batch_collect_7days_task, include_moneyflow)

        return {
            "success": True,
            "message": "7 天批量数据采集任务已启动，将在后台执行"
        }
    except Exception as e:
        logger.error(f"Error starting batch collection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def batch_collect_7days_task(include_moneyflow: bool = True):
    """批量采集 7 天数据的后台任务"""
    import time as time_module
    history_id = None
    try:
        logger.info("开始批量采集最近 7 天 A 股数据...")
        start_time = time_module.time()

        manager = get_multi_source_manager()

        # 1. 获取交易日历
        end_date = datetime.now()
        start_date = end_date - timedelta(days=14)  # 取 14 天确保覆盖 7 个交易日

        # 使用多数据源管理器获取交易日历
        cal_df = await manager.get_with_fallback("get_trade_cal",
            start_date.strftime('%Y%m%d'),
            end_date.strftime('%Y%m%d')
        )

        if cal_df is None or cal_df.empty:
            logger.warning("无法获取交易日历，使用最近 7 个自然日")
            trading_days = [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(7)]
        else:
            trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
            trading_days = [d.strftime('%Y%m%d') for d in sorted(trading_days, reverse=True)][:7]

        logger.info(f"将采集以下交易日数据: {', '.join(trading_days)}")

        start_date_str = (trading_days[-1][:4] + '-' + trading_days[-1][4:6] + '-' + trading_days[-1][6:8]) if trading_days else None
        end_date_str = (trading_days[0][:4] + '-' + trading_days[0][4:6] + '-' + trading_days[0][6:8]) if trading_days else None
        try:
            async with get_database() as db:
                cursor = await db.execute("""
                    INSERT INTO collection_history
                    (collection_type, start_date, end_date, status, created_at, updated_at)
                    VALUES ('full', ?, ?, 'running', datetime('now'), datetime('now'))
                """, (start_date_str or '', end_date_str or ''))
                await db.commit()
                history_id = cursor.lastrowid
        except Exception as e:
            logger.error(f"记录采集历史失败: {e}")

        # 2. 下载股票基本信息
        logger.info("下载股票基本信息...")
        stocks_df = await manager.get_with_fallback("get_stock_basic")
        if stocks_df is not None and not stocks_df.empty:
            async with get_database() as db:
                for _, row in stocks_df.iterrows():
                    code = row['ts_code'].split('.')[0]
                    await db.execute("""
                        INSERT OR REPLACE INTO stocks
                        (code, name, exchange, industry, created_at, updated_at)
                        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                    """, (code, row['name'], row['exchange'], row.get('industry', '')))
                await db.commit()
            logger.info(f"股票基本信息更新完成: {len(stocks_df)} 只")

        time_module.sleep(0.5)  # API 限流

        # 3. 批量下载日线数据
        logger.info("开始批量下载日线数据...")
        total_klines = 0
        for i, trade_date in enumerate(trading_days, 1):
            logger.info(f"[{i}/{len(trading_days)}] 下载 {trade_date} 日线数据...")

            df = await manager.get_with_fallback("get_daily_data_by_date", trade_date)
            if df is not None and not df.empty:
                async with get_database() as db:
                    for _, row in df.iterrows():
                        stock_code = row['ts_code'].split('.')[0]
                        await db.execute("""
                            INSERT OR REPLACE INTO klines
                            (stock_code, date, open, high, low, close, volume, amount, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            row['trade_date'].strftime('%Y-%m-%d'),
                            float(row['open']),
                            float(row['high']),
                            float(row['low']),
                            float(row['close']),
                            int(row['vol'] * 100),
                            float(row['amount'] * 1000)
                        ))
                    await db.commit()
                total_klines += len(df)
                logger.info(f"  成功插入 {len(df)} 条K线数据")

            time_module.sleep(0.5)  # API 限流

        # 4. 批量下载资金流向数据（可选，使用 DC 接口 - 东方财富数据）
        total_flows = 0
        if include_moneyflow:
            logger.info("开始批量下载资金流向数据（DC接口 - 东方财富）...")
            for i, trade_date in enumerate(trading_days, 1):
                logger.info(f"[{i}/{len(trading_days)}] 下载 {trade_date} 资金流向...")

                # 使用多数据源管理器获取资金流向数据
                df = await manager.get_with_fallback("get_moneyflow_by_date", trade_date)
                if df is not None and not df.empty:
                    async with get_database() as db:
                        for _, row in df.iterrows():
                            stock_code = row['ts_code'].split('.')[0]

                            # DC 接口字段转换（单位：万元 -> 元）
                            # net_amount: 主力净流入额（万元）
                            # buy_md_amount + buy_sm_amount: 中单+小单（散户）
                            # buy_elg_amount + buy_lg_amount: 超大单+大单（机构）
                            # net_amount_rate: 主力净流入占比（%）
                            main_fund_flow = (row.get('net_amount', 0) or 0) * 10000
                            retail_fund_flow = ((row.get('buy_md_amount', 0) or 0) + (row.get('buy_sm_amount', 0) or 0)) * 10000
                            institutional_flow = ((row.get('buy_elg_amount', 0) or 0) + (row.get('buy_lg_amount', 0) or 0)) * 10000
                            large_order_ratio = row.get('net_amount_rate', 0) or 0

                            await db.execute("""
                                INSERT OR REPLACE INTO fund_flow
                                (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                            """, (
                                stock_code,
                                trade_date[:4] + '-' + trade_date[4:6] + '-' + trade_date[6:8],  # YYYYMMDD -> YYYY-MM-DD
                                float(main_fund_flow),
                                float(retail_fund_flow),
                                float(institutional_flow),
                                round(float(large_order_ratio) / 100, 4)  # 百分比转小数
                            ))
                        await db.commit()
                    total_flows += len(df)
                    logger.info(f"  成功插入 {len(df)} 条 DC 资金流向数据")

                time_module.sleep(0.5)  # API 限流

        # 5. 批量下载大盘资金流向数据（市场整体资金流向）
        total_market_flows = 0
        logger.info("开始批量下载大盘资金流向数据（东财市场资金流向）...")
        for i, trade_date in enumerate(trading_days, 1):
            logger.info(f"[{i}/{len(trading_days)}] 下载 {trade_date} 大盘资金流向...")

            # 使用多数据源管理器获取市场整体资金流向
            # 注意：AKShare可能没有这个接口，所以会回退到Tushare
            df = await manager.get_with_fallback("get_market_moneyflow", trade_date=trade_date)
            if df is not None and not df.empty:
                async with get_database() as db:
                    for _, row in df.iterrows():
                        await db.execute("""
                            INSERT OR REPLACE INTO market_moneyflow
                            (trade_date, close_sh, pct_change_sh, close_sz, pct_change_sz,
                             net_amount, net_amount_rate, buy_elg_amount, buy_elg_amount_rate,
                             buy_lg_amount, buy_lg_amount_rate, buy_md_amount, buy_md_amount_rate,
                             buy_sm_amount, buy_sm_amount_rate, created_at, updated_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                        """, (
                            row['trade_date'].strftime('%Y-%m-%d'),
                            float(row.get('close_sh', 0)),
                            float(row.get('pct_change_sh', 0)),
                            float(row.get('close_sz', 0)),
                            float(row.get('pct_change_sz', 0)),
                            float(row.get('net_amount', 0)),
                            float(row.get('net_amount_rate', 0)),
                            float(row.get('buy_elg_amount', 0)),
                            float(row.get('buy_elg_amount_rate', 0)),
                            float(row.get('buy_lg_amount', 0)),
                            float(row.get('buy_lg_amount_rate', 0)),
                            float(row.get('buy_md_amount', 0)),
                            float(row.get('buy_md_amount_rate', 0)),
                            float(row.get('buy_sm_amount', 0)),
                            float(row.get('buy_sm_amount_rate', 0))
                        ))
                    await db.commit()
                total_market_flows += len(df)
                logger.info(f"  成功插入 {len(df)} 条大盘资金流向数据")

            time_module.sleep(0.5)  # API 限流

        # 6. 批量下载每日指标数据（技术分析指标）
        total_indicators = 0
        logger.info("开始批量下载每日指标数据（技术分析）...")
        for i, trade_date in enumerate(trading_days, 1):
            logger.info(f"[{i}/{len(trading_days)}] 下载 {trade_date} 每日指标...")

            df = await manager.get_with_fallback("get_daily_basic_by_date", trade_date)
            if df is not None and not df.empty:
                async with get_database() as db:
                    for _, row in df.iterrows():
                        stock_code = row['ts_code'].split('.')[0]
                        await db.execute("""
                            INSERT OR REPLACE INTO daily_basic
                            (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                             pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                             total_share, float_share, free_share, total_mv, circ_mv, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            row['trade_date'].strftime('%Y-%m-%d'),
                            float(row['close']) if pd.notna(row['close']) else None,
                            float(row['turnover_rate']) if pd.notna(row['turnover_rate']) else None,
                            float(row['turnover_rate_f']) if pd.notna(row['turnover_rate_f']) else None,
                            float(row['volume_ratio']) if pd.notna(row['volume_ratio']) else None,
                            float(row['pe']) if pd.notna(row['pe']) else None,
                            float(row['pe_ttm']) if pd.notna(row['pe_ttm']) else None,
                            float(row['pb']) if pd.notna(row['pb']) else None,
                            float(row['ps']) if pd.notna(row['ps']) else None,
                            float(row['ps_ttm']) if pd.notna(row['ps_ttm']) else None,
                            float(row['dv_ratio']) if pd.notna(row['dv_ratio']) else None,
                            float(row['dv_ttm']) if pd.notna(row['dv_ttm']) else None,
                            float(row['total_share']) if pd.notna(row['total_share']) else None,
                            float(row['float_share']) if pd.notna(row['float_share']) else None,
                            float(row['free_share']) if pd.notna(row['free_share']) else None,
                            float(row['total_mv']) if pd.notna(row['total_mv']) else None,
                            float(row['circ_mv']) if pd.notna(row['circ_mv']) else None
                        ))
                    await db.commit()
                total_indicators += len(df)
                logger.info(f"  成功插入 {len(df)} 条每日指标数据")

            time_module.sleep(0.5)  # API 限流

        elapsed_time = time_module.time() - start_time
        logger.info(f"批量数据采集完成！K线: {total_klines} 条, 个股资金流向: {total_flows} 条, 大盘资金流向: {total_market_flows} 条, 技术指标: {total_indicators} 条, 耗时: {elapsed_time:.1f}秒")

        try:
            async with get_database() as db:
                if history_id:
                    await db.execute("""
                        UPDATE collection_history
                        SET stock_count = ?, kline_count = ?, flow_count = ?, indicator_count = ?, status = 'completed', elapsed_time = ?, updated_at = datetime('now')
                        WHERE id = ?
                    """, (
                        int(stocks_df.shape[0]) if stocks_df is not None else 0,
                        int(total_klines),
                        int(total_flows + total_market_flows),
                        int(total_indicators),
                        float(elapsed_time),
                        int(history_id)
                    ))
                    await db.commit()
        except Exception as e:
            logger.error(f"更新采集历史失败: {e}")

    except Exception as e:
        logger.error(f"批量数据采集任务失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        try:
            async with get_database() as db:
                if history_id:
                    await db.execute("""
                        UPDATE collection_history
                        SET status = 'failed', error_message = ?, updated_at = datetime('now')
                        WHERE id = ?
                    """, (str(e), int(history_id)))
                    await db.commit()
        except Exception as e2:
            logger.error(f"记录失败状态错误: {e2}")


@router.get("/status")
async def get_collection_status():
    """Get data collection status"""
    try:
        async with get_database() as db:
            # Count total stocks
            cursor = await db.execute("SELECT COUNT(*) as count FROM stocks")
            stock_count = await cursor.fetchone()

            # Count stocks with recent data
            cursor = await db.execute("""
                SELECT COUNT(DISTINCT stock_code) as count FROM klines
                WHERE date >= date('now', '-7 days')
            """)
            recent_data_count = await cursor.fetchone()

            # Count volume analysis records
            cursor = await db.execute("""
                SELECT COUNT(*) as count FROM volume_analysis
                WHERE date >= date('now', '-7 days')
            """)
            analysis_count = await cursor.fetchone()

            return {
                "success": True,
                "data": {
                    "total_stocks": stock_count[0] if stock_count else 0,
                    "stocks_with_recent_data": recent_data_count[0] if recent_data_count else 0,
                    "recent_analysis_count": analysis_count[0] if analysis_count else 0,
                    "last_update": datetime.now().isoformat()
                }
            }
    except Exception as e:
        logger.error(f"Error getting collection status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/scheduler-status")
async def get_scheduler_status_api():
    """获取定时任务调度器状态"""
    # 延迟导入避免循环依赖
    from ..scheduler import get_scheduler_status
    return get_scheduler_status()


@router.post("/run-script")
async def run_script(background_tasks: BackgroundTasks, request: RunScriptRequest):
    """
    执行指定的Python脚本

    Args:
        request: 包含脚本文件名的请求体
    """
    try:
        # 检查脚本文件是否存在
        import os
        from pathlib import Path

        # 项目根目录路径
        project_root = Path(__file__).parent.parent.parent.parent
        script_path = project_root / request.script_name

        if not script_path.exists():
            raise HTTPException(status_code=404, detail=f"脚本文件不存在: {request.script_name}")

        # 添加后台任务
        background_tasks.add_task(run_script_task, script_path)

        return {
            "success": True,
            "message": f"脚本执行任务已启动: {request.script_name}"
        }

    except Exception as e:
        logger.error(f"启动脚本执行失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_script_task(script_path: Path):
    """执行Python脚本的后台任务"""
    try:
        import subprocess
        import sys

        logger.info(f"开始执行脚本: {script_path}")

        # 设置工作目录为项目根目录（脚本所在目录的父目录）
        project_root = script_path.parent
        logger.info(f"工作目录: {project_root}")

        # 使用当前Python解释器执行脚本，设置正确的工作目录
        result = subprocess.run(
            [sys.executable, str(script_path)],
            capture_output=True,
            text=True,
            encoding='utf-8',
            errors='replace',
            cwd=str(project_root)  # 设置工作目录
        )

        if result.returncode == 0:
            logger.info(f"脚本执行成功: {script_path}")
            logger.info(f"输出: {result.stdout}")
        else:
            logger.error(f"脚本执行失败: {script_path}")
            logger.error(f"错误码: {result.returncode}")
            logger.error(f"标准输出: {result.stdout}")
            logger.error(f"标准错误: {result.stderr}")
            raise Exception(f"脚本执行失败: {result.stderr}")

    except Exception as e:
        logger.error(f"执行脚本任务失败: {e}")
        import traceback
        logger.error(traceback.format_exc())


# ==================== 增量更新相关API ====================

class IncrementalCollectionRequest(BaseModel):
    """增量采集请求体"""
    days: int = 7  # 采集天数
    include_moneyflow: bool = True  # 是否包含资金流向数据
    validate_quality: bool = True  # 是否验证数据质量


@router.post("/incremental-collect")
async def incremental_collect(background_tasks: BackgroundTasks, request: IncrementalCollectionRequest = None):
    """
    执行增量数据采集

    只采集上次采集后的新交易日数据，避免重复采集
    """
    try:
        manager = get_multi_source_manager()

        # 检查是否有可用的数据源
        if not manager.sources:
            raise HTTPException(status_code=400, detail="No data source available")

        # 使用默认参数
        if request is None:
            request = IncrementalCollectionRequest()

        # 添加后台任务
        background_tasks.add_task(incremental_collect_task, request.days, request.include_moneyflow, request.validate_quality)

        return {
            "success": True,
            "message": f"增量数据采集任务已启动，将采集最近{request.days}天的新数据"
        }
    except Exception as e:
        logger.error(f"启动增量采集失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def incremental_collect_task(days: int = 7, include_moneyflow: bool = True, validate_quality: bool = True):
    """增量数据采集的后台任务"""
    try:
        import sys
        from pathlib import Path

        # 导入增量采集器
        project_root = Path(__file__).parent.parent.parent.parent
        sys.path.append(str(project_root))

        from incremental_data_collector import IncrementalDataCollector

        logger.info(f"开始增量数据采集，天数: {days}, 包含资金流向: {include_moneyflow}, 验证质量: {validate_quality}")

        collector = IncrementalDataCollector()

        if not collector.initialize():
            logger.error("增量采集器初始化失败")
            return

        # 执行增量采集
        result = await collector.collect_incremental_data()

        if result['success']:
            logger.info(f"增量数据采集成功: {result}")
        else:
            logger.error(f"增量数据采集失败: {result.get('error', '未知错误')}")

    except Exception as e:
        logger.error(f"增量数据采集任务失败: {e}")
        import traceback
        logger.error(traceback.format_exc())


@router.get("/collection-history")
async def get_collection_history(limit: int = 10):
    """获取采集历史记录"""
    try:
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT id, collection_type, start_date, end_date,
                       stock_count, kline_count, flow_count, indicator_count,
                       status, elapsed_time, created_at
                FROM collection_history
                ORDER BY created_at DESC
                LIMIT ?
            """, (limit,))

            rows = await cursor.fetchall()

            history_list = []
            for row in rows:
                history_list.append({
                    "id": row[0],
                    "collection_type": row[1],
                    "start_date": row[2],
                    "end_date": row[3],
                    "stock_count": row[4],
                    "kline_count": row[5],
                    "flow_count": row[6],
                    "indicator_count": row[7],
                    "status": row[8],
                    "elapsed_time": row[9],
                    "created_at": row[10]
                })

            return {
                "success": True,
                "data": history_list,
                "total": len(history_list)
            }

    except Exception as e:
        logger.error(f"获取采集历史失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/collection-config")
async def get_collection_config():
    """获取采集配置"""
    try:
        async with get_database() as db:
            cursor = await db.execute("SELECT config_key, config_value, description FROM collection_config")
            rows = await cursor.fetchall()

            config_dict = {}
            for row in rows:
                config_dict[row[0]] = {
                    "value": row[1],
                    "description": row[2]
                }

            return {
                "success": True,
                "data": config_dict
            }

    except Exception as e:
        logger.error(f"获取采集配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/collection-config/{config_key}")
async def update_collection_config(config_key: str, config_value: str):
    """更新采集配置"""
    try:
        async with get_database() as db:
            await db.execute("""
                INSERT OR REPLACE INTO collection_config (config_key, config_value, updated_at)
                VALUES (?, ?, datetime('now'))
            """, (config_key, config_value))

            await db.commit()

            return {
                "success": True,
                "message": f"配置 {config_key} 已更新为 {config_value}"
            }

    except Exception as e:
        logger.error(f"更新采集配置失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/data-quality-metrics")
async def get_data_quality_metrics(days: int = 7):
    """获取数据质量指标"""
    try:
        async with get_database() as db:
            # 获取最近N天的数据质量指标
            cursor = await db.execute("""
                SELECT monitor_date, metric_name, metric_value, status, alert_message, created_at
                FROM data_quality_monitor
                WHERE monitor_date >= date('now', ?)
                ORDER BY monitor_date DESC, metric_name
            """, (f'-{days} days',))

            rows = await cursor.fetchall()

            metrics_by_date = {}
            for row in rows:
                date_str = row[0]
                if date_str not in metrics_by_date:
                    metrics_by_date[date_str] = []

                metrics_by_date[date_str].append({
                    "metric_name": row[1],
                    "metric_value": row[2],
                    "status": row[3],
                    "alert_message": row[4],
                    "created_at": row[5]
                })

            # 计算趋势
            trends = {}
            for metric_name in ["overall_score", "kline_coverage", "flow_coverage"]:
                cursor = await db.execute("""
                    SELECT metric_value FROM data_quality_monitor
                    WHERE metric_name = ? AND monitor_date >= date('now', ?)
                    ORDER BY monitor_date
                """, (metric_name, f'-{days} days'))

                values = [row[0] for row in await cursor.fetchall()]
                if len(values) >= 2:
                    trend = "上升" if values[-1] > values[0] else "下降" if values[-1] < values[0] else "持平"
                    change = values[-1] - values[0]
                    trends[metric_name] = {
                        "trend": trend,
                        "change": change,
                        "current": values[-1] if values else None,
                        "previous": values[0] if values else None
                    }

            return {
                "success": True,
                "data": {
                    "metrics_by_date": metrics_by_date,
                    "trends": trends,
                    "total_days": len(metrics_by_date)
                }
            }

    except Exception as e:
        logger.error(f"获取数据质量指标失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/incremental-status")
async def get_incremental_status():
    """获取增量更新状态"""
    try:
        async with get_database() as db:
            # 获取上次采集时间
            cursor = await db.execute("""
                SELECT MAX(end_date) FROM collection_history
                WHERE status = 'completed'
            """)
            last_collection = await cursor.fetchone()

            # 获取最近一次增量采集
            cursor = await db.execute("""
                SELECT * FROM collection_history
                WHERE collection_type = 'incremental' AND status = 'completed'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            last_incremental = await cursor.fetchone()

            # 获取增量采集统计
            cursor = await db.execute("""
                SELECT
                    COUNT(*) as total_count,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as success_count,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
                    AVG(elapsed_time) as avg_time
                FROM collection_history
                WHERE collection_type = 'incremental'
            """)
            stats = await cursor.fetchone()

            # 获取增量配置
            cursor = await db.execute("""
                SELECT config_value FROM collection_config
                WHERE config_key = 'incremental_enabled'
            """)
            config_row = await cursor.fetchone()
            incremental_enabled = config_row[0] == 'true' if config_row else False

            return {
                "success": True,
                "data": {
                    "incremental_enabled": incremental_enabled,
                    "last_collection_date": last_collection[0] if last_collection else None,
                    "last_incremental": {
                        "start_date": last_incremental[2] if last_incremental else None,
                        "end_date": last_incremental[3] if last_incremental else None,
                        "stock_count": last_incremental[4] if last_incremental else None,
                        "kline_count": last_incremental[5] if last_incremental else None,
                        "elapsed_time": last_incremental[10] if last_incremental else None
                    } if last_incremental else None,
                    "stats": {
                        "total_count": stats[0] if stats else 0,
                        "success_count": stats[1] if stats else 0,
                        "failed_count": stats[2] if stats else 0,
                        "success_rate": stats[1] / stats[0] * 100 if stats and stats[0] > 0 else 0,
                        "avg_time": stats[3] if stats else 0
                    } if stats else None
                }
            }

    except Exception as e:
        logger.error(f"获取增量更新状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quick-refresh-all")
async def quick_refresh_all(background_tasks: BackgroundTasks):
    """一键快速更新数据（统一增量更新入口）"""
    try:
        manager = get_multi_source_manager()

        if not manager.sources:
            raise HTTPException(status_code=400, detail="No data source available")

        incremental_enabled = False
        incremental_days = 7

        try:
            async with get_database() as db:
                cursor = await db.execute("""
                    SELECT config_key, config_value
                    FROM collection_config
                    WHERE config_key IN ('incremental_enabled', 'incremental_days')
                """)
                rows = await cursor.fetchall()

                for row in rows:
                    key = row[0]
                    value = row[1]
                    if key == "incremental_enabled":
                        incremental_enabled = value == "true"
                    elif key == "incremental_days":
                        try:
                            incremental_days = int(value)
                        except ValueError:
                            incremental_days = 7
        except Exception as e:
            logger.error(f"读取采集配置失败: {e}")

        if incremental_enabled:
            days = incremental_days if incremental_days > 0 else 7
            background_tasks.add_task(incremental_collect_task, days, True, True)
            strategy = "incremental"
            message = f"增量更新任务已启动，将采集最近{days}天的新数据"
        else:
            background_tasks.add_task(batch_collect_7days_task, True)
            strategy = "full"
            message = "全量数据采集任务已启动，将采集最近7天的数据"

        tushare_client = TushareClient()
        background_tasks.add_task(update_auction_from_tushare_task, tushare_client)

        return {
            "success": True,
            "strategy": strategy,
            "message": message
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"启动快速更新任务失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 数据质量监控相关API ====================

@router.get("/quality-metrics")
async def get_quality_metrics(days: int = 7):
    """
    获取数据质量指标

    Args:
        days: 计算最近N天的指标，默认7天
    """
    try:
        # 导入数据质量监控器
        import sys
        from pathlib import Path

        project_root = Path(__file__).parent.parent.parent.parent
        sys.path.append(str(project_root))

        from data_quality_monitor import DataQualityMonitor

        monitor = DataQualityMonitor()
        metrics = await monitor.calculate_all_metrics(days)

        # 转换为字典格式
        metrics_data = []
        for metric in metrics:
            metrics_data.append({
                "name": metric.name,
                "value": metric.value,
                "metric_type": metric.metric_type.value,
                "threshold": metric.threshold,
                "unit": metric.unit,
                "description": metric.description,
                "is_healthy": metric.is_healthy(),
                "alert_level": metric.get_alert_level().value
            })

        return {
            "success": True,
            "data": {
                "days": days,
                "total_metrics": len(metrics),
                "healthy_metrics": len([m for m in metrics if m.is_healthy()]),
                "metrics": metrics_data
            }
        }

    except Exception as e:
        logger.error(f"获取质量指标失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quality-report")
async def get_quality_report(days: int = 7):
    """
    获取数据质量报告

    Args:
        days: 报告覆盖的天数，默认7天
    """
    try:
        # 导入数据质量监控器
        import sys
        from pathlib import Path

        project_root = Path(__file__).parent.parent.parent.parent
        sys.path.append(str(project_root))

        from data_quality_monitor import DataQualityMonitor

        monitor = DataQualityMonitor()
        report = await monitor.generate_quality_report(days)

        return {
            "success": True,
            "data": report
        }

    except Exception as e:
        logger.error(f"获取质量报告失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/run-quality-check")
async def run_quality_check(background_tasks: BackgroundTasks, days: int = 7):
    """
    运行数据质量检查

    Args:
        days: 检查最近N天的数据，默认7天
    """
    try:
        # 添加后台任务
        background_tasks.add_task(run_quality_check_task, days)

        return {
            "success": True,
            "message": f"数据质量检查任务已启动，将检查最近{days}天的数据"
        }

    except Exception as e:
        logger.error(f"启动质量检查失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_quality_check_task(days: int = 7):
    """运行数据质量检查的后台任务"""
    try:
        import sys
        from pathlib import Path

        project_root = Path(__file__).parent.parent.parent.parent
        sys.path.append(str(project_root))

        from data_quality_monitor import DataQualityMonitor

        logger.info(f"开始数据质量检查，天数: {days}")

        monitor = DataQualityMonitor()

        # 运行定时检查
        await monitor.run_scheduled_check()

        logger.info("数据质量检查完成")

    except Exception as e:
        logger.error(f"数据质量检查任务失败: {e}")
        import traceback
        logger.error(traceback.format_exc())


@router.get("/quality-alerts")
async def get_quality_alerts(limit: int = 10, days: int = 7):
    """
    获取数据质量报警记录

    Args:
        limit: 返回记录数限制，默认10条
        days: 查询最近N天的记录，默认7天
    """
    try:
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT monitor_date, metric_name, metric_value, threshold,
                       status, alert_message, created_at
                FROM data_quality_monitor
                WHERE monitor_date >= date('now', ?)
                ORDER BY created_at DESC
                LIMIT ?
            """, (f'-{days} days', limit))

            rows = await cursor.fetchall()

            alerts = []
            for row in rows:
                alerts.append({
                    "monitor_date": row[0],
                    "metric_name": row[1],
                    "metric_value": row[2],
                    "threshold": row[3],
                    "status": row[4],
                    "alert_message": row[5],
                    "created_at": row[6]
                })

            return {
                "success": True,
                "data": {
                    "total_alerts": len(alerts),
                    "days": days,
                    "alerts": alerts
                }
            }

    except Exception as e:
        logger.error(f"获取质量报警失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quality-trend")
async def get_quality_trend(days: int = 30):
    """
    获取数据质量趋势

    Args:
        days: 查询最近N天的趋势，默认30天
    """
    try:
        async with get_database() as db:
            # 获取每日总体评分趋势
            cursor = await db.execute("""
                SELECT monitor_date, metric_value
                FROM data_quality_monitor
                WHERE metric_name = 'overall_score' AND monitor_date >= date('now', ?)
                ORDER BY monitor_date
            """, (f'-{days} days',))

            rows = await cursor.fetchall()

            trend_data = []
            for row in rows:
                trend_data.append({
                    "date": row[0],
                    "score": row[1]
                })

            # 计算趋势统计
            if trend_data:
                scores = [item["score"] for item in trend_data]
                avg_score = sum(scores) / len(scores)
                max_score = max(scores)
                min_score = min(scores)

                # 计算趋势方向
                if len(scores) >= 2:
                    trend_direction = "上升" if scores[-1] > scores[0] else "下降" if scores[-1] < scores[0] else "持平"
                    trend_change = scores[-1] - scores[0]
                else:
                    trend_direction = "未知"
                    trend_change = 0
            else:
                avg_score = 0
                max_score = 0
                min_score = 0
                trend_direction = "未知"
                trend_change = 0

            return {
                "success": True,
                "data": {
                    "days": days,
                    "trend_data": trend_data,
                    "statistics": {
                        "average_score": round(avg_score, 2),
                        "max_score": round(max_score, 2),
                        "min_score": round(min_score, 2),
                        "trend_direction": trend_direction,
                        "trend_change": round(trend_change, 2)
                    }
                }
            }

    except Exception as e:
        logger.error(f"获取质量趋势失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 多数据源管理相关API ====================

@router.get("/multi-source/status")
async def get_multi_source_status():
    """获取多数据源状态"""
    try:
        manager = get_multi_source_manager()

        # 运行健康检查
        await manager.run_health_check()

        # 获取状态报告
        status_report = manager.get_status_report()

        return {
            "success": True,
            "data": status_report
        }

    except Exception as e:
        logger.error(f"获取多数据源状态失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/multi-source/consistency")
async def get_consistency_report(days: int = 7):
    """获取数据一致性报告"""
    try:
        manager = get_multi_source_manager()

        # 创建一致性监控器
        monitor = ConsistencyMonitor(manager)

        # 运行验证
        await monitor.run_validation()

        # 获取验证报告
        validation_report = monitor.get_validation_report()

        return {
            "success": True,
            "data": validation_report
        }

    except Exception as e:
        logger.error(f"获取一致性报告失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/multi-source/run-health-check")
async def run_health_check(background_tasks: BackgroundTasks):
    """运行数据源健康检查"""
    try:
        manager = get_multi_source_manager()

        # 在后台运行健康检查
        background_tasks.add_task(run_health_check_task)

        return {
            "success": True,
            "message": "数据源健康检查任务已启动"
        }

    except Exception as e:
        logger.error(f"启动健康检查失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def run_health_check_task():
    """运行健康检查的后台任务"""
    try:
        manager = get_multi_source_manager()
        await manager.run_health_check()
        logger.info("数据源健康检查完成")
    except Exception as e:
        logger.error(f"健康检查任务失败: {e}")


@router.post("/multi-source/clear-cache")
async def clear_multi_source_cache():
    """清空多数据源缓存"""
    try:
        manager = get_multi_source_manager()
        manager.clear_cache()

        return {
            "success": True,
            "message": "多数据源缓存已清空"
        }

    except Exception as e:
        logger.error(f"清空缓存失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/multi-source/cache-ttl/{ttl_seconds}")
async def set_cache_ttl(ttl_seconds: int):
    """设置缓存有效期"""
    try:
        manager = get_multi_source_manager()
        manager.set_cache_ttl(ttl_seconds)

        return {
            "success": True,
            "message": f"缓存有效期已设置为 {ttl_seconds} 秒"
        }

    except Exception as e:
        logger.error(f"设置缓存有效期失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/multi-source/source-info/{source_name}")
async def get_source_info(source_name: str):
    """获取指定数据源的详细信息"""
    try:
        manager = get_multi_source_manager()

        if source_name not in manager.sources:
            raise HTTPException(status_code=404, detail=f"数据源不存在: {source_name}")

        source = manager.sources[source_name]
        health = manager.health_status.get(source_name)

        source_info = {
            "source_name": source_name,
            "available": source.is_available(),
            "health_status": health.to_dict() if health else None,
            "source_health": source.get_health_status()
        }

        return {
            "success": True,
            "data": source_info
        }

    except Exception as e:
        logger.error(f"获取数据源信息失败: {e}")
        raise HTTPException(status_code=500, detail=str(e))
