#!/usr/bin/env python3
"""
今日K线数据更新脚本
专门用于快速更新今日K线数据（选股最需要的数据）
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


class TodayKlineUpdater:
    """今日K线数据更新器"""

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

    async def update_today_kline_data(self, trade_date: str) -> dict:
        """更新今日K线数据"""
        print(f"更新 {trade_date} K线数据...")
        start_time = time.time()

        try:
            # 获取今日数据
            df = await self.tushare_client.get_daily_data_by_date(trade_date)

            if df is None or df.empty:
                logger.warning(f"{trade_date} 无日线数据")
                return {'success': False, 'error': f'{trade_date} 无日线数据'}

            print(f"获取到 {len(df)} 条日线数据")

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()
                inserted_count = 0
                updated_count = 0
                error_count = 0

                for _, row in df.iterrows():
                    try:
                        code = row['ts_code'].split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        # 检查是否已存在
                        await cursor.execute(
                            "SELECT COUNT(*) FROM klines WHERE stock_code = ? AND date = ?",
                            (code, trade_date_str)
                        )
                        exists = (await cursor.fetchone())[0] > 0

                        if exists:
                            # 更新现有记录
                            await cursor.execute("""
                                UPDATE klines SET
                                    open = ?, high = ?, low = ?, close = ?,
                                    volume = ?, amount = ?, created_at = datetime('now')
                                WHERE stock_code = ? AND date = ?
                            """, (
                                float(row['open']),
                                float(row['high']),
                                float(row['low']),
                                float(row['close']),
                                float(row['vol']),
                                float(row['amount']),
                                code,
                                trade_date_str
                            ))
                            updated_count += 1
                        else:
                            # 插入新记录
                            await cursor.execute("""
                                INSERT INTO klines
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
                        error_count += 1
                        if error_count <= 10:  # 只打印前10个错误
                            logger.warning(f"处理股票 {code} 数据失败: {e}")
                        continue

                await db.commit()

                elapsed_time = time.time() - start_time

                result = {
                    'success': True,
                    'trade_date': trade_date,
                    'total_records': len(df),
                    'inserted': inserted_count,
                    'updated': updated_count,
                    'errors': error_count,
                    'elapsed_time': round(elapsed_time, 1)
                }

                print(f"\n更新完成!")
                print(f"交易日: {trade_date}")
                print(f"总记录数: {len(df)} 条")
                print(f"新增记录: {inserted_count} 条")
                print(f"更新记录: {updated_count} 条")
                print(f"错误记录: {error_count} 条")
                print(f"耗时: {elapsed_time:.1f} 秒")

                return result

        except Exception as e:
            logger.error(f"更新K线数据失败: {e}")
            return {'success': False, 'error': str(e)}

    async def verify_update(self, trade_date: str) -> dict:
        """验证更新结果"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                # 检查该日期有多少股票数据
                trade_date_str = datetime.strptime(trade_date, '%Y%m%d').strftime('%Y-%m-%d')
                await cursor.execute(
                    "SELECT COUNT(DISTINCT stock_code) FROM klines WHERE date = ?",
                    (trade_date_str,)
                )
                count = (await cursor.fetchone())[0]

                # 获取样本数据
                await cursor.execute(
                    "SELECT stock_code, close, volume FROM klines WHERE date = ? LIMIT 5",
                    (trade_date_str,)
                )
                samples = await cursor.fetchall()

                return {
                    'success': True,
                    'trade_date': trade_date_str,
                    'stock_count': count,
                    'samples': samples
                }

        except Exception as e:
            logger.error(f"验证更新结果失败: {e}")
            return {'success': False, 'error': str(e)}

    async def run(self) -> dict:
        """运行今日K线数据更新"""
        print("=" * 60)
        print("今日K线数据更新脚本")
        print("=" * 60)

        try:
            # 1. 获取今日交易日
            trade_date = await self.get_today_trading_day()
            if not trade_date:
                return {'success': False, 'error': '无法获取交易日'}

            print(f"目标交易日: {trade_date}")

            # 2. 更新K线数据
            update_result = await self.update_today_kline_data(trade_date)

            if not update_result.get('success'):
                return update_result

            # 3. 验证更新结果
            print("\n验证更新结果...")
            verify_result = await self.verify_update(trade_date)

            if verify_result.get('success'):
                print(f"验证成功! 数据库中有 {verify_result['stock_count']} 只股票的 {trade_date} 数据")
                print("样本数据:")
                for sample in verify_result['samples']:
                    print(f"  {sample[0]}: 收盘价={sample[1]}, 成交量={sample[2]}")

            # 4. 合并结果
            result = {
                'success': True,
                'trade_date': trade_date,
                'update_result': update_result,
                'verify_result': verify_result
            }

            print("\n" + "=" * 60)
            print("今日K线数据更新完成!")
            print("=" * 60)

            return result

        except Exception as e:
            logger.error(f"今日K线数据更新失败: {e}")
            return {'success': False, 'error': str(e)}


async def main():
    """主函数"""
    updater = TodayKlineUpdater()
    result = await updater.run()

    # 返回结果给调用者
    return result


if __name__ == "__main__":
    result = asyncio.run(main())

    # 退出码：0表示成功，1表示失败
    exit_code = 0 if result.get('success') else 1
    exit(exit_code)