import sqlite3

conn = sqlite3.connect('data/stock_picker.db')
cursor = conn.cursor()

tables = ['stocks', 'klines', 'volume_analysis', 'buy_signals', 'realtime_quotes', 'market_moneyflow']

for table in tables:
    print(f"--- Schema for {table} ---")
    try:
        cursor.execute(f"PRAGMA table_info({table})")
        cols = cursor.fetchall()
        for col in cols:
            print(col)
    except Exception as e:
        print(f"Error: {e}")
    print()

conn.close()
