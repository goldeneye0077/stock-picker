#!/usr/bin/env python3
"""检查成交量分析数据"""
import sqlite3

DB_PATH = 'data/stock_picker.db'

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# 最新日期的成交量分析记录数
cursor.execute("""
    SELECT COUNT(*)
    FROM volume_analysis
    WHERE date = (SELECT MAX(date) FROM klines)
""")
count = cursor.fetchone()[0]
print(f'最新日期的成交量分析记录数: {count}')

if count > 0:
    # TOP 5 量比
    cursor.execute("""
        SELECT stock_code, volume_ratio, is_volume_surge
        FROM volume_analysis
        WHERE date = (SELECT MAX(date) FROM klines)
        ORDER BY volume_ratio DESC
        LIMIT 5
    """)
    print('\nTOP 5 量比:')
    for row in cursor.fetchall():
        print(f'  {row[0]}: {row[1]:.2f} (异动: {row[2]})')

    # 检查图片中的股票
    hot_stocks = ['301308', '603986', '300475', '001309', '688072']
    cursor.execute(f"""
        SELECT s.code, s.name, va.volume_ratio, va.is_volume_surge
        FROM stocks s
        LEFT JOIN volume_analysis va ON s.code = va.stock_code
            AND va.date = (SELECT MAX(date) FROM klines)
        WHERE s.code IN ({','.join(['?']*len(hot_stocks))})
    """, hot_stocks)

    print('\n图片中部分热点股票的量比:')
    for row in cursor.fetchall():
        ratio = row[2] if row[2] is not None else 0
        surge = '是' if row[3] == 1 else '否'
        print(f'  {row[0]} {row[1]}: 量比={ratio:.2f}, 异动={surge}')

conn.close()
