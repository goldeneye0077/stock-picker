import sqlite3

conn = sqlite3.connect('data/stock_picker.db')
cursor = conn.cursor()

cursor.execute('SELECT COUNT(*) FROM stocks')
stock_count = cursor.fetchone()[0]
print(f'总股票数: {stock_count}')

cursor.execute('SELECT COUNT(*) FROM klines')
kline_count = cursor.fetchone()[0]
print(f'K线数据条数: {kline_count}')

cursor.execute('SELECT code, name FROM stocks LIMIT 5')
print('股票列表 (前5条):')
for row in cursor.fetchall():
    print(f'  {row[0]} - {row[1]}')

cursor.execute('SELECT stock_code, date, close FROM klines ORDER BY date DESC LIMIT 5')
print('\n最新K线数据 (前5条):')
for row in cursor.fetchall():
    print(f'  {row[0]} - {row[1]} - 收盘价: {row[2]}')

conn.close()