#!/usr/bin/env python3
"""
统一数据采集器（修复版）
解决数据不匹配问题，确保K线和资金流向数据一致性
修复了异步调用问题
"""

import asyncio
import aiosqlite
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import logging
from typing import List, Dict, Tuple, Optional

# 导入重试工具
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


class UnifiedDataCollectorFixed:
    """统一数据采集器（修复版）"""

    def __init__(self, db_path: str = "data/stock_picker.db"):
        self.db_path = db_path
        self.tushare_client = None
        self.validator = DataValidator(db_path)

        # 配置参数
        self.max_retries = 3
        self.retry_delay = 2.0
        self.batch_size = 100

        # 股票过滤规则
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

    def initialize(self) -> bool:
        """初始化采集器"""
        print("初始化统一数据采集器...")

        try:
            # 初始化 Tushare 客户端
            self.tushare_client = TushareClient()
            if not self.tushare_client.is_available():
                logger.error("Tushare 客户端不可用，请检查 token 配置")
                return False

            # 确保数据库目录存在
            os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

            logger.info("统一数据采集器初始化成功")
            return True

        except Exception as e:
            logger.error(f"初始化失败: {e}")
            return False

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

    async def collect_stock_basic_info(self, filtered_stocks: List[Tuple[str, str]]) -> int:
        """
        采集股票基本信息，使用过滤后的股票列表

        Args:
            filtered_stocks: 过滤后的股票列表

        Returns:
            成功插入的股票数量
        """
        print("采集股票基本信息...")

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                inserted_count = 0
                for code, exchange in filtered_stocks:
                    try:
                        await cursor.execute("""
                            INSERT OR REPLACE INTO stocks
                            (code, name, exchange, industry, created_at, updated_at)
                            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                        """, (
                            code,
                            f"股票{code}",  # 这里应该从API获取实际名称
                            exchange,
                            ""  # 这里应该从API获取实际行业
                        ))
                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入股票 {code}.{exchange} 失败: {e}")

                await db.commit()
                logger.info(f"股票基本信息采集完成: {inserted_count} 只")
                return inserted_count

        except Exception as e:
            logger.error(f"采集股票基本信息失败: {e}")
            return 0

    async def collect_daily_data_unified(self, trade_date: str, filtered_stocks: List[Tuple[str, str]]) -> int:
        """
        统一采集指定交易日的日线数据

        Args:
            trade_date: 交易日期 (YYYYMMDD)
            filtered_stocks: 过滤后的股票列表

        Returns:
            成功插入的K线记录数
        """
        print(f"统一采集 {trade_date} 日线数据...")

        try:
            # 使用批量接口获取数据
            df = await self.tushare_client.get_daily_data_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无日线数据")
                return 0

            # 过滤数据，只保留过滤股票列表中的股票
            filtered_records = []
            for _, row in df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                # 检查是否在过滤列表中
                if (code, exchange) in filtered_stocks:
                    filtered_records.append(row)

            logger.info(f"日线数据过滤: 原始{len(df)}条 -> 过滤后{len(filtered_records)}条")

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()
                inserted_count = 0

                for row in filtered_records:
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        await cursor.execute("""
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
                            int(row['vol'] * 100),  # 转换为股数
                            float(row['amount'] * 1000)  # 转换为元
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

    async def collect_moneyflow_data_unified(self, trade_date: str, filtered_stocks: List[Tuple[str, str]]) -> int:
        """
        统一采集指定交易日的资金流向数据

        Args:
            trade_date: 交易日期 (YYYYMMDD)
            filtered_stocks: 过滤后的股票列表

        Returns:
            成功插入的资金流向记录数
        """
        print(f"统一采集 {trade_date} 资金流向数据...")

        try:
            # 使用批量接口获取数据
            df = await self.tushare_client.get_moneyflow_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无资金流向数据")
                return 0

            # 过滤数据，只保留过滤股票列表中的股票
            filtered_records = []
            for _, row in df.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                # 检查是否在过滤列表中
                if (code, exchange) in filtered_stocks:
                    filtered_records.append(row)

            logger.info(f"资金流向数据过滤: 原始{len(df)}条 -> 过滤后{len(filtered_records)}条")

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()
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

                        await cursor.execute("""
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

    async def ensure_hot_stock_data(self, trade_date: str):
        """
        确保热门股票数据完整
        如果批量接口没有返回热门股票数据，单独采集

        Args:
            trade_date: 交易日期 (YYYYMMDD)
        """
        print(f"确保热门股票数据完整 ({trade_date})...")

        try:
            trade_date_str = trade_date[:4] + '-' + trade_date[4:6] + '-' + trade_date[6:8]

            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                for stock_code, exchange in self.hot_stocks:
                    ts_code = f"{stock_code}.{exchange}"

                    # 检查K线数据
                    await cursor.execute("""
                        SELECT COUNT(*) FROM klines
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, trade_date_str))
                    has_kline = (await cursor.fetchone())[0] > 0

                    # 检查资金流向数据
                    await cursor.execute("""
                        SELECT COUNT(*) FROM fund_flow
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, trade_date_str))
                    has_flow = (await cursor.fetchone())[0] > 0

                    if has_kline and has_flow:
                        continue  # 数据完整，跳过

                    logger.info(f"补充采集热门股票 {ts_code}")

                    # 补充采集K线数据
                    if not has_kline:
                        try:
                            df = await self.tushare_client.get_daily_data(
                                ts_code,
                                start_date=trade_date,
                                end_date=trade_date
                            )

                            if df is not None and not df.empty:
                                for _, row in df.iterrows():
                                    try:
                                        await cursor.execute("""
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
                                    except Exception as e:
                                        logger.warning(f"插入K线 {ts_code} 失败: {e}")

                                await db.commit()
                                logger.info(f"补充 {ts_code} K线数据成功")

                        except Exception as e:
                            logger.error(f"补充K线数据 {ts_code} 失败: {e}")

                    # 补充采集资金流向数据
                    if not has_flow:
                        try:
                            df = await self.tushare_client.get_moneyflow_dc(
                                ts_code=ts_code,
                                trade_date=trade_date
                            )

                            if df is not None and not df.empty:
                                for _, row in df.iterrows():
                                    try:
                                        # 计算大单占比（使用DC接口的字段）
                                        # 超大单：buy_elg_amount, sell_elg_amount
                                        # 大单：buy_lg_amount, sell_lg_amount
                                        # 中单：buy_md_amount, sell_md_amount
                                        # 小单：buy_sm_amount, sell_sm_amount

                                        total_amount = abs(row.get('buy_lg_amount', 0)) + abs(row.get('sell_lg_amount', 0)) + \
                                                     abs(row.get('buy_elg_amount', 0)) + abs(row.get('sell_elg_amount', 0))
                                        small_amount = abs(row.get('buy_sm_amount', 0)) + abs(row.get('sell_sm_amount', 0)) + \
                                                     abs(row.get('buy_md_amount', 0)) + abs(row.get('sell_md_amount', 0))

                                        large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0

                                        # 计算主力资金净流入（超大单+大单净流入）
                                        main_fund_flow = row.get('net_elg_amount', 0) + row.get('net_lg_amount', 0)
                                        # 散户资金净流入（小单净流入）
                                        retail_fund_flow = row.get('net_sm_amount', 0)
                                        # 机构资金净流入（超大单净流入）
                                        institutional_flow = row.get('net_elg_amount', 0)

                                        await cursor.execute("""
                                            INSERT OR REPLACE INTO fund_flow
                                            (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                                        """, (
                                            stock_code,
                                            row['trade_date'].strftime('%Y-%m-%d'),
                                            float(main_fund_flow),
                                            float(retail_fund_flow),
                                            float(institutional_flow),
                                            round(large_order_ratio, 4)
                                        ))
                                    except Exception as e:
                                        logger.warning(f"插入资金流向 {ts_code} 失败: {e}")

                                await db.commit()
                                logger.info(f"补充 {ts_code} 资金流向数据成功")

                        except Exception as e:
                            logger.error(f"补充资金流向数据 {ts_code} 失败: {e}")

                    # API限流
                    await asyncio.sleep(0.5)

            logger.info("热门股票数据完整性检查完成")

        except Exception as e:
            logger.error(f"确保热门股票数据完整失败: {e}")

    async def get_trading_days(self, days: int = 7) -> List[str]:
        """
        获取最近N个交易日的日期列表

        Args:
            days: 需要获取的天数

        Returns:
            交易日列表，格式 ['20250930', '20250929', ...]
        """
        print(f"获取最近 {days} 天的交易日历...")

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
                return [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]

            # 筛选出交易日
            trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
            trading_days = [d.strftime('%Y%m%d') for d in sorted(trading_days, reverse=True)]

            # 取最近的N个交易日
            result = trading_days[:days]
            logger.info(f"找到 {len(result)} 个交易日")
            return result

        except Exception as e:
            logger.error(f"获取交易日历失败: {e}")
            end_date = datetime.now()
            return [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]

    async def collect_data_for_days(self, days: int = 7) -> Dict[str, any]:
        """
        统一采集最近N天的数据

        Args:
            days: 采集天数

        Returns:
            采集统计信息
        """
        print(f"开始统一采集最近 {days} 天数据...")
        start_time = time.time()

        try:
            # 1. 获取交易日历
            trading_days = await self.get_trading_days(days)
            if not trading_days:
                logger.error("无法获取交易日历")
                return {'success': False, 'error': '无法获取交易日历'}

            # 2. 获取过滤后的股票列表
            filtered_stocks = await self.get_filtered_stock_list()
            if not filtered_stocks:
                logger.error("无法获取股票列表")
                return {'success': False, 'error': '无法获取股票列表'}

            # 3. 采集股票基本信息
            stock_count = await self.collect_stock_basic_info(filtered_stocks)

            # 4. 按日期采集数据
            total_kline_records = 0
            total_flow_records = 0

            for i, trade_date in enumerate(trading_days, 1):
                logger.info(f"[{i}/{len(trading_days)}] 采集 {trade_date} 数据")

                # 采集日线数据
                kline_count = await self.collect_daily_data_unified(trade_date, filtered_stocks)
                total_kline_records += kline_count

                # 采集资金流向数据
                flow_count = await self.collect_moneyflow_data_unified(trade_date, filtered_stocks)
                total_flow_records += flow_count

                # 确保热门股票数据完整
                await self.ensure_hot_stock_data(trade_date)

                # API限流
                await asyncio.sleep(0.5)

            # 5. 验证数据质量
            logger.info("开始验证数据质量...")
            quality_report = await self.validator.generate_quality_report()

            # 6. 统计信息
            elapsed_time = time.time() - start_time

            result = {
                'success': True,
                'trading_days': len(trading_days),
                'filtered_stocks': len(filtered_stocks),
                'stock_count': stock_count,
                'total_kline_records': total_kline_records,
                'total_flow_records': total_flow_records,
                'elapsed_time': round(elapsed_time, 1),
                'quality_score': quality_report['overall_score'],
                'quality_level': quality_report['quality_level'],
                'kline_coverage': quality_report['coverage_metrics']['avg_kline_coverage'],
                'flow_coverage': quality_report['coverage_metrics']['avg_flow_coverage']
            }

            logger.info("数据采集完成!")
            return result

        except Exception as e:
            logger.error(f"数据采集失败: {e}")
            return {'success': False, 'error': str(e)}


async def main():
    """主函数"""
    print("统一数据采集器（修复版）")
    print("=" * 60)
    print("特点: 统一采集逻辑 + 热门股票保障 + 数据一致性")
    print("=" * 60)

    collector = UnifiedDataCollectorFixed()

    # 初始化
    if not collector.initialize():
        print("初始化失败")
        return 1

    try:
        # 采集最近7天数据
        result = await collector.collect_data_for_days(days=7)

        if result['success']:
            print("\n" + "=" * 60)
            print("数据采集成功!")
            print("=" * 60)
            print(f"交易日数: {result['trading_days']} 天")
            print(f"过滤股票: {result['filtered_stocks']} 只")
            print(f"K线记录: {result['total_kline_records']} 条")
            print(f"资金流向记录: {result['total_flow_records']} 条")
            print(f"数据质量评分: {result['quality_score']}/100 ({result['quality_level']})")
            print(f"K线覆盖率: {result['kline_coverage']:.1%}")
            print(f"资金流向覆盖率: {result['flow_coverage']:.1%}")
            print(f"总耗时: {result['elapsed_time']} 秒")
            print("=" * 60)
            return 0
        else:
            print(f"\n数据采集失败: {result.get('error', '未知错误')}")
            return 1

    except Exception as e:
        print(f"\n数据采集失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)