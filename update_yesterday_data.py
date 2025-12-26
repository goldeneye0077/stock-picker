#!/usr/bin/env python3
"""
更新昨天数据
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta

# 添加项目路径
sys.path.append(str(Path(__file__).parent / "data-service" / "src"))

async def update_yesterday_data():
    """更新昨天数据"""
    print("=== 更新昨天数据 ===")

    try:
        from data_sources.tushare_client import TushareClient
        from utils.database import get_database

        client = TushareClient()

        # 获取昨天日期
        yesterday = (datetime.now() - timedelta(days=1)).strftime("%Y%m%d")
        print(f"目标日期: {yesterday}")

        # 检查是否已有数据
        async with get_database() as conn:
            cursor = await conn.execute(
                "SELECT COUNT(*) FROM klines WHERE date = ?",
                (yesterday.replace("", "-"),)
            )
            count = (await cursor.fetchone())[0]

        if count > 1000:
            print(f"昨天数据已存在 ({count} 条记录)，跳过更新")
            return True

        # 获取昨天数据
        print("获取昨天K线数据...")
        data = await client.get_daily_data_by_date(yesterday)

        if data is None or data.empty:
            print(f"昨天 ({yesterday}) 没有数据，可能不是交易日")
            # 尝试获取前天数据
            day_before = (datetime.now() - timedelta(days=2)).strftime("%Y%m%d")
            print(f"尝试获取前天数据: {day_before}")
            data = await client.get_daily_data_by_date(day_before)

            if data is None or data.empty:
                print("前天也没有数据")
                return False

        print(f"获取到 {len(data)} 条记录")

        # 保存到数据库
        print("保存到数据库...")
        async with get_database() as conn:
            inserted_count = 0
            for _, row in data.iterrows():
                try:
                    await conn.execute(
                        """
                        INSERT OR REPLACE INTO klines
                        (stock_code, date, open, high, low, close, volume, amount)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            row['ts_code'].replace('.', ''),
                            row['trade_date'],
                            row['open'],
                            row['high'],
                            row['low'],
                            row['close'],
                            row['vol'],
                            row['amount']
                        )
                    )
                    inserted_count += 1
                except Exception as e:
                    print(f"插入数据失败 {row['ts_code']}: {e}")

            await conn.commit()

        print(f"成功插入 {inserted_count} 条记录")

        # 验证
        async with get_database() as conn:
            cursor = await conn.execute(
                "SELECT COUNT(*) FROM klines WHERE date = ?",
                (data.iloc[0]['trade_date'],)
            )
            final_count = (await cursor.fetchone())[0]

        print(f"验证: 数据库中有 {final_count} 条 {data.iloc[0]['trade_date']} 的记录")
        return True

    except Exception as e:
        print(f"更新失败: {e}")
        import traceback
        traceback.print_exc()
        return False

async def check_current_data():
    """检查当前数据"""
    print("\n=== 检查当前数据 ===")

    from utils.database import get_database

    async with get_database() as conn:
        # 检查最新日期
        cursor = await conn.execute("SELECT MAX(date) FROM klines")
        latest_date = (await cursor.fetchone())[0]

        # 检查数据量
        cursor = await conn.execute("SELECT COUNT(*) FROM klines WHERE date = ?", (latest_date,))
        count = (await cursor.fetchone())[0]

        # 检查股票数量
        cursor = await conn.execute("SELECT COUNT(DISTINCT stock_code) FROM klines WHERE date = ?", (latest_date,))
        stock_count = (await cursor.fetchone())[0]

    print(f"最新数据日期: {latest_date}")
    print(f"该日期记录数: {count}")
    print(f"该日期股票数: {stock_count}")

    if count > 1000 and stock_count > 1000:
        print("数据状态: 正常")
    else:
        print("数据状态: 可能不完整")

async def main():
    """主函数"""
    # 先检查当前数据
    await check_current_data()

    # 更新昨天数据
    success = await update_yesterday_data()

    # 再次检查数据
    await check_current_data()

    if success:
        print("\n✅ 数据更新完成")
    else:
        print("\n❌ 数据更新失败")

if __name__ == "__main__":
    asyncio.run(main())