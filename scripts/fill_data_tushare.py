"""
直接用 Tushare 一键灌入首页所需的全部数据
"""
import os
import sys
import sqlite3
from pathlib import Path
from datetime import datetime, timedelta
from dotenv import load_dotenv

# 加载 data-service 的 .env
env_path = Path(__file__).parent.parent / "data-service" / ".env"
load_dotenv(dotenv_path=env_path)

import tushare as ts
import pandas as pd

token = os.getenv("TUSHARE_TOKEN")
ts.set_token(token)
pro = ts.pro_api()

DB_PATH = str(Path(__file__).parent.parent / "data" / "stock_picker.db")
print(f"数据库: {DB_PATH}")

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

# ─── 1. 获取交易日历 ────────────────────────────────
print("\n=== [1/7] 获取交易日历 ===")
end_date = datetime.now()
start_date = end_date - timedelta(days=14)
cal = pro.trade_cal(
    start_date=start_date.strftime('%Y%m%d'),
    end_date=end_date.strftime('%Y%m%d')
)
trading_days = sorted(cal[cal['is_open'] == 1]['cal_date'].tolist(), reverse=True)[:7]
print(f"将采集 {len(trading_days)} 个交易日: {trading_days}")

# ─── 2. 更新股票列表 ────────────────────────────────
print("\n=== [2/7] 更新股票列表 ===")
stocks_df = pro.stock_basic(fields='ts_code,name,exchange,industry,list_date')
if stocks_df is not None and not stocks_df.empty:
    conn = get_conn()
    for _, row in stocks_df.iterrows():
        code = row['ts_code'].split('.')[0]
        conn.execute("""
            INSERT OR REPLACE INTO stocks (code, name, exchange, industry, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        """, (code, row['name'], row['exchange'], row.get('industry', '')))
    conn.commit()
    conn.close()
    print(f"  ✅ 股票列表: {len(stocks_df)} 只")

import time

# ─── 3. 批量K线数据 ────────────────────────────────
print("\n=== [3/7] 批量下载K线数据 ===")
total_klines = 0
for i, td in enumerate(trading_days, 1):
    print(f"  [{i}/{len(trading_days)}] {td}...", end=" ", flush=True)
    try:
        df = pro.daily(trade_date=td, fields='ts_code,trade_date,open,high,low,close,vol,amount')
        if df is not None and not df.empty:
            df['trade_date'] = pd.to_datetime(df['trade_date'])
            conn = get_conn()
            for _, row in df.iterrows():
                stock_code = row['ts_code'].split('.')[0]
                conn.execute("""
                    INSERT OR REPLACE INTO klines (stock_code, date, open, high, low, close, volume, amount, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    stock_code,
                    row['trade_date'].strftime('%Y-%m-%d'),
                    float(row['open']), float(row['high']),
                    float(row['low']), float(row['close']),
                    int(row['vol'] * 100), float(row['amount'] * 1000)
                ))
            conn.commit()
            conn.close()
            total_klines += len(df)
            print(f"{len(df)} 条")
        else:
            print("无数据")
    except Exception as e:
        print(f"错误: {e}")
    time.sleep(0.3)
print(f"  ✅ K线总计: {total_klines} 条")

# ─── 4. 每日指标 ────────────────────────────────
print("\n=== [4/7] 批量下载每日指标 ===")
total_basic = 0
for i, td in enumerate(trading_days, 1):
    print(f"  [{i}/{len(trading_days)}] {td}...", end=" ", flush=True)
    try:
        df = pro.daily_basic(trade_date=td)
        if df is not None and not df.empty:
            df['trade_date'] = pd.to_datetime(df['trade_date'])
            conn = get_conn()
            for _, row in df.iterrows():
                stock_code = row['ts_code'].split('.')[0]
                conn.execute("""
                    INSERT OR REPLACE INTO daily_basic
                    (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                     pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                     total_share, float_share, free_share, total_mv, circ_mv, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    stock_code, row['trade_date'].strftime('%Y-%m-%d'),
                    float(row['close']) if pd.notna(row['close']) else None,
                    float(row['turnover_rate']) if pd.notna(row.get('turnover_rate')) else None,
                    float(row['turnover_rate_f']) if pd.notna(row.get('turnover_rate_f')) else None,
                    float(row['volume_ratio']) if pd.notna(row.get('volume_ratio')) else None,
                    float(row['pe']) if pd.notna(row.get('pe')) else None,
                    float(row['pe_ttm']) if pd.notna(row.get('pe_ttm')) else None,
                    float(row['pb']) if pd.notna(row.get('pb')) else None,
                    float(row['ps']) if pd.notna(row.get('ps')) else None,
                    float(row['ps_ttm']) if pd.notna(row.get('ps_ttm')) else None,
                    float(row['dv_ratio']) if pd.notna(row.get('dv_ratio')) else None,
                    float(row['dv_ttm']) if pd.notna(row.get('dv_ttm')) else None,
                    float(row['total_share']) if pd.notna(row.get('total_share')) else None,
                    float(row['float_share']) if pd.notna(row.get('float_share')) else None,
                    float(row['free_share']) if pd.notna(row.get('free_share')) else None,
                    float(row['total_mv']) if pd.notna(row.get('total_mv')) else None,
                    float(row['circ_mv']) if pd.notna(row.get('circ_mv')) else None
                ))
            conn.commit()
            conn.close()
            total_basic += len(df)
            print(f"{len(df)} 条")
        else:
            print("无数据")
    except Exception as e:
        print(f"错误: {e}")
    time.sleep(0.5)
print(f"  ✅ 每日指标总计: {total_basic} 条")

# ─── 5. 个股资金流向 (moneyflow_dc) ────────────────
print("\n=== [5/7] 批量下载个股资金流向 ===")
total_flow = 0
for i, td in enumerate(trading_days[:3], 1):  # 只取最近3天减少API负载
    print(f"  [{i}/3] {td}...", end=" ", flush=True)
    try:
        df = pro.moneyflow(trade_date=td)
        if df is not None and not df.empty:
            conn = get_conn()
            for _, row in df.iterrows():
                stock_code = row['ts_code'].split('.')[0]
                main_flow = (row.get('net_amount', 0) or 0) * 10000
                retail_flow = ((row.get('buy_md_amount', 0) or 0) + (row.get('buy_sm_amount', 0) or 0)) * 10000
                inst_flow = ((row.get('buy_elg_amount', 0) or 0) + (row.get('buy_lg_amount', 0) or 0)) * 10000
                ratio = row.get('net_amount_rate', 0) or 0
                conn.execute("""
                    INSERT OR REPLACE INTO fund_flow
                    (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    stock_code,
                    td[:4] + '-' + td[4:6] + '-' + td[6:8],
                    float(main_flow), float(retail_flow), float(inst_flow),
                    round(float(ratio) / 100, 4)
                ))
            conn.commit()
            conn.close()
            total_flow += len(df)
            print(f"{len(df)} 条")
        else:
            print("无数据")
    except Exception as e:
        print(f"错误: {e}")
    time.sleep(0.5)
print(f"  ✅ 个股资金流向总计: {total_flow} 条")

# ─── 6. 大盘资金流向 ────────────────────────────────
print("\n=== [6/7] 大盘资金流向 ===")
total_market = 0
for i, td in enumerate(trading_days, 1):
    print(f"  [{i}/{len(trading_days)}] {td}...", end=" ", flush=True)
    try:
        df = pro.moneyflow_hsgt(trade_date=td)
        if df is None or df.empty:
            # 尝试用 index_moneyflow
            df = pro.moneyflow(trade_date=td)
        if df is not None and not df.empty:
            # 汇总成当天大盘数据
            conn = get_conn()
            total_amount = df['amount'].sum() if 'amount' in df.columns else 0
            conn.execute("""
                INSERT OR REPLACE INTO market_moneyflow
                (trade_date, net_amount, created_at, updated_at)
                VALUES (?, ?, datetime('now'), datetime('now'))
            """, (
                td[:4] + '-' + td[4:6] + '-' + td[6:8],
                float(total_amount)
            ))
            conn.commit()
            conn.close()
            total_market += 1
            print("✓")
        else:
            print("无数据")
    except Exception as e:
        print(f"错误: {e}")
    time.sleep(0.3)
print(f"  ✅ 大盘资金流向: {total_market} 天")

# ─── 7. 集合竞价数据 ────────────────────────────────
print("\n=== [7/7] 集合竞价数据 ===")
# 先创建 auction_super_mainforce 表
conn = get_conn()
conn.execute("""
    CREATE TABLE IF NOT EXISTS auction_super_mainforce (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts_code TEXT NOT NULL,
        trade_date TEXT NOT NULL,
        vol REAL,
        price REAL,
        amount REAL,
        pre_close REAL,
        turnover_rate REAL,
        volume_ratio REAL,
        float_share REAL,
        score REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(ts_code, trade_date)
    )
""")
conn.execute("CREATE INDEX IF NOT EXISTS idx_asf_trade_date ON auction_super_mainforce(trade_date)")
conn.execute("CREATE INDEX IF NOT EXISTS idx_asf_ts_code ON auction_super_mainforce(ts_code)")
conn.commit()

total_auction = 0
for i, td in enumerate(trading_days[:3], 1):
    print(f"  [{i}/3] {td}...", end=" ", flush=True)
    try:
        df = pro.stk_auction(trade_date=td)
        if df is not None and not df.empty:
            for _, row in df.iterrows():
                conn.execute("""
                    INSERT OR REPLACE INTO auction_super_mainforce
                    (ts_code, trade_date, vol, price, amount, pre_close, turnover_rate, volume_ratio, float_share, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    str(row.get('ts_code', '')),
                    td[:4] + '-' + td[4:6] + '-' + td[6:8],
                    float(row.get('vol', 0) or 0),
                    float(row.get('price', 0) or 0),
                    float(row.get('amount', 0) or 0),
                    float(row.get('pre_close', 0) or 0),
                    float(row.get('turnover_rate', 0) or 0),
                    float(row.get('volume_ratio', 0) or 0),
                    float(row.get('float_share', 0) or 0)
                ))
            conn.commit()
            total_auction += len(df)
            print(f"{len(df)} 条")
        else:
            print("无数据")
    except Exception as e:
        print(f"错误: {e}")
    time.sleep(0.5)
conn.close()
print(f"  ✅ 集合竞价总计: {total_auction} 条")

# ─── 8. 生成 realtime_quotes 快照 ────────────────────
print("\n=== [补充] 从最新K线生成实时行情快照 ===")
conn = get_conn()
latest_date = trading_days[0]
latest_date_fmt = latest_date[:4] + '-' + latest_date[4:6] + '-' + latest_date[6:8]
cursor = conn.execute("""
    SELECT stock_code, open, high, low, close, volume, amount
    FROM klines WHERE date = ?
""", (latest_date_fmt,))
rows = cursor.fetchall()
count = 0
for row in rows:
    code, o, h, l, c, vol, amt = row
    # 取前一天收盘价
    prev = conn.execute("""
        SELECT close FROM klines WHERE stock_code = ? AND date < ? ORDER BY date DESC LIMIT 1
    """, (code, latest_date_fmt)).fetchone()
    pre_close = prev[0] if prev else c
    change_pct = ((c - pre_close) / pre_close * 100) if pre_close > 0 else 0
    
    conn.execute("""
        INSERT OR REPLACE INTO realtime_quotes
        (stock_code, pre_close, open, high, low, close, vol, amount, change_percent, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    """, (code, pre_close, o, h, l, c, vol, amt, round(change_pct, 2)))
    count += 1
conn.commit()
conn.close()
print(f"  ✅ 实时行情快照: {count} 条")

# ─── 最终检查 ────────────────────────────────
print("\n=== 最终数据检查 ===")
conn = sqlite3.connect(DB_PATH)
for table in ['stocks', 'klines', 'realtime_quotes', 'daily_basic', 'fund_flow', 'market_moneyflow', 'auction_super_mainforce']:
    cnt = conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
    print(f"  {table}: {cnt}")
conn.close()

print("\n🎉 数据采集完成！")
