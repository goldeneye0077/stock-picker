#!/usr/bin/env python3
"""分析图片中的热点股票为什么没被筛选出来"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

# 图片中的股票代码
hot_stocks = [
    '301308', '603986', '300475', '001309', '688072',
    '688525', '688766', '688347', '688498', '688691',
    '601231', '688183', '300308', '300502', '300394',
    '688027', '601138', '600021', '601611'
]

def analyze_stocks():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("=" * 80)
    print("热点股票分析")
    print("=" * 80)

    # 1. 检查这些股票的行业分类
    print("\n1. 股票行业分类:")
    print(f"{'代码':<10} {'名称':<15} {'行业':<20}")
    print("-" * 80)

    for code in hot_stocks:
        cursor.execute("""
            SELECT code, name, industry
            FROM stocks
            WHERE code = ?
        """, (code,))
        result = cursor.fetchone()
        if result:
            print(f"{result[0]:<10} {result[1]:<15} {result[2] or '未分类':<20}")
        else:
            print(f"{code:<10} {'未找到':<15}")

    # 2. 统计这些股票的行业分布
    print("\n\n2. 行业分布统计:")
    cursor.execute(f"""
        SELECT industry, COUNT(*) as count
        FROM stocks
        WHERE code IN ({','.join(['?']*len(hot_stocks))})
        GROUP BY industry
        ORDER BY count DESC
    """, hot_stocks)

    industries = cursor.fetchall()
    for ind, count in industries:
        print(f"   {ind or '未分类'}: {count}只")

    # 3. 检查这些股票的资金流向数据（最新日期）
    print("\n\n3. 最新交易日资金流向:")
    cursor.execute("""
        SELECT MAX(date) FROM klines
    """)
    latest_date = cursor.fetchone()[0]
    print(f"最新交易日: {latest_date}")

    print(f"\n{'代码':<10} {'名称':<15} {'主力资金(万)':<15} {'量比':<10} {'涨跌幅':<10}")
    print("-" * 80)

    for code in hot_stocks[:10]:  # 只显示前10只
        cursor.execute("""
            SELECT
                s.code,
                s.name,
                COALESCE(ff.main_fund_flow / 10000, 0) as main_fund,
                COALESCE(va.volume_ratio, 0) as vol_ratio,
                CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END as change_pct
            FROM stocks s
            LEFT JOIN klines k ON s.code = k.stock_code AND k.date = ?
            LEFT JOIN fund_flow ff ON s.code = ff.stock_code AND ff.date = ?
            LEFT JOIN volume_analysis va ON s.code = va.stock_code AND va.date = ?
            WHERE s.code = ?
        """, (latest_date, latest_date, latest_date, code))

        result = cursor.fetchone()
        if result:
            print(f"{result[0]:<10} {result[1]:<15} {result[2]:>14.0f} {result[3]:>9.2f} {result[4]:>9.2f}%")

    # 4. 检查这些行业在 sector_moneyflow 中的匹配情况
    print("\n\n4. 行业在板块资金流向表中的匹配情况:")
    print(f"{'行业':<20} {'匹配到的板块名称':<30} {'资金流入(亿)':<15}")
    print("-" * 80)

    for ind, _ in industries:
        if ind:
            cursor.execute("""
                SELECT name, net_amount / 100000000 as net_amount
                FROM sector_moneyflow
                WHERE trade_date = ?
                  AND (name = ? OR name LIKE '%' || ? || '%' OR ? LIKE '%' || name || '%')
                ORDER BY net_amount DESC
                LIMIT 3
            """, (latest_date, ind, ind, ind))

            matches = cursor.fetchall()
            if matches:
                for i, (name, amount) in enumerate(matches):
                    if i == 0:
                        print(f"{ind:<20} {name:<30} {amount:>14.2f}")
                    else:
                        print(f"{'':<20} {name:<30} {amount:>14.2f}")
            else:
                print(f"{ind:<20} {'无匹配':<30} {'-':<15}")

    # 5. 分析筛选条件
    print("\n\n5. 当前筛选逻辑分析:")
    print("   筛选条件:")
    print("   - 板块资金净流入 > 0")
    print("   - 行业名称与 sector_moneyflow.name 需要匹配（完全匹配或包含匹配）")
    print("   - 板块至少3只股票")
    print("   - 取每个板块综合评分最高的前10只股票")

    print("\n   问题诊断:")

    # 检查是否有fund_flow数据
    cursor.execute(f"""
        SELECT COUNT(*)
        FROM fund_flow
        WHERE stock_code IN ({','.join(['?']*len(hot_stocks))})
          AND date = ?
    """, hot_stocks + [latest_date])
    fund_count = cursor.fetchone()[0]
    print(f"   - 这些股票有资金流向数据的: {fund_count}/{len(hot_stocks)} 只")

    # 检查是否有volume_analysis数据
    cursor.execute(f"""
        SELECT COUNT(*)
        FROM volume_analysis
        WHERE stock_code IN ({','.join(['?']*len(hot_stocks))})
          AND date = ?
    """, hot_stocks + [latest_date])
    vol_count = cursor.fetchone()[0]
    print(f"   - 这些股票有成交量分析数据的: {vol_count}/{len(hot_stocks)} 只")

    conn.close()

if __name__ == '__main__':
    analyze_stocks()
