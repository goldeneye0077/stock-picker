import sqlite3

conn = sqlite3.connect(r"e:/stock_an/stock-picker-latest/data/stock_picker.db")

# List all tables
cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
tables = [row[0] for row in cursor.fetchall()]
print("=== Tables ===")
for t in tables:
    count = conn.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
    print(f"  {t}: {count} rows")

# Check key tables for data
print("\n=== buy_signals recent ===")
try:
    rows = conn.execute("SELECT COUNT(*) FROM buy_signals WHERE date(created_at) >= date('now', '-7 days')").fetchone()
    print(f"  Last 7 days: {rows[0]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== realtime_quotes ===")
try:
    rows = conn.execute("SELECT COUNT(*), MAX(updated_at) FROM realtime_quotes").fetchone()
    print(f"  Count: {rows[0]}, Latest: {rows[1]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== quote_history ===")
try:
    rows = conn.execute("SELECT COUNT(*), MAX(snapshot_time), MIN(snapshot_time) FROM quote_history").fetchone()
    print(f"  Count: {rows[0]}, Latest: {rows[1]}, Earliest: {rows[2]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== auction_super_mainforce ===")
try:
    rows = conn.execute("SELECT COUNT(*), MAX(trade_date), MIN(trade_date) FROM auction_super_mainforce").fetchone()
    print(f"  Count: {rows[0]}, Latest: {rows[1]}, Earliest: {rows[2]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== auction_super_mainforce columns ===")
try:
    cursor = conn.execute("PRAGMA table_info(auction_super_mainforce)")
    for col in cursor.fetchall():
        print(f"  {col[1]} ({col[2]})")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== volume_analysis ===")
try:
    rows = conn.execute("SELECT COUNT(*), MAX(date) FROM volume_analysis").fetchone()
    print(f"  Count: {rows[0]}, Latest: {rows[1]}")
except Exception as e:
    print(f"  Error: {e}")

print("\n=== klines ===")
try:
    rows = conn.execute("SELECT COUNT(*), MAX(date), MIN(date) FROM klines").fetchone()
    print(f"  Count: {rows[0]}, Latest: {rows[1]}, Earliest: {rows[2]}")
except Exception as e:
    print(f"  Error: {e}")

conn.close()
