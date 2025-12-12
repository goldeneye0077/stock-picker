#!/usr/bin/env python3
"""
今日数据更新脚本
专门用于快速更新今日数据
"""

import asyncio
import aiosqlite
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import logging

# 添加项目路径
sys.path.append('data-service/src')

# 加载 .env 文件
from dotenv import load_dotenv
env_path = Path(__file__).parent / 'data-service' / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    print(f"已加载配置文件: {env_path}")
else:
    print(f"警告: 未找到配置文件 {env_path}")

from data_sources.tushare_client import TushareClient

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class TodayDataUpdater:
    """今日数据更新器"""

    def __init__(self, db_path: str = "data/stock_picker.db"):
        self.db_path = db_path
        self.tushare_client = TushareClient()

    async def get_today_trading_day(self) -> str:
        """获取今日交易日"""
        try:
            # 获取最近7天的交易日历
            end_date = datetime.now()
            start_date = end_date - timedelta(days=7)

            cal_df = await self.tushare_client.get_trade_cal(
                start_date.strftime('%Y%m%d'),
                end_date.strftime('%Y%m%d')
            )

            if cal_df is None or cal_df.empty:
                logger.warning("无法获取交易日历")
                return None

            # 筛选出交易日
            trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
            trading_days = [d.strftime('%Y%m%d') for d in sorted(trading_days, reverse=True)]

            # 检查今天是否是交易日
            today = datetime.now().strftime('%Y%m%d')
            if today in trading_days:
                return today
            else:
                # 返回最近交易日
                return trading_days[0] if trading_days else None

        except Exception as e:
            logger.error(f"获取交易日失败: {e}")
            return None

    async def update_today_kline_data(self, trade_date: str) -> int:
        """更新今日K线数据"""
        print(f"更新 {trade_date} K线数据...")

        try:
            # 获取今日数据
            df = await self.tushare_client.get_daily_data_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无日线数据")
                return 0

            print(f"获取到 {len(df)} 条日线数据")

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()
                inserted_count = 0

                for _, row in df.iterrows():
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
                            float(row['vol']),
                            float(row['amount']),
                        ))

                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入股票 {code} 数据失败: {e}")
                        continue

                await db.commit()
                print(f"成功插入 {inserted_count} 条K线记录")
                return inserted_count

        except Exception as e:
            logger.error(f"更新K线数据失败: {e}")
            return 0

    async def update_today_moneyflow_data(self, trade_date: str) -> int:
        """更新今日资金流向数据"""
        print(f"更新 {trade_date} 资金流向数据...")

        try:
            # 获取资金流向数据
            df = await self.tushare_client.get_moneyflow_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无资金流向数据")
                return 0

            print(f"获取到 {len(df)} 条资金流向数据")

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()
                inserted_count = 0

                for _, row in df.iterrows():
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        # 检查字段是否存在，使用安全的获取方式
                        def safe_get(row, key, default=0.0):
                            try:
                                return float(row[key])
                            except (KeyError, ValueError):
                                return default

                        await cursor.execute("""
                            INSERT OR REPLACE INTO fund_flow
                            (stock_code, date, buy_sm_vol, buy_sm_amount, sell_sm_vol, sell_sm_amount,
                             buy_md_vol, buy_md_amount, sell_md_vol, sell_md_amount,
                             buy_lg_vol, buy_lg_amount, sell_lg_vol, sell_lg_amount,
                             buy_elg_vol, buy_elg_amount, sell_elg_vol, sell_elg_amount,
                             net_mf_vol, net_mf_amount, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            code,
                            trade_date_str,
                            safe_get(row, 'buy_sm_vol'),
                            safe_get(row, 'buy_sm_amount'),
                            safe_get(row, 'sell_sm_vol'),
                            safe_get(row, 'sell_sm_amount'),
                            safe_get(row, 'buy_md_vol'),
                            safe_get(row, 'buy_md_amount'),
                            safe_get(row, 'sell_md_vol'),
                            safe_get(row, 'sell_md_amount'),
                            safe_get(row, 'buy_lg_vol'),
                            safe_get(row, 'buy_lg_amount'),
                            safe_get(row, 'sell_lg_vol'),
                            safe_get(row, 'sell_lg_amount'),
                            safe_get(row, 'buy_elg_vol'),
                            safe_get(row, 'buy_elg_amount'),
                            safe_get(row, 'sell_elg_vol'),
                            safe_get(row, 'sell_elg_amount'),
                            safe_get(row, 'net_mf_vol'),
                            safe_get(row, 'net_mf_amount'),
                        ))

                        inserted_count += 1

                    except Exception as e:
                        logger.warning(f"插入股票 {code} 资金流向数据失败: {e}")
                        continue

                await db.commit()
                print(f"成功插入 {inserted_count} 条资金流向记录")
                return inserted_count

        except Exception as e:
            logger.error(f"更新资金流向数据失败: {e}")
            return 0

    async def run(self) -> dict:
        """运行今日数据更新"""
        print("=" * 60)
        print("今日数据更新脚本")
        print("=" * 60)

        start_time = time.time()

        try:
            # 1. 获取今日交易日
            trade_date = await self.get_today_trading_day()
            if not trade_date:
                return {'success': False, 'error': '无法获取交易日'}

            print(f"目标交易日: {trade_date}")

            # 2. 更新K线数据
            kline_count = await self.update_today_kline_data(trade_date)

            # 3. 更新资金流向数据
            flow_count = await self.update_today_moneyflow_data(trade_date)

            # 4. 统计结果
            elapsed_time = time.time() - start_time

            result = {
                'success': True,
                'trade_date': trade_date,
                'kline_records': kline_count,
                'flow_records': flow_count,
                'elapsed_time': round(elapsed_time, 1)
            }

            print("\n" + "=" * 60)
            print("今日数据更新完成!")
            print(f"交易日: {trade_date}")
            print(f"K线记录: {kline_count} 条")
            print(f"资金流向记录: {flow_count} 条")
            print(f"总耗时: {elapsed_time:.1f} 秒")
            print("=" * 60)

            return result

        except Exception as e:
            logger.error(f"今日数据更新失败: {e}")
            return {'success': False, 'error': str(e)}


async def main():
    """主函数"""
    updater = TodayDataUpdater()
    result = await updater.run()

    # 返回结果给调用者
    return result


if __name__ == "__main__":
    result = asyncio.run(main())

    # 退出码：0表示成功，1表示失败
    exit_code = 0 if result.get('success') else 1
    exit(exit_code)