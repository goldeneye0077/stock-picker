"""
生成模拟资金流向数据
用于测试或演示（当无法访问 Tushare 资金流向接口时）
"""
import sqlite3
from datetime import datetime, timedelta
import random

DB_PATH = 'data/stock_picker.db'

def generate_mock_fund_flow_data():
    """生成模拟的资金流向数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 获取所有股票代码
    cursor.execute("SELECT code FROM stocks")
    stocks = [row[0] for row in cursor.fetchall()]

    print(f"找到 {len(stocks)} 只股票")

    # 生成最近 30 天的数据
    end_date = datetime.now()
    dates = []
    for i in range(30):
        date = end_date - timedelta(days=i)
        # 跳过周末
        if date.weekday() < 5:  # 0-4 是周一到周五
            dates.append(date.strftime('%Y-%m-%d'))

    print(f"将生成 {len(dates)} 个交易日的数据")

    # 清除旧的模拟数据
    cursor.execute("DELETE FROM fund_flow WHERE date > '2025-09-30'")
    print(f"清除了 {cursor.rowcount} 条旧数据")

    total_inserted = 0

    # 为每只股票每个交易日生成模拟数据
    for date in dates:
        batch_data = []
        for stock_code in stocks:
            # 生成随机但合理的资金流向数据
            main_fund_flow = random.uniform(-50000000, 50000000)  # -5000万到5000万
            retail_fund_flow = -main_fund_flow * random.uniform(0.6, 1.4)  # 散户资金与主力相反
            institutional_flow = random.uniform(-30000000, 30000000)  # 机构资金
            large_order_ratio = random.uniform(0.1, 0.5)  # 大单比例 10%-50%

            batch_data.append((
                stock_code,
                date,
                main_fund_flow,
                retail_fund_flow,
                institutional_flow,
                large_order_ratio
            ))

        # 批量插入
        cursor.executemany("""
            INSERT OR REPLACE INTO fund_flow
            (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """, batch_data)

        total_inserted += len(batch_data)
        print(f"  {date}: 插入 {len(batch_data)} 条数据")

    conn.commit()
    conn.close()

    print(f"\n✅ 模拟数据生成完成！")
    print(f"   总共生成: {total_inserted} 条资金流向数据")
    print(f"   日期范围: {dates[-1]} 到 {dates[0]}")
    print(f"\n⚠️  注意：这些是模拟数据，仅用于测试和演示！")

if __name__ == "__main__":
    import sys

    print("=" * 60)
    print("生成模拟资金流向数据")
    print("=" * 60)
    print()

    # 支持命令行参数 --yes 跳过确认
    if '--yes' in sys.argv or '-y' in sys.argv:
        generate_mock_fund_flow_data()
    else:
        confirm = input("确认生成模拟数据？这将替换现有的最近 30 天数据 (y/n): ")
        if confirm.lower() == 'y':
            generate_mock_fund_flow_data()
        else:
            print("操作已取消")
