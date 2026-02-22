import sqlite3

conn = sqlite3.connect('data/stock_picker.db')
cursor = conn.cursor()

# 查询所有表
cursor.execute('SELECT name FROM sqlite_master WHERE type="table" ORDER BY name;')
print('数据库表列表:')
for row in cursor.fetchall():
    print(f'  - {row[0]}')

# 查询 market_moneyflow 表记录数
cursor.execute('SELECT COUNT(*) FROM market_moneyflow')
count = cursor.fetchone()[0]
print(f'\nmarket_moneyflow 表记录数: {count}')

if count > 0:
    cursor.execute('SELECT * FROM market_moneyflow ORDER BY trade_date DESC LIMIT 3')
    print('\n最近的3条记录:')
    for row in cursor.fetchall():
        print(f'  {row}')
else:
    print('\n表为空!')

conn.close()
