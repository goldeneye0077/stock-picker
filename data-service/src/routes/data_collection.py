from fastapi import APIRouter, HTTPException, BackgroundTasks
from ..data_sources.tushare_client import TushareClient
from ..utils.database import get_database
from loguru import logger
import pandas as pd
from datetime import datetime, timedelta

router = APIRouter()


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
    """Fetch and update stock list from Tushare"""
    try:
        tushare_client = TushareClient()
        if not tushare_client.is_available():
            raise HTTPException(status_code=400, detail="Tushare client not available")

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
        tushare_client = TushareClient()
        df = await tushare_client.get_stock_basic()

        if df is None or df.empty:
            logger.warning("No stock data received from Tushare")
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
        tushare_client = TushareClient()
        if not tushare_client.is_available():
            raise HTTPException(status_code=400, detail="Tushare client not available")

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
        tushare_client = TushareClient()

        # Convert code to ts_code format
        ts_code = f"{stock_code}.SZ" if stock_code.startswith('00') else f"{stock_code}.SH"

        # Calculate date range
        end_date = datetime.now().strftime('%Y%m%d')
        start_date = (datetime.now() - timedelta(days=days)).strftime('%Y%m%d')

        df = await tushare_client.get_daily_data(ts_code, start_date, end_date)

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
        tushare_client = TushareClient()
        if not tushare_client.is_available():
            raise HTTPException(status_code=400, detail="Tushare client not available")

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

    try:
        logger.info("开始批量采集最近 7 天 A 股数据...")
        start_time = time_module.time()

        tushare_client = TushareClient()

        # 1. 获取交易日历
        end_date = datetime.now()
        start_date = end_date - timedelta(days=14)  # 取 14 天确保覆盖 7 个交易日

        cal_df = await tushare_client.get_trade_cal(
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

        # 2. 下载股票基本信息
        logger.info("下载股票基本信息...")
        stocks_df = await tushare_client.get_stock_basic()
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

            df = await tushare_client.get_daily_data_by_date(trade_date)
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

                # 使用 DC 接口获取东方财富资金流向数据（更准确）
                df = await tushare_client.get_moneyflow_dc_by_date(trade_date)
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

        # 5. 批量下载每日指标数据（技术分析指标）
        total_indicators = 0
        logger.info("开始批量下载每日指标数据（技术分析）...")
        for i, trade_date in enumerate(trading_days, 1):
            logger.info(f"[{i}/{len(trading_days)}] 下载 {trade_date} 每日指标...")

            df = await tushare_client.get_daily_basic_by_date(trade_date)
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
        logger.info(f"批量数据采集完成！K线: {total_klines} 条, 资金流向: {total_flows} 条, 技术指标: {total_indicators} 条, 耗时: {elapsed_time:.1f}秒")

    except Exception as e:
        logger.error(f"批量数据采集任务失败: {e}")
        import traceback
        logger.error(traceback.format_exc())


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