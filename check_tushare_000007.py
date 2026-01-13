#!/usr/bin/env python3
from datetime import datetime
from pathlib import Path
import os

from dotenv import load_dotenv
import tushare as ts
import sqlite3


def main():
    env_path = Path("data-service/.env")
    print(f"加载 .env: {env_path} 存在={env_path.exists()}")
    if env_path.exists():
        load_dotenv(env_path)

    token = os.getenv("TUSHARE_TOKEN")
    print("TUSHARE_TOKEN 是否存在:", bool(token))
    if not token:
        print("未找到 TUSHARE_TOKEN，无法调用 Tushare")
        return

    pro = ts.pro_api(token)

    start_date = "20000101"
    end_date = datetime.today().strftime("%Y%m%d")
    print("查询区间:", start_date, "->", end_date)

    print("\n从 Tushare stk_factor 获取 000007.SZ 原始数据...")
    df = pro.stk_factor(
        ts_code="000007.SZ",
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,pe_ttm,pb,ps_ttm,dv_ttm",
    )

    if df is None or df.empty:
        print("Tushare stk_factor 返回空数据")
        return

    df = df.sort_values("trade_date")
    print("总行数:", len(df))
    print("列名:", list(df.columns))
    print("\n列类型 dtypes：")
    print(df.dtypes)

    print("\n最早 5 行：")
    print(df.head(5))

    print("\n最近 20 行：")
    print(df.tail(20))

    sample_dates = [
        "20251230",
        "20251231",
        "20260105",
        "20260106",
        "20260107",
        "20260108",
        "20260109",
        "20260112",
        "20260113",
    ]
    for d in sample_dates:
        sub = df[df["trade_date"] == d]
        print(f"\n日期 {d} 的行数: {len(sub)}")
        if not sub.empty:
            print(sub)

    print("\n从 Tushare daily_basic 获取 000007.SZ 原始数据...")
    df_basic = pro.daily_basic(
        ts_code="000007.SZ",
        start_date=start_date,
        end_date=end_date,
        fields="ts_code,trade_date,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,turnover_rate,volume_ratio,total_share,float_share,free_share,total_mv,circ_mv",
    )

    if df_basic is None or df_basic.empty:
        print("Tushare daily_basic 返回空数据")
        return

    df_basic = df_basic.sort_values("trade_date")
    print("daily_basic 总行数:", len(df_basic))
    print("daily_basic 列名:", list(df_basic.columns))
    print("\ndaily_basic 列类型 dtypes：")
    print(df_basic.dtypes)

    print("\n daily_basic 最早 5 行：")
    print(df_basic.head(5))

    print("\n daily_basic 最近 20 行：")
    print(df_basic.tail(20))

    for d in sample_dates:
        sub = df_basic[df_basic["trade_date"] == d]
        print(f"\n daily_basic 日期 {d} 的行数: {len(sub)}")
        if not sub.empty:
            print(sub)

    print("\n本地数据库 daily_basic 表中 000007 的最新记录：")
    db_path = Path("data/stock_picker.db")
    if not db_path.exists():
        print(f"数据库文件不存在: {db_path}")
        return

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT stock_code, trade_date, pe, pe_ttm, pb, ps, dv_ratio
            FROM daily_basic
            WHERE stock_code = '000007'
            ORDER BY trade_date DESC
            LIMIT 10
            """
        )
        rows = cur.fetchall()
        for r in rows:
            print(r)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
