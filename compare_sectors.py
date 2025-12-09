#!/usr/bin/env python3
"""对比板块资金流向和板块成交量的板块数量差异"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

def compare_sectors():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("=" * 70)
    print("板块数量对比分析")
    print("=" * 70)

    # 1. 板块成交量异动分析 - 基于 stocks.industry
    cursor.execute("""
        SELECT COUNT(DISTINCT industry)
        FROM stocks
        WHERE industry IS NOT NULL AND industry != ''
    """)
    industry_count = cursor.fetchone()[0]
    print(f"\n1. 板块成交量异动分析（基于个股行业分类）")
    print(f"   板块数量: {industry_count} 个")
    print(f"   数据来源: stocks 表的 industry 字段")
    print(f"   板块类型: 传统行业分类（如：电子、医药、银行等）")

    # 显示部分行业示例
    cursor.execute("""
        SELECT DISTINCT industry
        FROM stocks
        WHERE industry IS NOT NULL AND industry != ''
        ORDER BY industry
        LIMIT 10
    """)
    industries = cursor.fetchall()
    print(f"\n   行业示例（前10个）:")
    for ind in industries:
        print(f"   - {ind[0]}")

    # 2. 板块资金流向分析 - 基于 sector_moneyflow.name
    cursor.execute("""
        SELECT COUNT(DISTINCT name)
        FROM sector_moneyflow
    """)
    sector_count = cursor.fetchone()[0]
    print(f"\n2. 板块资金流向分析（东方财富概念板块）")
    print(f"   板块数量: {sector_count} 个")
    print(f"   数据来源: Tushare Pro API (moneyflow_ind_dc)")
    print(f"   板块类型: 概念板块 + 行业板块 + 指数板块")

    # 显示部分板块示例
    cursor.execute("""
        SELECT DISTINCT name
        FROM sector_moneyflow
        ORDER BY name
        LIMIT 20
    """)
    sectors = cursor.fetchall()
    print(f"\n   板块示例（前20个）:")
    for sec in sectors:
        print(f"   - {sec[0]}")

    # 3. 统计分析
    print(f"\n" + "=" * 70)
    print("差异分析")
    print("=" * 70)
    print(f"\n板块数量差异: {sector_count} - {industry_count} = {sector_count - industry_count} 个")
    print(f"差异倍数: {sector_count / industry_count:.1f} 倍")

    print(f"\n原因说明:")
    print(f"1. 【板块成交量】使用个股的行业分类，是传统的行业划分")
    print(f"2. 【板块资金流向】使用东财的概念板块，包括：")
    print(f"   - 行业板块（电子、医药等）")
    print(f"   - 概念板块（华为概念、元宇宙等）")
    print(f"   - 主题板块（新能源、人工智能等）")
    print(f"   - 指数板块（沪深300、MSCI中国等）")
    print(f"   - 特殊板块（融资融券、百元股等）")

    print(f"\n这是正常现象，两者的板块定义体系不同。")

    conn.close()

if __name__ == '__main__':
    compare_sectors()
