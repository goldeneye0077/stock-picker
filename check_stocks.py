#!/usr/bin/env python3
"""
检查数据库中的股票数据分布
"""

import sqlite3
import os
from pathlib import Path

# 数据库路径
db_path = Path(__file__).parent / "data" / "stock_picker.db"
print(f"数据库路径: {db_path}")
print(f"数据库文件存在: {db_path.exists()}")
print(f"数据库文件大小: {db_path.stat().st_size / 1024 / 1024:.2f} MB")

# 连接数据库
conn = sqlite3.connect(str(db_path))
cursor = conn.cursor()

# 1. 检查表结构
print("\n=== 表结构检查 ===")
cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = cursor.fetchall()
print(f"数据库中的表: {[t[0] for t in tables]}")

# 2. 检查stocks表
print("\n=== stocks表检查 ===")
cursor.execute("SELECT COUNT(*) FROM stocks")
stock_count = cursor.fetchone()[0]
print(f"stocks表记录数: {stock_count}")

if stock_count > 0:
    # 检查股票代码分布
    cursor.execute("""
        SELECT
            CASE
                WHEN code LIKE '000%' THEN '深证主板'
                WHEN code LIKE '002%' THEN '中小板'
                WHEN code LIKE '300%' THEN '创业板'
                WHEN code LIKE '688%' THEN '科创板'
                WHEN code LIKE '60%' THEN '上证主板'
                WHEN code LIKE '900%' THEN '上证B股'
                WHEN code LIKE '200%' THEN '深证B股'
                ELSE '其他'
            END as market,
            COUNT(*) as count
        FROM stocks
        GROUP BY market
        ORDER BY count DESC
    """)
    print("\n股票市场分布:")
    for market, count in cursor.fetchall():
        print(f"  {market}: {count} 只股票 ({count/stock_count*100:.1f}%)")

    # 检查前10只股票
    print("\n前10只股票示例:")
    cursor.execute("SELECT code, name, exchange, industry FROM stocks LIMIT 10")
    for code, name, exchange, industry in cursor.fetchall():
        print(f"  {code} - {name} ({exchange}, {industry})")

# 3. 检查klines表
print("\n=== klines表检查 ===")
cursor.execute("SELECT COUNT(*) FROM klines")
kline_count = cursor.fetchone()[0]
print(f"klines表记录数: {kline_count}")

if kline_count > 0:
    # 检查有K线数据的股票数量
    cursor.execute("SELECT COUNT(DISTINCT stock_code) FROM klines")
    stocks_with_kline = cursor.fetchone()[0]
    print(f"有K线数据的股票数量: {stocks_with_kline}")

    # 检查K线数据日期范围
    cursor.execute("SELECT MIN(date), MAX(date) FROM klines")
    min_date, max_date = cursor.fetchone()
    print(f"K线数据日期范围: {min_date} 到 {max_date}")

# 4. 检查智能选股可能用到的其他表
print("\n=== 其他相关表检查 ===")
for table in ['volume_analysis', 'fund_flow', 'buy_signals', 'realtime_quotes']:
    cursor.execute(f"SELECT COUNT(*) FROM {table}")
    count = cursor.fetchone()[0]
    print(f"{table}表记录数: {count}")

conn.close()
print("\n=== 检查完成 ===")