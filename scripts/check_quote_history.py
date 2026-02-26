import sqlite3
import pprint
conn = sqlite3.connect('e:/stock_an/stock-picker-latest/data/stock_picker.db')
cursor = conn.cursor()
cursor.execute("PRAGMA table_info(quote_history)")
print([row[1] for row in cursor.fetchall()])
conn.close()
