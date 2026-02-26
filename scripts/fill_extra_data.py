"""补充多天 quote_history 和 buy_signals 数据"""
import sqlite3
from datetime import datetime, timedelta

DB_PATH = r"e:/stock_an/stock-picker-latest/data/stock_picker.db"
conn = sqlite3.connect(DB_PATH)

# ─── 1. 从 klines 历史数据补充 quote_history ───
print("=== 补充 quote_history (多天) ===")
# 获取所有可用的K线日期
dates = [r[0] for r in conn.execute("SELECT DISTINCT date FROM klines ORDER BY date").fetchall()]
print(f"可用K线日期: {dates}")

total_qh = 0
for d in dates:
    # 检查该日期是否已有 quote_history
    existing = conn.execute("SELECT COUNT(*) FROM quote_history WHERE DATE(snapshot_time) = ?", (d,)).fetchone()[0]
    if existing > 0:
        print(f"  {d}: 已有 {existing} 条, 跳过")
        continue
    
    cursor = conn.execute("""
        SELECT k.stock_code, k.open, k.high, k.low, k.close, k.volume, k.amount,
               COALESCE(prev.close, k.open) as pre_close
        FROM klines k
        LEFT JOIN (
            SELECT stock_code, close FROM klines
            WHERE date = (SELECT MAX(date) FROM klines WHERE date < ?)
        ) prev ON k.stock_code = prev.stock_code
        WHERE k.date = ?
    """, (d, d))
    
    count = 0
    for row in cursor.fetchall():
        code, o, h, l, c, vol, amt, pre_close = row
        change_pct = ((c - pre_close) / pre_close * 100) if pre_close and pre_close > 0 else 0
        conn.execute("""
            INSERT OR REPLACE INTO quote_history
            (stock_code, pre_close, open, high, low, close, vol, amount, change_percent, snapshot_time)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (code, pre_close, o, h, l, c, vol, amt, round(change_pct, 2), d + " 15:00:00"))
        count += 1
    conn.commit()
    total_qh += count
    print(f"  {d}: 插入 {count} 条")

print(f"✅ quote_history 补充: {total_qh} 条")

# ─── 2. 生成 buy_signals（基于量价突破策略）───
print("\n=== 生成 buy_signals ===")
latest_date = dates[-1] if dates else None
if latest_date:
    # 查找量比 > 2 且涨幅 > 3% 的股票作为买入信号
    signals = conn.execute("""
        SELECT k.stock_code, k.close, k.volume, k.amount,
               COALESCE(prev.close, k.open) as pre_close,
               k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) as vol_ratio
        FROM klines k
        LEFT JOIN (
            SELECT stock_code, close FROM klines
            WHERE date = (SELECT MAX(date) FROM klines WHERE date < ?)
        ) prev ON k.stock_code = prev.stock_code
        LEFT JOIN (
            SELECT stock_code, AVG(volume) as avg_v FROM klines
            WHERE date < ? GROUP BY stock_code
        ) avg_vol ON k.stock_code = avg_vol.stock_code
        WHERE k.date = ?
          AND k.close > COALESCE(prev.close, k.open) * 1.03
          AND k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) > 1.5
        ORDER BY k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) DESC
        LIMIT 50
    """, (latest_date, latest_date, latest_date)).fetchall()
    
    for row in signals:
        code, close, vol, amt, pre_close, vol_ratio = row
        change_pct = ((close - pre_close) / pre_close * 100) if pre_close and pre_close > 0 else 0
        confidence = min(0.95, 0.6 + (change_pct / 100) + (min(vol_ratio or 0, 5) / 20))
        
        conn.execute("""
            INSERT INTO buy_signals
            (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
            VALUES (?, 'volume_breakout', ?, ?, ?, ?, ?)
        """, (
            code, round(confidence, 3), close, vol,
            f'{{"change_pct": {change_pct:.2f}, "vol_ratio": {vol_ratio:.2f}}}',
            latest_date + " 15:00:00"
        ))
    conn.commit()
    print(f"✅ 生成 {len(signals)} 个买入信号 (日期: {latest_date})")
    
    # 也为前一天生成信号
    if len(dates) >= 2:
        prev_date = dates[-2]
        signals2 = conn.execute("""
            SELECT k.stock_code, k.close, k.volume, k.amount,
                   COALESCE(prev.close, k.open) as pre_close,
                   k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) as vol_ratio
            FROM klines k
            LEFT JOIN (
                SELECT stock_code, close FROM klines
                WHERE date = (SELECT MAX(date) FROM klines WHERE date < ?)
            ) prev ON k.stock_code = prev.stock_code
            LEFT JOIN (
                SELECT stock_code, AVG(volume) as avg_v FROM klines
                WHERE date < ? GROUP BY stock_code
            ) avg_vol ON k.stock_code = avg_vol.stock_code
            WHERE k.date = ?
              AND k.close > COALESCE(prev.close, k.open) * 1.03
              AND k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) > 1.5
            ORDER BY k.volume * 1.0 / NULLIF(avg_vol.avg_v, 0) DESC
            LIMIT 50
        """, (prev_date, prev_date, prev_date)).fetchall()
        
        for row in signals2:
            code, close, vol, amt, pre_close, vol_ratio = row
            change_pct = ((close - pre_close) / pre_close * 100) if pre_close and pre_close > 0 else 0
            confidence = min(0.95, 0.6 + (change_pct / 100) + (min(vol_ratio or 0, 5) / 20))
            
            conn.execute("""
                INSERT INTO buy_signals
                (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
                VALUES (?, 'volume_breakout', ?, ?, ?, ?, ?)
            """, (
                code, round(confidence, 3), close, vol,
                f'{{"change_pct": {change_pct:.2f}, "vol_ratio": {vol_ratio:.2f}}}',
                prev_date + " 15:00:00"
            ))
        conn.commit()
        print(f"✅ 生成 {len(signals2)} 个昨日买入信号 (日期: {prev_date})")

# ─── 最终检查 ───
print("\n=== 最终数据统计 ===")
for table in ['stocks', 'klines', 'realtime_quotes', 'quote_history', 'daily_basic', 'fund_flow', 'buy_signals', 'market_moneyflow', 'auction_super_mainforce']:
    cnt = conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
    print(f"  {table}: {cnt}")

conn.close()
