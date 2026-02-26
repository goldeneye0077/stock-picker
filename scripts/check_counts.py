import sqlite3

conn = sqlite3.connect(r"e:/stock_an/stock-picker-latest/data/stock_picker.db")
tables = ['stocks','klines','realtime_quotes','quote_history','fund_flow','daily_basic','volume_analysis','buy_signals','market_moneyflow','kpl_concepts','ths_indices','ths_members']
for t in tables:
    try:
        count = conn.execute(f"SELECT COUNT(*) FROM [{t}]").fetchone()[0]
        print(f"  {t}: {count}")
    except Exception as e:
        print(f"  {t}: ERROR - {e}")
conn.close()
