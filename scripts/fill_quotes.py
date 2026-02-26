"""从最新K线数据生成 realtime_quotes 快照"""
import sqlite3

DB_PATH = r"e:/stock_an/stock-picker-latest/data/stock_picker.db"
conn = sqlite3.connect(DB_PATH)

# 找到有数据的最新交易日
latest = conn.execute("SELECT MAX(date) FROM klines").fetchone()[0]
print(f"最新K线日期: {latest}")

if not latest:
    print("无K线数据!")
    exit()

# 找前一个交易日
prev_date = conn.execute("SELECT MAX(date) FROM klines WHERE date < ?", (latest,)).fetchone()[0]
print(f"前一交易日: {prev_date}")

# 从K线数据生成 realtime_quotes
cursor = conn.execute("""
    SELECT k.stock_code, k.open, k.high, k.low, k.close, k.volume, k.amount,
           COALESCE(p.close, k.open) as pre_close
    FROM klines k
    LEFT JOIN klines p ON k.stock_code = p.stock_code AND p.date = ?
    WHERE k.date = ?
""", (prev_date, latest))

count = 0
for row in cursor.fetchall():
    code, o, h, l, c, vol, amt, pre_close = row
    change_pct = ((c - pre_close) / pre_close * 100) if pre_close and pre_close > 0 else 0
    conn.execute("""
        INSERT OR REPLACE INTO realtime_quotes
        (stock_code, pre_close, open, high, low, close, vol, amount, change_percent, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (code, pre_close, o, h, l, c, vol, amt, round(change_pct, 2)))
    count += 1

conn.commit()
print(f"✅ 插入 realtime_quotes: {count} 条")

# 同时生成 quote_history 记录
cursor2 = conn.execute("""
    SELECT stock_code, pre_close, open, high, low, close, vol, amount, change_percent
    FROM realtime_quotes
""")
qh_count = 0
for row in cursor2.fetchall():
    code, pre_c, o, h, l, c, vol, amt, chg = row
    conn.execute("""
        INSERT OR REPLACE INTO quote_history
        (stock_code, pre_close, open, high, low, close, vol, amount, change_percent, snapshot_time)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (code, pre_c, o, h, l, c, vol, amt, chg, latest + " 15:00:00"))
    qh_count += 1

conn.commit()
print(f"✅ 插入 quote_history: {qh_count} 条")

# 验证
for t in ['realtime_quotes', 'quote_history']:
    cnt = conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    print(f"  {t}: {cnt}")

conn.close()
