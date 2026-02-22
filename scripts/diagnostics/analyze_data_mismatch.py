#!/usr/bin/env python3
"""
分析数据不匹配问题
找出有K线无资金流向、有资金流向无K线的股票
"""

import sqlite3
import pandas as pd
from datetime import datetime, timedelta


def analyze_data_mismatch():
    """分析数据不匹配问题"""
    db_path = "data/stock_picker.db"
    conn = sqlite3.connect(db_path)

    # 获取最近交易日
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(date) FROM klines")
    latest_date = cursor.fetchone()[0]

    if not latest_date:
        print("无K线数据")
        return

    print(f"分析日期: {latest_date}")
    print("=" * 60)

    # 1. 获取有K线无资金流向的股票
    print("\n1. 有K线数据但无资金流向数据的股票:")
    cursor.execute("""
        SELECT k.stock_code, s.name, s.exchange
        FROM klines k
        LEFT JOIN fund_flow f ON k.stock_code = f.stock_code AND k.date = f.date
        LEFT JOIN stocks s ON k.stock_code = s.code
        WHERE k.date = ? AND f.stock_code IS NULL
        ORDER BY k.stock_code
    """, (latest_date,))

    missing_flow_stocks = cursor.fetchall()
    print(f"   数量: {len(missing_flow_stocks)} 只")

    if missing_flow_stocks:
        print("   前10只股票:")
        for i, (code, name, exchange) in enumerate(missing_flow_stocks[:10]):
            print(f"     {i+1:2d}. {code} {name} ({exchange})")

    # 2. 获取有资金流向无K线的股票
    print("\n2. 有资金流向数据但无K线数据的股票:")
    cursor.execute("""
        SELECT f.stock_code, s.name, s.exchange
        FROM fund_flow f
        LEFT JOIN klines k ON f.stock_code = k.stock_code AND f.date = k.date
        LEFT JOIN stocks s ON f.stock_code = s.code
        WHERE f.date = ? AND k.stock_code IS NULL
        ORDER BY f.stock_code
    """, (latest_date,))

    missing_kline_stocks = cursor.fetchall()
    print(f"   数量: {len(missing_kline_stocks)} 只")

    if missing_kline_stocks:
        print("   前10只股票:")
        for i, (code, name, exchange) in enumerate(missing_kline_stocks[:10]):
            print(f"     {i+1:2d}. {code} {name} ({exchange})")

    # 3. 分析股票类型分布
    print("\n3. 缺失数据的股票类型分析:")

    # 分析有K线无资金流向的股票类型
    if missing_flow_stocks:
        flow_codes = [code for code, _, _ in missing_flow_stocks]
        cursor.execute(f"""
            SELECT
                CASE
                    WHEN code LIKE '9%' THEN '特殊股票(9开头)'
                    WHEN code LIKE '8%' THEN '北交所(8开头)'
                    WHEN code LIKE '4%' THEN '老三板(4开头)'
                    WHEN code LIKE '3%' THEN '创业板'
                    WHEN code LIKE '0%' THEN '深交所主板'
                    WHEN code LIKE '6%' THEN '上交所主板'
                    ELSE '其他'
                END as stock_type,
                COUNT(*) as count
            FROM stocks
            WHERE code IN ({','.join(['?']*len(flow_codes))})
            GROUP BY stock_type
            ORDER BY count DESC
        """, flow_codes)

        print("   有K线无资金流向的股票类型:")
        for stock_type, count in cursor.fetchall():
            print(f"     {stock_type}: {count} 只")

    # 分析有资金流向无K线的股票类型
    if missing_kline_stocks:
        kline_codes = [code for code, _, _ in missing_kline_stocks]
        cursor.execute(f"""
            SELECT
                CASE
                    WHEN code LIKE '9%' THEN '特殊股票(9开头)'
                    WHEN code LIKE '8%' THEN '北交所(8开头)'
                    WHEN code LIKE '4%' THEN '老三板(4开头)'
                    WHEN code LIKE '3%' THEN '创业板'
                    WHEN code LIKE '0%' THEN '深交所主板'
                    WHEN code LIKE '6%' THEN '上交所主板'
                    ELSE '其他'
                END as stock_type,
                COUNT(*) as count
            FROM stocks
            WHERE code IN ({','.join(['?']*len(kline_codes))})
            GROUP BY stock_type
            ORDER BY count DESC
        """, kline_codes)

        print("   有资金流向无K线的股票类型:")
        for stock_type, count in cursor.fetchall():
            print(f"     {stock_type}: {count} 只")

    # 4. 检查热门股票数据完整性
    print("\n4. 热门股票数据完整性检查:")
    hot_stocks = [
        ("300474", "SZ"), ("002371", "SZ"), ("002049", "SZ"),
        ("300750", "SZ"), ("600519", "SH"), ("000858", "SZ"),
        ("600118", "SH"), ("600879", "SH"), ("000901", "SZ"),
        ("300502", "SZ"), ("300394", "SZ"), ("300308", "SZ"),
        ("002415", "SZ"), ("000001", "SZ")
    ]

    for stock_code, exchange in hot_stocks:
        ts_code = f"{stock_code}.{exchange}"

        cursor.execute("""
            SELECT COUNT(*) FROM klines
            WHERE stock_code = ? AND date = ?
        """, (stock_code, latest_date))
        has_kline = cursor.fetchone()[0] > 0

        cursor.execute("""
            SELECT COUNT(*) FROM fund_flow
            WHERE stock_code = ? AND date = ?
        """, (stock_code, latest_date))
        has_flow = cursor.fetchone()[0] > 0

        status = "OK" if has_kline and has_flow else "MISSING"
        kline_status = "OK" if has_kline else "NO"
        flow_status = "OK" if has_flow else "NO"

        print(f"   {ts_code}: K线[{kline_status}] 资金流向[{flow_status}] [{status}]")

    # 5. 统计总体数据
    print("\n5. 总体统计数据:")
    cursor.execute("SELECT COUNT(DISTINCT stock_code) FROM klines WHERE date = ?", (latest_date,))
    kline_stocks = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(DISTINCT stock_code) FROM fund_flow WHERE date = ?", (latest_date,))
    flow_stocks = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM stocks")
    total_stocks = cursor.fetchone()[0]

    print(f"   股票总数: {total_stocks} 只")
    print(f"   有K线数据的股票: {kline_stocks} 只 ({kline_stocks/total_stocks:.1%})")
    print(f"   有资金流向数据的股票: {flow_stocks} 只 ({flow_stocks/total_stocks:.1%})")

    # 计算数据一致性
    cursor.execute("""
        SELECT COUNT(DISTINCT k.stock_code)
        FROM klines k
        INNER JOIN fund_flow f ON k.stock_code = f.stock_code AND k.date = f.date
        WHERE k.date = ?
    """, (latest_date,))
    both_stocks = cursor.fetchone()[0]

    print(f"   两者都有的股票: {both_stocks} 只 ({both_stocks/total_stocks:.1%})")

    conn.close()

    # 6. 问题分析
    print("\n6. 问题分析:")
    print("   a) 有K线无资金流向的可能原因:")
    print("      - 特殊股票（9开头）可能不在资金流向API覆盖范围内")
    print("      - API接口返回的数据过滤条件不同")
    print("      - 数据采集时间不同步")

    print("\n   b) 有资金流向无K线的可能原因:")
    print("      - *ST股可能被K线API过滤掉")
    print("      - 退市整理期股票")
    print("      - API接口的股票列表不一致")

    print("\n   c) 解决方案建议:")
    print("      1. 统一股票代码过滤逻辑")
    print("      2. 使用相同的股票列表作为基准")
    print("      3. 实现数据同步验证和自动补全")


if __name__ == "__main__":
    analyze_data_mismatch()