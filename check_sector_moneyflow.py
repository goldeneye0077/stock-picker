#!/usr/bin/env python3
"""检查 sector_moneyflow 表的数据"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

def check_sector_moneyflow():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # 检查记录总数
    cursor.execute("SELECT COUNT(*) FROM sector_moneyflow")
    total = cursor.fetchone()[0]
    print(f"sector_moneyflow 表总记录数: {total}")

    # 检查日期范围
    cursor.execute("SELECT MIN(trade_date), MAX(trade_date) FROM sector_moneyflow")
    min_date, max_date = cursor.fetchone()
    print(f"日期范围: {min_date} 至 {max_date}")

    # 检查板块数量
    cursor.execute("SELECT COUNT(DISTINCT name) FROM sector_moneyflow")
    sector_count = cursor.fetchone()[0]
    print(f"板块数量: {sector_count}")

    # 显示最新数据（前5条）
    print("\n最新的5条记录:")
    cursor.execute("""
        SELECT trade_date, name, pct_change, net_amount,
               buy_elg_amount, buy_lg_amount, rank
        FROM sector_moneyflow
        ORDER BY trade_date DESC, rank ASC
        LIMIT 5
    """)

    print(f"{'日期':<12} {'板块名称':<20} {'涨跌幅':<8} {'主力净额(亿)':<12} {'超大单(亿)':<12} {'大单(亿)':<12} {'排名':<6}")
    print("-" * 100)

    for row in cursor.fetchall():
        trade_date, name, pct_change, net_amount, elg, lg, rank = row
        print(f"{trade_date:<12} {name:<20} {pct_change:>7.2f}% {net_amount/100000000:>11.2f} {elg/100000000:>11.2f} {lg/100000000:>11.2f} {rank:>5}")

    # 显示主力资金流入最多的板块（最新交易日）
    print("\n最新交易日主力资金流入最多的5个板块:")
    cursor.execute("""
        SELECT trade_date, name, pct_change, net_amount, rank
        FROM sector_moneyflow
        WHERE trade_date = (SELECT MAX(trade_date) FROM sector_moneyflow)
        ORDER BY net_amount DESC
        LIMIT 5
    """)

    print(f"{'日期':<12} {'板块名称':<20} {'涨跌幅':<8} {'主力净额(亿)':<12} {'排名':<6}")
    print("-" * 70)

    for row in cursor.fetchall():
        trade_date, name, pct_change, net_amount, rank = row
        print(f"{trade_date:<12} {name:<20} {pct_change:>7.2f}% {net_amount/100000000:>11.2f} {rank:>5}")

    conn.close()

if __name__ == '__main__':
    check_sector_moneyflow()
