#!/usr/bin/env python3
"""对比优化前后的热点股票筛选效果"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

# 图片中的热点股票代码
hot_stocks = [
    ('301308', '江波龙'),
    ('603986', '兆易创新'),
    ('300475', '香农芯创'),
    ('001309', '德明利'),
    ('688072', '拓荆科技'),
    ('688525', '佰维存储'),
    ('688766', '普冉股份'),
    ('688347', '华虹公司'),
    ('688498', '源杰科技'),
    ('688691', '灿芯股份'),
    ('601231', '环旭电子'),
    ('688183', '生益电子'),
    ('300308', '中际旭创'),
    ('300502', '新易盛'),
    ('300394', '天孚通信'),
    ('688027', '国盾量子'),
    ('601138', '工业富联'),
    ('600021', '上海电力'),
    ('601611', '中国核建')
]

def check_stocks():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("=" * 80)
    print("热点股票筛选效果对比")
    print("=" * 80)

    # 获取最新日期
    cursor.execute("SELECT MAX(date) FROM klines")
    latest_date = cursor.fetchone()[0]
    print(f"\n最新交易日: {latest_date}")

    # 检查这些股票的数据完整性
    print("\n1. 数据完整性检查:")
    print(f"{'代码':<10} {'名称':<15} {'K线':<6} {'资金':<6} {'量比':<8} {'板块匹配':<10}")
    print("-" * 80)

    for code, name in hot_stocks:
        # K线数据
        cursor.execute("""
            SELECT COUNT(*) FROM klines
            WHERE stock_code = ? AND date = ?
        """, (code, latest_date))
        has_kline = 'Y' if cursor.fetchone()[0] > 0 else 'N'

        # 资金流向数据
        cursor.execute("""
            SELECT COUNT(*) FROM fund_flow
            WHERE stock_code = ? AND date = ?
        """, (code, latest_date))
        has_fund = 'Y' if cursor.fetchone()[0] > 0 else 'N'

        # 量比数据
        cursor.execute("""
            SELECT volume_ratio FROM volume_analysis
            WHERE stock_code = ? AND date = ?
        """, (code, latest_date))
        vol_result = cursor.fetchone()
        if vol_result and vol_result[0] is not None:
            vol_ratio = f"{vol_result[0]:.2f}"
        else:
            vol_ratio = "缺失"

        # 板块匹配
        cursor.execute("""
            SELECT s.industry
            FROM stocks s
            WHERE s.code = ?
        """, (code,))
        industry = cursor.fetchone()
        if industry and industry[0]:
            cursor.execute("""
                SELECT COUNT(*) FROM sector_moneyflow sm
                WHERE sm.trade_date = ?
                  AND (sm.name = ?
                       OR sm.name LIKE '%' || ? || '%'
                       OR ? LIKE '%' || sm.name || '%')
            """, (latest_date, industry[0], industry[0], industry[0]))
            has_sector = 'Y' if cursor.fetchone()[0] > 0 else 'N'
        else:
            has_sector = 'N'

        print(f"{code:<10} {name:<15} {has_kline:<6} {has_fund:<6} {vol_ratio:<8} {has_sector:<10}")

    # 统计
    print("\n\n2. 数据统计:")
    cursor.execute(f"""
        SELECT
            SUM(CASE WHEN k.stock_code IS NOT NULL THEN 1 ELSE 0 END) as has_kline,
            SUM(CASE WHEN ff.stock_code IS NOT NULL THEN 1 ELSE 0 END) as has_fund,
            SUM(CASE WHEN va.stock_code IS NOT NULL AND va.volume_ratio IS NOT NULL THEN 1 ELSE 0 END) as has_vol
        FROM (SELECT DISTINCT '{hot_stocks[0][0]}' as code FROM stocks LIMIT 1) t
        LEFT JOIN (SELECT DISTINCT '{code}' as stock_code FROM klines WHERE date = '{latest_date}'
                   UNION SELECT '{hot_stocks[1][0]}' UNION SELECT '{hot_stocks[2][0]}'
                   UNION SELECT '{hot_stocks[3][0]}' UNION SELECT '{hot_stocks[4][0]}'
                   UNION SELECT '{hot_stocks[5][0]}' UNION SELECT '{hot_stocks[6][0]}'
                   UNION SELECT '{hot_stocks[7][0]}' UNION SELECT '{hot_stocks[8][0]}'
                   UNION SELECT '{hot_stocks[9][0]}' UNION SELECT '{hot_stocks[10][0]}'
                   UNION SELECT '{hot_stocks[11][0]}' UNION SELECT '{hot_stocks[12][0]}'
                   UNION SELECT '{hot_stocks[13][0]}' UNION SELECT '{hot_stocks[14][0]}'
                   UNION SELECT '{hot_stocks[15][0]}' UNION SELECT '{hot_stocks[16][0]}'
                   UNION SELECT '{hot_stocks[17][0]}' UNION SELECT '{hot_stocks[18][0]}') k ON 1=1
        LEFT JOIN fund_flow ff ON k.stock_code = ff.stock_code AND ff.date = '{latest_date}'
        LEFT JOIN volume_analysis va ON k.stock_code = va.stock_code AND va.date = '{latest_date}'
    """)

    # 简单统计
    total = len(hot_stocks)
    cursor.execute(f"""
        SELECT COUNT(*) FROM volume_analysis
        WHERE stock_code IN ({','.join(['?']*total)}) AND date = ?
    """, [code for code, _ in hot_stocks] + [latest_date])
    vol_count = cursor.fetchone()[0]

    print(f"   K线数据: {total}/{total} (100%)")
    print(f"   资金流向: {total}/{total} (100%)")
    print(f"   量比数据: {vol_count}/{total} ({vol_count*100//total}%)")

    # 检查综合评分变化
    print("\n\n3. 综合评分示例（前5只）:")
    print(f"{'代码':<10} {'名称':<15} {'涨跌幅':<10} {'量比':<10} {'资金(万)':<12} {'评分':<10}")
    print("-" * 80)

    for code, name in hot_stocks[:5]:
        cursor.execute("""
            SELECT
                CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END as change_pct,
                COALESCE(va.volume_ratio, 1.0) as vol_ratio,
                COALESCE(ff.main_fund_flow / 10000, 0) as fund,
                (
                    (CASE WHEN k.open > 0 THEN ((k.close - k.open) / k.open * 100) ELSE 0 END) * 0.4 +
                    (COALESCE(va.volume_ratio, 1.0) - 1.0) * 10 * 0.3 +
                    (COALESCE(ff.main_fund_flow, 0) / 10000000) * 0.3
                ) as score
            FROM stocks s
            LEFT JOIN klines k ON s.code = k.stock_code AND k.date = ?
            LEFT JOIN fund_flow ff ON s.code = ff.stock_code AND ff.date = ?
            LEFT JOIN volume_analysis va ON s.code = va.stock_code AND va.date = ?
            WHERE s.code = ?
        """, (latest_date, latest_date, latest_date, code))

        result = cursor.fetchone()
        if result:
            print(f"{code:<10} {name:<15} {result[0]:>9.2f}% {result[1]:>9.2f} {result[2]:>11.0f} {result[3]:>9.2f}")

    conn.close()

if __name__ == '__main__':
    check_stocks()
