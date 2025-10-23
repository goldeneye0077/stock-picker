"""
检查 fund_flow 表数据
"""
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent / 'data' / 'stock_picker.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 检查fund_flow表的最新数据
print('=== fund_flow 表最新10条数据 ===')
cursor.execute('''
    SELECT stock_code, date, main_fund_flow, retail_fund_flow,
           institutional_flow, large_order_ratio, created_at
    FROM fund_flow
    ORDER BY date DESC, created_at DESC
    LIMIT 10
''')
for row in cursor.fetchall():
    print(f'{row[0]} | {row[1]} | 主力:{row[2]:.0f} | 散户:{row[3]:.0f} | 机构:{row[4]:.0f} | 大单比:{row[5]:.4f} | {row[6]}')

print('\n=== fund_flow 表数据统计 ===')
cursor.execute('SELECT COUNT(*), MIN(date), MAX(date) FROM fund_flow')
row = cursor.fetchone()
print(f'总记录数: {row[0]}')
print(f'日期范围: {row[1]} 到 {row[2]}')

print('\n=== 主力资金流入前10名（最新一天） ===')
cursor.execute('''
    SELECT stock_code, date, main_fund_flow, large_order_ratio
    FROM fund_flow
    WHERE date = (SELECT MAX(date) FROM fund_flow)
    ORDER BY main_fund_flow DESC
    LIMIT 10
''')
for row in cursor.fetchall():
    print(f'{row[0]} | {row[1]} | 主力流入:{row[2]:.0f}元 | 大单比:{row[3]:.4f}')

print('\n=== 检查 large_order_ratio 的值范围 ===')
cursor.execute('''
    SELECT
        MIN(large_order_ratio) as min_ratio,
        MAX(large_order_ratio) as max_ratio,
        AVG(large_order_ratio) as avg_ratio
    FROM fund_flow
    WHERE date = (SELECT MAX(date) FROM fund_flow)
''')
row = cursor.fetchone()
print(f'最小值: {row[0]:.6f}')
print(f'最大值: {row[1]:.6f}')
print(f'平均值: {row[2]:.6f}')

print('\n=== 检查符合主力行为条件的股票 ===')
cursor.execute('''
    WITH ranked_flow AS (
        SELECT
            ff.stock_code,
            ff.date,
            ff.main_fund_flow,
            ff.large_order_ratio,
            ROW_NUMBER() OVER (PARTITION BY ff.stock_code ORDER BY ff.date DESC) as rn
        FROM fund_flow ff
        WHERE ff.date >= date('now', '-7 days')
    ),
    aggregated AS (
        SELECT
            stock_code,
            SUM(main_fund_flow) as totalFlow,
            AVG(large_order_ratio) as avgLargeOrderRatio,
            COUNT(*) as days
        FROM ranked_flow
        WHERE rn <= 7
        GROUP BY stock_code
    )
    SELECT
        stock_code,
        totalFlow,
        avgLargeOrderRatio,
        days,
        CASE
            WHEN totalFlow > 100000000 AND avgLargeOrderRatio > 0.3 THEN '强势介入'
            WHEN totalFlow > 50000000 AND avgLargeOrderRatio > 0.2 THEN '稳步建仓'
            WHEN totalFlow > 0 THEN '小幅流入'
            ELSE '观望'
        END as behavior
    FROM aggregated
    WHERE totalFlow > 0
    ORDER BY totalFlow DESC
    LIMIT 20
''')
print('股票代码 | 总资金流入(亿) | 平均大单比 | 天数 | 行为')
for row in cursor.fetchall():
    print(f'{row[0]} | {row[1]/100000000:.2f} | {row[2]:.4f} | {row[3]} | {row[4]}')

conn.close()
