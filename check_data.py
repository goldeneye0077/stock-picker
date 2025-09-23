#!/usr/bin/env python3
"""
检查数据库中的数据情况
"""
import sqlite3

def check_database():
    conn = sqlite3.connect('data/stock_picker.db')
    cursor = conn.cursor()

    # 检查各个表的数据量
    tables = [
        ('stocks', '股票数据'),
        ('klines', 'K线数据'),
        ('volume_analysis', '成交量分析'),
        ('buy_signals', '买入信号'),
        ('fund_flow', '资金流向')
    ]

    print("数据库数据统计：")
    print("-" * 50)

    for table, description in tables:
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        count = cursor.fetchone()[0]
        print(f"{description:15}: {count:6} 条")

    print("-" * 50)

    # 检查最新的买入信号
    cursor.execute("""
        SELECT stock_code, signal_type, confidence, created_at
        FROM buy_signals
        ORDER BY created_at DESC
        LIMIT 5
    """)
    signals = cursor.fetchall()

    print("\n最新买入信号：")
    for signal in signals:
        print(f"  {signal[0]} - {signal[1]} (置信度: {signal[2]}) - {signal[3]}")

    # 检查成交量异动
    cursor.execute("""
        SELECT stock_code, volume_ratio, date
        FROM volume_analysis
        WHERE is_volume_surge = 1
        ORDER BY date DESC
        LIMIT 5
    """)
    surges = cursor.fetchall()

    print("\n成交量异动股票：")
    for surge in surges:
        print(f"  {surge[0]} - 量比: {surge[1]} - {surge[2]}")

    conn.close()

if __name__ == "__main__":
    check_database()