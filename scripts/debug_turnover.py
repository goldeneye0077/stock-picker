import sqlite3

conn = sqlite3.connect('e:/stock_an/stock-picker-latest/data/stock_picker.db')

r = conn.execute("SELECT SUM(amount) as total FROM realtime_quotes").fetchone()
print(f"realtime_quotes total amount: {r[0]}")

r = conn.execute("SELECT SUM(amount) as total FROM realtime_quotes WHERE updated_at >= datetime('now', '-1 day')").fetchone()
print(f"realtime_quotes today total: {r[0]}")

r2 = conn.execute("SELECT SUM(amount) as total FROM quote_history").fetchone()
print(f"quote_history total amount: {r2[0]}")

r3 = conn.execute("SELECT MAX(updated_at), MIN(updated_at) FROM realtime_quotes").fetchone()
print(f"realtime_quotes time range: {r3}")

r4 = conn.execute("SELECT MAX(snapshot_time), MIN(snapshot_time) FROM quote_history").fetchone()
print(f"quote_history time range: {r4}")

# Check Docker time vs local
r5 = conn.execute("SELECT datetime('now')").fetchone()
print(f"SQLite now: {r5[0]}")

import datetime
print(f"Python now: {datetime.datetime.now()}")

conn.close()
