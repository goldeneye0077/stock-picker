#!/usr/bin/env python3
"""分析板块名称匹配关系"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

def analyze_match():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("=" * 70)
    print("板块名称匹配分析")
    print("=" * 70)

    # 获取行业板块（板块成交量）
    cursor.execute("""
        SELECT DISTINCT industry
        FROM stocks
        WHERE industry IS NOT NULL AND industry != ''
        ORDER BY industry
    """)
    industries = set([row[0] for row in cursor.fetchall()])
    print(f"\n行业板块数量: {len(industries)}")

    # 获取资金流向板块
    cursor.execute("""
        SELECT DISTINCT name
        FROM sector_moneyflow
        ORDER BY name
    """)
    sectors = set([row[0] for row in cursor.fetchall()])
    print(f"资金流向板块数量: {len(sectors)}")

    # 找出完全匹配的板块
    exact_match = industries.intersection(sectors)
    print(f"\n完全匹配的板块数量: {len(exact_match)}")
    print(f"完全匹配的板块:")
    for name in sorted(exact_match)[:20]:
        print(f"  - {name}")
    if len(exact_match) > 20:
        print(f"  ... 还有 {len(exact_match) - 20} 个")

    # 找出包含关系的板块
    print(f"\n\n包含关系匹配的板块（资金流向板块名包含行业名）:")
    partial_matches = []
    for industry in industries:
        for sector in sectors:
            if industry in sector or sector in industry:
                if sector not in exact_match:  # 排除完全匹配的
                    partial_matches.append((industry, sector))

    # 去重并显示部分结果
    partial_matches = list(set(partial_matches))[:30]
    for industry, sector in partial_matches[:20]:
        print(f"  行业: {industry:20s} <-> 板块: {sector}")

    # 统计分析
    print(f"\n\n匹配统计:")
    print(f"  完全匹配: {len(exact_match)} 个")
    print(f"  包含匹配: {len(partial_matches)} 个")
    print(f"  总匹配数: {len(exact_match) + len(partial_matches)} 个")

    conn.close()

if __name__ == '__main__':
    analyze_match()
