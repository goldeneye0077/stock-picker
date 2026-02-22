#!/usr/bin/env python3
"""
检查数据库最新数据日期
"""

import sqlite3
from datetime import datetime

def check_latest_data():
    """检查数据库最新数据"""
    db_path = "data/stock_picker.db"

    print("=== 检查数据库最新数据 ===")
    print(f"数据库路径: {db_path}")

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()

        # 1. 检查股票数量
        cursor.execute("SELECT COUNT(*) FROM stocks")
        stock_count = cursor.fetchone()[0]
        print(f"1. 股票总数: {stock_count}")

        # 2. 检查K线数据最新日期
        cursor.execute("SELECT MAX(date) FROM klines")
        latest_kline_date = cursor.fetchone()[0]
        print(f"2. K线数据最新日期: {latest_kline_date}")

        # 3. 检查K线数据数量
        cursor.execute("SELECT COUNT(*) FROM klines")
        kline_count = cursor.fetchone()[0]
        print(f"3. K线数据总数: {kline_count}")

        # 4. 检查每日基本面数据最新日期
        cursor.execute("SELECT MAX(trade_date) FROM daily_basic")
        latest_basic_date = cursor.fetchone()[0]
        print(f"4. 基本面数据最新日期: {latest_basic_date}")

        # 5. 检查资金流向数据最新日期
        cursor.execute("SELECT MAX(date) FROM fund_flow")
        latest_flow_date = cursor.fetchone()[0]
        print(f"5. 资金流向数据最新日期: {latest_flow_date}")

        # 6. 检查今日日期
        today = datetime.now().strftime("%Y-%m-%d")
        print(f"6. 今日日期: {today}")

        # 7. 判断数据是否最新
        print(f"\n=== 数据状态分析 ===")
        if latest_kline_date == today:
            print("✅ K线数据已更新到今日")
        else:
            print(f"❌ K线数据未更新到今日，最新日期: {latest_kline_date}")

        if latest_basic_date == today:
            print("✅ 基本面数据已更新到今日")
        else:
            print(f"❌ 基本面数据未更新到今日，最新日期: {latest_basic_date}")

        # 8. 检查最近5天的数据分布
        print(f"\n=== 最近5天数据分布 ===")
        cursor.execute("""
            SELECT date, COUNT(*) as count
            FROM klines
            WHERE date >= date('now', '-5 days')
            GROUP BY date
            ORDER BY date DESC
        """)
        recent_data = cursor.fetchall()

        if recent_data:
            for date, count in recent_data:
                print(f"  {date}: {count} 条记录")
        else:
            print("  最近5天没有数据")

        conn.close()

    except Exception as e:
        print(f"检查数据库失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_latest_data()