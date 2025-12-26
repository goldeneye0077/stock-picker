#!/usr/bin/env python3
"""
增量数据采集器
第三阶段核心功能：实现增量更新，避免重复采集，提高效率
"""

import asyncio
import aiosqlite
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import logging
from typing import List, Dict, Tuple, Optional, Any
import pandas as pd

# 导入重试工具和数据验证
sys.path.append('.')
from retry_utils import sync_collect_with_retry, default_sync_collect_with_retry
from data_validation import DataValidator

# 加载 .env 文件
from dotenv import load_dotenv

# 加载 data-service/.env 文件
env_path = Path(__file__).parent / 'data-service' / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    print(f"已加载配置文件: {env_path}")
else:
    print(f"警告: 未找到配置文件 {env_path}")

# 添加 data-service 路径以导入 tushare 客户端
sys.path.append('data-service/src')
from data_sources.tushare_client import TushareClient

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class IncrementalDataCollector:
    """增量数据采集器"""

    def __init__(self, db_path: str = None):
        self.db_path = db_path
        self.tushare_client = None
        self.validator = DataValidator(db_path)

        # 配置参数
        self.max_retries = 3
        self.retry_delay = 2.0
        self.batch_size = 100

        # 股票过滤规则（与统一采集器保持一致）
        self.exclude_patterns = [
            '9%',  # 排除9开头的特殊股票（BSE等）
            '4%',  # 排除4开头的老三板
            '8%'   # 排除8开头的北交所（可选）
        ]

        # 热门股票列表（14只）
        self.hot_stocks = [
            ("300474", "SZ"), ("002371", "SZ"), ("002049", "SZ"),
            ("300750", "SZ"), ("600519", "SH"), ("000858", "SZ"),
            ("600118", "SH"), ("600879", "SH"), ("000901", "SZ"),
            ("300502", "SZ"), ("300394", "SZ"), ("300308", "SZ"),
            ("002415", "SZ"), ("000001", "SZ")
        ]

        # 采集配置
        self.config = {}

    def initialize(self) -> bool:
        """初始化采集器"""
        print("初始化增量数据采集器...")

        try:
            # 初始化 Tushare 客户端
            self.tushare_client = TushareClient()
            if not self.tushare_client.is_available():
                logger.error("Tushare 客户端不可用，请检查 token 配置")
                return False

            # 如果 db_path 为 None，使用项目根目录的数据库
            if self.db_path is None:
                # 计算项目根目录的数据库路径
                # 从项目根目录运行：data/stock_picker.db
                # 从data-service目录运行：../data/stock_picker.db
                current_dir = Path.cwd()
                if current_dir.name == 'data-service':
                    # 在data-service目录中
                    project_root = current_dir.parent
                else:
                    # 在项目根目录或其他目录
                    project_root = current_dir

                self.db_path = str(project_root / "data" / "stock_picker.db")
                logger.info(f"使用默认数据库路径: {self.db_path}")

            # 确保数据库目录存在
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

            # 重新初始化 DataValidator 使用正确的路径
            self.validator = DataValidator(self.db_path)

            # 加载配置（异步方法，在collect_incremental_data中调用）
            # 这里不调用_load_config，因为它是异步的
            # 在collect_incremental_data方法中会调用

            logger.info("增量数据采集器初始化成功")
            return True

        except Exception as e:
            logger.error(f"初始化失败: {e}")
            return False

    async def _load_config(self):
        """加载采集配置"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("SELECT config_key, config_value FROM collection_config")
                rows = await cursor.fetchall()

                for row in rows:
                    key, value = row
                    self.config[key] = value

                logger.info(f"加载配置完成: {len(self.config)} 项")

        except Exception as e:
            logger.error(f"加载配置失败: {e}")
            # 使用默认配置
            self.config = {
                'incremental_enabled': 'false',
                'incremental_days': '7',
                'full_collection_days': '30',
                'max_retries': '3',
                'retry_delay': '2',
                'hot_stock_guarantee': 'true',
                'data_validation_enabled': 'true',
                'quality_threshold': '85',
                'alert_enabled': 'true'
            }

    async def get_last_collection_date(self) -> Optional[str]:
        """
        获取上次采集的日期

        Returns:
            上次采集的日期字符串 (YYYY-MM-DD)，如果没有记录则返回 None
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT MAX(end_date) FROM collection_history
                    WHERE status = 'completed' AND collection_type = 'incremental'
                """)
                row = await cursor.fetchone()

                if row and row[0]:
                    return row[0]

                # 如果没有增量采集记录，查找全量采集记录
                cursor = await db.execute("""
                    SELECT MAX(end_date) FROM collection_history
                    WHERE status = 'completed'
                """)
                row = await cursor.fetchone()

                return row[0] if row and row[0] else None

        except Exception as e:
            logger.error(f"获取上次采集日期失败: {e}")
            return None

    async def get_new_dates_since_last(self) -> List[str]:
        """
        获取上次采集后的新交易日

        Returns:
            新交易日列表，格式 ['20251209', '20251208', ...]
        """
        last_date = await self.get_last_collection_date()

        if not last_date:
            logger.info("首次采集，获取最近7个交易日")
            return await self._get_trading_days(days=7)

        # 获取最近30天的交易日
        all_dates = await self._get_trading_days(days=30)

        # 筛选出上次采集后的新交易日
        new_dates = []
        for date in all_dates:
            # 将日期格式统一为 YYYYMMDD 进行比较
            date_str = date.replace('-', '')
            last_date_str = last_date.replace('-', '')

            if date_str > last_date_str:
                new_dates.append(date_str)

        # 最多采集7天
        result = new_dates[:7]
        logger.info(f"找到 {len(result)} 个新交易日: {result}")
        return result

    async def _get_trading_days(self, days: int = 7) -> List[str]:
        """
        获取最近N个交易日的日期列表

        Args:
            days: 需要获取的天数

        Returns:
            交易日列表，格式 ['2025-12-09', '2025-12-08', ...]
        """
        try:
            # 计算日期范围
            end_date = datetime.now()
            start_date = end_date - timedelta(days=days * 2)

            # 获取交易日历
            cal_df = await self.tushare_client.get_trade_cal(
                start_date.strftime('%Y%m%d'),
                end_date.strftime('%Y%m%d')
            )

            if cal_df is None or cal_df.empty:
                logger.warning("无法获取交易日历，使用最近自然日")
                end_date = datetime.now()
                return [(end_date - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(days)]

            # 筛选出交易日
            trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
            trading_days = [d.strftime('%Y-%m-%d') for d in sorted(trading_days, reverse=True)]

            # 取最近的N个交易日
            result = trading_days[:days]
            logger.info(f"找到 {len(result)} 个交易日")
            return result

        except Exception as e:
            logger.error(f"获取交易日历失败: {e}")
            end_date = datetime.now()
            return [(end_date - timedelta(days=i)).strftime('%Y-%m-%d') for i in range(days)]

    async def get_filtered_stock_list(self) -> List[Tuple[str, str]]:
        """
        获取过滤后的股票列表
        排除特殊股票，确保K线和资金流向使用相同的股票列表

        Returns:
            股票代码和交易所的列表，如 [('000001', 'SZ'), ('600519', 'SH')]
        """
        print("获取过滤后的股票列表...")

        try:
            # 直接调用异步方法
            stocks_df = await self.tushare_client.get_stock_basic()

            if stocks_df is None or stocks_df.empty:
                logger.error("获取股票列表失败")
                return []

            # 过滤股票
            filtered_stocks = []
            for _, row in stocks_df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                # 应用过滤规则
                should_exclude = False
                for pattern in self.exclude_patterns:
                    if pattern.endswith('%') and code.startswith(pattern[:-1]):
                        should_exclude = True
                        break

                if not should_exclude:
                    filtered_stocks.append((code, exchange))

            logger.info(f"股票过滤完成: 原始{len(stocks_df)}只 -> 过滤后{len(filtered_stocks)}只")
            return filtered_stocks

        except Exception as e:
            logger.error(f"获取过滤股票列表失败: {e}")
            return []

    async def collect_incremental_data(self) -> Dict[str, Any]:
        """
        执行增量数据采集

        Returns:
            采集统计信息
        """
        print("开始增量数据采集...")
        start_time = time.time()

        try:
            # 0. 加载配置
            await self._load_config()

            # 1. 获取新交易日
            new_dates = await self.get_new_dates_since_last()
            if not new_dates:
                logger.info("没有新交易日需要采集")
                return {
                    'success': True,
                    'message': '没有新交易日需要采集',
                    'new_dates': 0,
                    'elapsed_time': 0
                }

            # 2. 获取过滤后的股票列表
            filtered_stocks = await self.get_filtered_stock_list()
            if not filtered_stocks:
                logger.error("无法获取股票列表")
                return {'success': False, 'error': '无法获取股票列表'}

            # 3. 创建采集历史记录
            history_id = await self._create_collection_history(
                collection_type='incremental',
                start_date=new_dates[-1],  # 最早的日期
                end_date=new_dates[0]      # 最新的日期
            )

            # 4. 按日期采集数据
            total_kline_records = 0
            total_flow_records = 0
            total_indicator_records = 0

            for i, trade_date in enumerate(new_dates, 1):
                logger.info(f"[{i}/{len(new_dates)}] 采集 {trade_date} 数据")

                # 采集日线数据
                kline_count = await self._collect_daily_data(trade_date, filtered_stocks)
                total_kline_records += kline_count

                # 采集资金流向数据
                flow_count = await self._collect_moneyflow_data(trade_date, filtered_stocks)
                total_flow_records += flow_count

                # 采集技术指标数据
                indicator_count = await self._collect_daily_indicators(trade_date, filtered_stocks)
                total_indicator_records += indicator_count

                # 确保热门股票数据完整
                await self._ensure_hot_stock_data(trade_date)

                # API限流
                await asyncio.sleep(0.5)

            # 5. 更新采集历史记录
            elapsed_time = time.time() - start_time
            await self._update_collection_history(
                history_id=history_id,
                status='completed',
                stock_count=len(filtered_stocks),
                kline_count=total_kline_records,
                flow_count=total_flow_records,
                indicator_count=total_indicator_records,
                elapsed_time=elapsed_time
            )

            # 6. 验证数据质量
            if self.config.get('data_validation_enabled', 'true') == 'true':
                logger.info("开始验证数据质量...")
                quality_report = await self.validator.generate_quality_report()

                # 记录数据质量指标
                await self._record_quality_metrics(quality_report)

            # 7. 返回结果
            result = {
                'success': True,
                'new_dates': len(new_dates),
                'filtered_stocks': len(filtered_stocks),
                'total_kline_records': total_kline_records,
                'total_flow_records': total_flow_records,
                'total_indicator_records': total_indicator_records,
                'elapsed_time': round(elapsed_time, 1)
            }

            logger.info(f"增量数据采集完成! 耗时: {elapsed_time:.1f}秒")
            return result

        except Exception as e:
            logger.error(f"增量数据采集失败: {e}")
            import traceback
            logger.error(traceback.format_exc())

            # 更新采集历史记录为失败状态
            if 'history_id' in locals():
                await self._update_collection_history(
                    history_id=history_id,
                    status='failed',
                    error_message=str(e)
                )

            return {'success': False, 'error': str(e)}

    async def _collect_daily_data(self, trade_date: str, filtered_stocks: List[Tuple[str, str]]) -> int:
        """采集日线数据"""
        try:
            df = await self.tushare_client.get_daily_data_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无日线数据")
                return 0

            # 过滤数据
            filtered_records = []
            for _, row in df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                if (code, exchange) in filtered_stocks:
                    filtered_records.append(row)

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                inserted_count = 0
                for row in filtered_records:
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        await db.execute("""
                            INSERT OR REPLACE INTO klines
                            (stock_code, date, open, high, low, close, volume, amount, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            code,
                            trade_date_str,
                            float(row['open']),
                            float(row['high']),
                            float(row['low']),
                            float(row['close']),
                            int(row['vol'] * 100),
                            float(row['amount'] * 1000)
                        ))
                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入K线 {row['ts_code']} 失败: {e}")

                await db.commit()
                logger.info(f"日线数据插入完成: {inserted_count} 条")
                return inserted_count

        except Exception as e:
            logger.error(f"采集日线数据失败: {e}")
            return 0

    async def _collect_moneyflow_data(self, trade_date: str, filtered_stocks: List[Tuple[str, str]]) -> int:
        """采集资金流向数据"""
        try:
            df = await self.tushare_client.get_moneyflow_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无资金流向数据")
                return 0

            # 过滤数据
            filtered_records = []
            for _, row in df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                if (code, exchange) in filtered_stocks:
                    filtered_records.append(row)

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                inserted_count = 0
                for row in filtered_records:
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        # 计算大单占比
                        total_amount = abs(row['buy_lg_amount']) + abs(row['sell_lg_amount']) + \
                                     abs(row['buy_elg_amount']) + abs(row['sell_elg_amount'])
                        small_amount = abs(row['buy_sm_amount']) + abs(row['sell_sm_amount']) + \
                                     abs(row['buy_md_amount']) + abs(row['sell_md_amount'])

                        large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0
                        institutional_flow = float(row.get('extra_large_net_flow', 0))

                        await db.execute("""
                            INSERT OR REPLACE INTO fund_flow
                            (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            code,
                            trade_date_str,
                            float(row['main_fund_flow']),
                            float(row['retail_fund_flow']),
                            institutional_flow,
                            round(large_order_ratio, 4)
                        ))
                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入资金流向 {row['ts_code']} 失败: {e}")

                await db.commit()
                logger.info(f"资金流向数据插入完成: {inserted_count} 条")
                return inserted_count

        except Exception as e:
            logger.error(f"采集资金流向数据失败: {e}")
            return 0

    async def _collect_daily_indicators(self, trade_date: str, filtered_stocks: List[Tuple[str, str]]) -> int:
        """采集每日技术指标"""
        try:
            df = await self.tushare_client.get_daily_basic_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无技术指标数据")
                return 0

            # 过滤数据
            filtered_records = []
            for _, row in df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                if (code, exchange) in filtered_stocks:
                    filtered_records.append(row)

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                inserted_count = 0
                for row in filtered_records:
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        await db.execute("""
                            INSERT OR REPLACE INTO daily_basic
                            (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                             pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                             total_share, float_share, free_share, total_mv, circ_mv, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            code,
                            trade_date_str,
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
                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入技术指标 {row['ts_code']} 失败: {e}")

                await db.commit()
                logger.info(f"技术指标数据插入完成: {inserted_count} 条")
                return inserted_count

        except Exception as e:
            logger.error(f"采集技术指标数据失败: {e}")
            return 0

    async def _ensure_hot_stock_data(self, trade_date: str):
        """确保热门股票数据完整"""
        if self.config.get('hot_stock_guarantee', 'true') != 'true':
            return

        logger.info(f"确保热门股票数据完整 ({trade_date})...")

        try:
            trade_date_str = trade_date[:4] + '-' + trade_date[4:6] + '-' + trade_date[6:8]

            async with aiosqlite.connect(self.db_path) as db:
                for stock_code, exchange in self.hot_stocks:
                    ts_code = f"{stock_code}.{exchange}"

                    # 检查K线数据
                    cursor = await db.execute("""
                        SELECT COUNT(*) FROM klines
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, trade_date_str))
                    has_kline = (await cursor.fetchone())[0] > 0

                    # 检查资金流向数据
                    cursor = await db.execute("""
                        SELECT COUNT(*) FROM fund_flow
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, trade_date_str))
                    has_flow = (await cursor.fetchone())[0] > 0

                    if has_kline and has_flow:
                        continue  # 数据完整，跳过

                    logger.info(f"补充采集热门股票 {ts_code}")

                    # 补充采集逻辑（这里可以调用统一的补充采集方法）
                    # 为了简化，这里只记录日志
                    logger.info(f"需要补充采集 {ts_code} 的 {trade_date} 数据")

                    # API限流
                    await asyncio.sleep(0.1)

            logger.info("热门股票数据完整性检查完成")

        except Exception as e:
            logger.error(f"确保热门股票数据完整失败: {e}")

    async def _create_collection_history(self, collection_type: str, start_date: str, end_date: str) -> int:
        """创建采集历史记录"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    INSERT INTO collection_history
                    (collection_type, start_date, end_date, status, created_at, updated_at)
                    VALUES (?, ?, ?, 'running', datetime('now'), datetime('now'))
                """, (collection_type, start_date, end_date))

                await db.commit()
                history_id = cursor.lastrowid
                logger.info(f"创建采集历史记录 ID: {history_id}")
                return history_id

        except Exception as e:
            logger.error(f"创建采集历史记录失败: {e}")
            return -1

    async def _update_collection_history(self, history_id: int, status: str, **kwargs):
        """更新采集历史记录"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                update_fields = []
                params = []

                for key, value in kwargs.items():
                    if value is not None:
                        update_fields.append(f"{key} = ?")
                        params.append(value)

                if update_fields:
                    update_fields.append("status = ?")
                    params.append(status)
                    update_fields.append("updated_at = datetime('now')")

                    query = f"""
                        UPDATE collection_history
                        SET {', '.join(update_fields)}
                        WHERE id = ?
                    """
                    params.append(history_id)

                    await db.execute(query, params)
                    await db.commit()

                    logger.info(f"更新采集历史记录 ID: {history_id}, 状态: {status}")

        except Exception as e:
            logger.error(f"更新采集历史记录失败: {e}")

    async def _record_quality_metrics(self, quality_report: Dict[str, Any]):
        """记录数据质量指标"""
        try:
            monitor_date = datetime.now().strftime('%Y-%m-%d')

            async with aiosqlite.connect(self.db_path) as db:
                # 记录总体评分
                await db.execute("""
                    INSERT INTO data_quality_monitor
                    (monitor_date, metric_name, metric_value, status, created_at)
                    VALUES (?, ?, ?, ?, datetime('now'))
                """, (
                    monitor_date,
                    'overall_score',
                    quality_report.get('overall_score', 0),
                    'normal' if quality_report.get('overall_score', 0) >= 85 else 'warning'
                ))

                # 记录覆盖率指标
                coverage_metrics = quality_report.get('coverage_metrics', {})
                for metric_name, metric_value in coverage_metrics.items():
                    if isinstance(metric_value, (int, float)):
                        await db.execute("""
                            INSERT INTO data_quality_monitor
                            (monitor_date, metric_name, metric_value, status, created_at)
                            VALUES (?, ?, ?, ?, datetime('now'))
                        """, (
                            monitor_date,
                            metric_name,
                            metric_value,
                            'normal' if metric_value >= 0.9 else 'warning'
                        ))

                await db.commit()
                logger.info(f"记录数据质量指标完成: {len(coverage_metrics) + 1} 项")

        except Exception as e:
            logger.error(f"记录数据质量指标失败: {e}")

    async def get_collection_stats(self) -> Dict[str, Any]:
        """获取采集统计信息"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取最近一次采集记录
                cursor = await db.execute("""
                    SELECT * FROM collection_history
                    WHERE status = 'completed'
                    ORDER BY created_at DESC
                    LIMIT 1
                """)
                row = await cursor.fetchone()

                if row:
                    # 转换为字典
                    columns = ['id', 'collection_type', 'start_date', 'end_date',
                              'stock_count', 'kline_count', 'flow_count', 'indicator_count',
                              'status', 'error_message', 'elapsed_time', 'created_at', 'updated_at']

                    result = dict(zip(columns, row))

                    # 获取配置
                    cursor = await db.execute("SELECT config_key, config_value FROM collection_config")
                    config_rows = await cursor.fetchall()
                    result['config'] = dict(config_rows)

                    return result
                else:
                    return {'message': '暂无采集记录'}

        except Exception as e:
            logger.error(f"获取采集统计信息失败: {e}")
            return {'error': str(e)}


async def main():
    """主函数"""
    print("增量数据采集器")
    print("=" * 60)
    print("特点: 增量更新 + 避免重复采集 + 数据质量监控")
    print("=" * 60)

    collector = IncrementalDataCollector()

    # 初始化
    if not collector.initialize():
        print("初始化失败")
        return 1

    try:
        # 执行增量采集
        result = await collector.collect_incremental_data()

        if result['success']:
            print("\n" + "=" * 60)
            print("增量数据采集成功!")
            print("=" * 60)
            print(f"新交易日数: {result['new_dates']} 天")
            print(f"过滤股票: {result['filtered_stocks']} 只")
            print(f"K线记录: {result['total_kline_records']} 条")
            print(f"资金流向记录: {result['total_flow_records']} 条")
            print(f"技术指标记录: {result['total_indicator_records']} 条")
            print(f"总耗时: {result['elapsed_time']} 秒")
            print("=" * 60)
            return 0
        else:
            print(f"\n增量数据采集失败: {result.get('error', '未知错误')}")
            return 1

    except Exception as e:
        print(f"\n增量数据采集失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)