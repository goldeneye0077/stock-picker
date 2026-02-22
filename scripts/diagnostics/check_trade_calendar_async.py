#!/usr/bin/env python3
"""
异步检查交易日历
"""

import asyncio
import sys
from pathlib import Path
from datetime import datetime, timedelta

# 添加项目路径
sys.path.append(str(Path(__file__).parent / "data-service" / "src"))

async def check_trade_calendar_async():
    """异步检查交易日历"""
    print("=== 检查交易日历 ===")

    try:
        from data_sources.tushare_client import TushareClient
        client = TushareClient()

        # 获取最近10天的交易日历
        end_date = datetime.now().strftime("%Y%m%d")
        start_date = (datetime.now() - timedelta(days=10)).strftime("%Y%m%d")

        print(f"检查日期范围: {start_date} 到 {end_date}")

        # 获取交易日历
        trade_cal = await client.get_trade_cal(start_date=start_date, end_date=end_date)

        if trade_cal is not None and not trade_cal.empty:
            print("\n最近10天交易日历:")
            for _, row in trade_cal.iterrows():
                date_str = row['cal_date']
                is_open = row['is_open']
                status = "开市" if is_open == 1 else "休市"
                print(f"  {date_str}: {status}")
        else:
            print("无法获取交易日历数据")

        # 检查今天是否是交易日
        today = datetime.now().strftime("%Y%m%d")
        print(f"\n今天 ({today}) 是否是交易日?")

        # 直接调用Tushare API检查今天数据
        print("\n尝试获取今天的数据...")
        today_data = await client.get_daily_data_by_date(today)

        if today_data is not None and not today_data.empty:
            print(f"✅ 今天有数据，记录数: {len(today_data)}")
            print(f"股票代码示例: {today_data['ts_code'].head(5).tolist()}")
        else:
            print("❌ 今天没有数据（可能不是交易日或数据未更新）")

    except Exception as e:
        print(f"检查失败: {e}")
        import traceback
        traceback.print_exc()

async def check_latest_data_async():
    """检查最新数据"""
    print("\n=== 检查最新数据 ===")

    import sqlite3
    db_path = "data/stock_picker.db"

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 检查K线数据最新日期
        cursor.execute("SELECT MAX(date) FROM klines")
        latest_kline_date = cursor.fetchone()[0]

        # 检查今日日期
        today = datetime.now().strftime("%Y-%m-%d")

        print(f"K线数据最新日期: {latest_kline_date}")
        print(f"今日日期: {today}")

        if latest_kline_date == today:
            print("✅ 数据已更新到今日")
        else:
            print(f"❌ 数据未更新到今日，差 {latest_kline_date} -> {today}")

        # 检查最近有数据的日期
        cursor.execute("SELECT date FROM klines GROUP BY date ORDER BY date DESC LIMIT 5")
        recent_dates = cursor.fetchall()

        print("\n最近5个有数据的日期:")
        for date_tuple in recent_dates:
            print(f"  {date_tuple[0]}")

        conn.close()

    except Exception as e:
        print(f"检查数据库失败: {e}")

async def main():
    """主函数"""
    await check_trade_calendar_async()
    await check_latest_data_async()

if __name__ == "__main__":
    asyncio.run(main())