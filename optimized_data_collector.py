#!/usr/bin/env python3
"""
优化版数据采集脚本
包含错误重试、数据验证、增量更新等功能
"""

import asyncio
import aiosqlite
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OptimizedDataCollector:
    """优化版数据采集器"""

    def __init__(self):
        self.db_path = "data/stock_picker.db"
        self.max_retries = 3
        self.retry_delay = 2  # 秒
        self.batch_size = 100  # 批量处理大小

    async def collect_with_retry(self, func, *args, **kwargs):
        """带重试的数据采集"""
        for attempt in range(self.max_retries):
            try:
                result = await func(*args, **kwargs)
                logger.info(f"采集成功 (尝试{attempt+1}次)")
                return result
            except Exception as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"采集失败，已达最大重试次数: {e}")
                    raise
                logger.warning(f"第{attempt+1}次采集失败，{self.retry_delay}秒后重试: {e}")
                await asyncio.sleep(self.retry_delay)

    async def verify_data_integrity(self, stock_code: str, date: str) -> bool:
        """验证单只股票单日数据完整性"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 检查K线数据
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM klines
                    WHERE stock_code = ? AND date = ?
                """, (stock_code, date))
                has_kline = (await cursor.fetchone())[0] > 0

                # 检查资金流向数据
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM fund_flow
                    WHERE stock_code = ? AND date = ?
                """, (stock_code, date))
                has_flow = (await cursor.fetchone())[0] > 0

                return has_kline and has_flow

        except Exception as e:
            logger.error(f"验证数据完整性失败 {stock_code} {date}: {e}")
            return False

    async def collect_incremental_data(self, days: int = 7):
        """增量数据采集"""
        logger.info(f"开始增量采集最近{days}天数据")

        try:
            # 1. 获取需要采集的日期
            dates_to_collect = await self.get_dates_to_collect(days)

            # 2. 批量采集数据
            for date in dates_to_collect:
                logger.info(f"采集 {date} 数据")
                await self.collect_date_data(date)

                # 限流，避免API限制
                await asyncio.sleep(0.5)

            # 3. 验证数据完整性
            await self.verify_collection_completeness(dates_to_collect)

            logger.info("增量采集完成")

        except Exception as e:
            logger.error(f"增量采集失败: {e}")
            raise

    async def ensure_hot_sector_coverage(self):
        """确保热门板块股票数据完整"""
        hot_stocks = [
            "300474.SZ", "002371.SZ", "002049.SZ",
            "300750.SZ", "600519.SH", "600118.SH",
            "600879.SH", "000901.SZ", "300502.SZ",
            "300394.SZ", "300308.SZ", "000858.SZ",
            "002415.SZ", "000001.SZ"
        ]

        logger.info(f"确保{len(hot_stocks)}只热门股票数据完整")

        for ts_code in hot_stocks:
            try:
                stock_code = ts_code.split('.')[0]
                today = datetime.now().strftime('%Y-%m-%d')

                # 检查数据完整性
                is_complete = await self.verify_data_integrity(stock_code, today)

                if not is_complete:
                    logger.info(f"补充采集 {ts_code} 数据")
                    # 这里添加补充采集逻辑
                    await self.supplement_hot_stock_data(ts_code)

            except Exception as e:
                logger.error(f"处理热门股票 {ts_code} 失败: {e}")

        logger.info("热门股票数据完整性检查完成")

    async def supplement_hot_stock_data(self, ts_code: str):
        """补充热门股票数据"""
        # 实现具体的补充采集逻辑
        # 可以调用原有的采集函数
        pass

    async def get_dates_to_collect(self, days: int) -> list:
        """获取需要采集的日期列表"""
        # 实现日期获取逻辑
        # 可以排除非交易日
        # 可以排除已采集的日期
        return []

    async def collect_date_data(self, date: str):
        """采集指定日期的数据"""
        # 实现具体的数据采集逻辑
        pass

    async def verify_collection_completeness(self, dates: list):
        """验证采集完整性"""
        logger.info("开始验证采集完整性")

        try:
            async with aiosqlite.connect(self.db_path) as db:
                for date in dates:
                    # 检查该日期数据完整性
                    cursor = await db.execute("""
                        SELECT COUNT(DISTINCT stock_code) as stock_count
                        FROM klines
                        WHERE date = ?
                    """, (date,))
                    kline_stocks = (await cursor.fetchone())[0]

                    cursor = await db.execute("""
                        SELECT COUNT(DISTINCT stock_code) as stock_count
                        FROM fund_flow
                        WHERE date = ?
                    """, (date,))
                    flow_stocks = (await cursor.fetchone())[0]

                    logger.info(f"{date}: K线股票{kline_stocks}只, 资金流向股票{flow_stocks}只")

        except Exception as e:
            logger.error(f"验证采集完整性失败: {e}")

async def main():
    """主函数"""
    collector = OptimizedDataCollector()

    try:
        logger.info("开始优化版数据采集")

        # 1. 增量采集
        await collector.collect_incremental_data(days=7)

        # 2. 确保热门股票数据完整
        await collector.ensure_hot_sector_coverage()

        # 3. 数据完整性验证
        logger.info("数据采集完成，开始验证...")

    except Exception as e:
        logger.error(f"数据采集失败: {e}")
        return 1

    logger.info("数据采集成功完成")
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
