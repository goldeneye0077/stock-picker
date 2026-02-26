import sqlite3

conn = sqlite3.connect('e:/stock_an/stock-picker-latest/data/stock_picker.db')
cursor = conn.cursor()

cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [row[0] for row in cursor.fetchall()]
print(tables)

if 'auction_super_mainforce' in tables:
    cursor.execute("PRAGMA table_info(auction_super_mainforce)")
    print("auction_super_mainforce columns:", [row[1] for row in cursor.fetchall()])
else:
    print("auction_super_mainforce does not exist!")

conn.close()
