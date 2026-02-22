import sqlite3
import pandas as pd

conn = sqlite3.connect('data/stock_picker.db')

# Set up trace to see what happens
conn.set_trace_callback(print)

try:
    sql = """
      SELECT s.*,
             COALESCE(rq.close, k.close) as current_price,
             rq.pre_close as pre_close,
             COALESCE(rq.open, k.open) as open,
             COALESCE(rq.high, k.high) as high,
             COALESCE(rq.low, k.low) as low,
             COALESCE(rq.vol, k.volume) as volume,
             COALESCE(rq.amount, k.amount) as amount,
             COALESCE(rq.change_percent, ((k.close - k.open) / k.open * 100)) as change_percent,
             COALESCE(rq.change_amount, (k.close - k.open)) as change_amount,
             rq.updated_at as quote_time,
             va.volume_ratio,
             va.is_volume_surge,
             bs.signal_type as latest_signal
      FROM stocks s
      LEFT JOIN realtime_quotes rq ON s.code = rq.stock_code
      LEFT JOIN (
        SELECT stock_code, close, volume, open, high, low, amount,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM klines
      ) k ON s.code = k.stock_code AND k.rn = 1
      LEFT JOIN (
        SELECT stock_code, volume_ratio, is_volume_surge,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY date DESC) as rn
        FROM volume_analysis
      ) va ON s.code = va.stock_code AND va.rn = 1
      LEFT JOIN (
        SELECT stock_code, signal_type,
               ROW_NUMBER() OVER (PARTITION BY stock_code ORDER BY created_at DESC) as rn
        FROM buy_signals
      ) bs ON s.code = bs.stock_code AND bs.rn = 1
      ORDER BY s.code
      -- LIMIT 5
    """
    
    print("Executing query...")
    cursor = conn.cursor()
    cursor.execute(sql)
    rows = cursor.fetchall()
    print(f"Success! Retrieved {len(rows)} rows.")
    if rows:
        print("First row columns:", [description[0] for description in cursor.description])
        print("First row:", rows[0])

except Exception as e:
    print(f"Query failed: {e}")

finally:
    conn.close()
