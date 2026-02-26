#!/usr/bin/env python3
"""Fill sector_moneyflow with real Tushare industry flow data."""

from __future__ import annotations

import os
import sqlite3
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Iterable, List

import pandas as pd
import tushare as ts
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "stock_picker.db"
ENV_PATH = ROOT / "data-service" / ".env"


def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def to_iso_date(value: object, fallback_yyyymmdd: str) -> str:
    if hasattr(value, "strftime"):
        return value.strftime("%Y-%m-%d")
    text = str(value or "").strip()
    if len(text) >= 10 and "-" in text:
        return text[:10]
    if len(text) == 8 and text.isdigit():
        return f"{text[:4]}-{text[4:6]}-{text[6:8]}"
    return f"{fallback_yyyymmdd[:4]}-{fallback_yyyymmdd[4:6]}-{fallback_yyyymmdd[6:8]}"


def normalize_sector_name(name: str) -> str:
    normalized = name.strip()
    for suffix in ("行业", "概念", "板块", "指数", "（同花顺）"):
        normalized = normalized.replace(suffix, "")
    return normalized.strip().lower()


def get_recent_trading_days(pro: ts.pro_api, days: int) -> List[str]:
    end_date = datetime.now()
    start_date = end_date - timedelta(days=max(14, days * 3))
    cal = pro.trade_cal(start_date=start_date.strftime("%Y%m%d"), end_date=end_date.strftime("%Y%m%d"))
    if cal is None or cal.empty:
        return []
    open_days = cal[cal["is_open"] == 1]["cal_date"].tolist()
    return sorted(open_days, reverse=True)[:days]


def build_ths_name_mapping(pro: ts.pro_api) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    try:
        df = pro.ths_index(exchange="A", type="I")
        if df is None or df.empty:
            return mapping
        for _, row in df.iterrows():
            code = str(row.get("ts_code") or "").strip()
            name = str(row.get("name") or "").strip()
            if code and name:
                mapping[code] = name
    except Exception as exc:  # noqa: BLE001
        print(f"[warn] failed to load ths_index mapping: {exc}")
    return mapping


def to_float(value: object) -> float | None:
    return float(value) if pd.notna(value) else None


def to_int(value: object) -> int | None:
    return int(value) if pd.notna(value) else None


def upsert_sector_rows(
    conn: sqlite3.Connection,
    df: pd.DataFrame,
    ts_name_map: Dict[str, str],
    fallback_trade_date: str,
) -> int:
    inserted = 0
    cur = conn.cursor()

    for _, row in df.iterrows():
        ts_code = str(row.get("ts_code") or "").strip() or None
        row_name = str(row.get("name") or "").strip()
        mapped_name = ts_name_map.get(ts_code or "", "")
        sector_name = row_name or mapped_name
        if not sector_name:
            continue

        # Prefer clearer mapped ths_index name when both names normalize identically.
        if mapped_name and normalize_sector_name(mapped_name) == normalize_sector_name(sector_name):
            sector_name = mapped_name

        trade_date_text = to_iso_date(row.get("trade_date"), fallback_trade_date)

        cur.execute(
            """
            INSERT OR REPLACE INTO sector_moneyflow
            (trade_date, ts_code, name, pct_change, close, net_amount, net_amount_rate,
             buy_elg_amount, buy_elg_amount_rate, buy_lg_amount, buy_lg_amount_rate,
             buy_md_amount, buy_md_amount_rate, buy_sm_amount, buy_sm_amount_rate,
             rank, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            """,
            (
                trade_date_text,
                ts_code,
                sector_name,
                to_float(row.get("pct_change")),
                to_float(row.get("close")),
                to_float(row.get("net_amount")),
                to_float(row.get("net_amount_rate")),
                to_float(row.get("buy_elg_amount")),
                to_float(row.get("buy_elg_amount_rate")),
                to_float(row.get("buy_lg_amount")),
                to_float(row.get("buy_lg_amount_rate")),
                to_float(row.get("buy_md_amount")),
                to_float(row.get("buy_md_amount_rate")),
                to_float(row.get("buy_sm_amount")),
                to_float(row.get("buy_sm_amount_rate")),
                to_int(row.get("rank")),
            ),
        )
        inserted += 1

    conn.commit()
    return inserted


def print_preview(conn: sqlite3.Connection, rows: int = 10) -> None:
    cursor = conn.execute(
        """
        SELECT trade_date, name, pct_change, net_amount, rank
        FROM sector_moneyflow
        ORDER BY trade_date DESC, rank ASC
        LIMIT ?
        """,
        (rows,),
    )
    result = cursor.fetchall()
    if not result:
        print("No sector_moneyflow rows found.")
        return

    print("\nLatest sector_moneyflow rows:")
    print(f"{'date':<12} {'sector':<20} {'pct':>8} {'net(yi)':>12} {'rank':>6}")
    print("-" * 64)
    for trade_date, name, pct_change, net_amount, rank in result:
        pct = float(pct_change or 0)
        net_yi = float(net_amount or 0) / 100000000
        print(f"{trade_date:<12} {str(name)[:20]:<20} {pct:>7.2f}% {net_yi:>11.2f} {int(rank or 0):>6}")


def main(argv: Iterable[str]) -> int:
    load_dotenv(dotenv_path=ENV_PATH)
    token = os.getenv("TUSHARE_TOKEN", "").strip()
    if not token:
        print("[error] TUSHARE_TOKEN is missing in data-service/.env")
        return 1

    days = 5
    args = list(argv)
    if args:
        try:
            days = max(1, min(30, int(args[0])))
        except ValueError:
            print(f"[warn] invalid days '{args[0]}', fallback to 5")

    ts.set_token(token)
    pro = ts.pro_api()

    if not DB_PATH.exists():
        print(f"[error] database not found: {DB_PATH}")
        return 1

    print(f"Database: {DB_PATH}")
    print(f"Collecting recent {days} trading day(s) from moneyflow_ind_dc...")

    trading_days = get_recent_trading_days(pro, days)
    if not trading_days:
        print("[error] no trading days resolved from trade_cal")
        return 1

    print(f"Trading days: {', '.join(trading_days)}")
    ts_name_map = build_ths_name_mapping(pro)
    if ts_name_map:
        print(f"Loaded ths_index mapping rows: {len(ts_name_map)}")

    total_rows = 0
    conn = get_connection()
    try:
        for idx, td in enumerate(trading_days, 1):
            print(f"[{idx}/{len(trading_days)}] {td} ...", end=" ")
            try:
                df = pro.moneyflow_ind_dc(trade_date=td)
            except Exception as exc:  # noqa: BLE001
                print(f"failed: {exc}")
                continue

            if df is None or df.empty:
                print("empty")
                continue

            inserted = upsert_sector_rows(conn, df, ts_name_map, td)
            total_rows += inserted
            print(f"inserted {inserted}")

        print(f"\nDone. total inserted/updated rows: {total_rows}")
        cursor = conn.execute("SELECT COUNT(*), MIN(trade_date), MAX(trade_date) FROM sector_moneyflow")
        total, min_date, max_date = cursor.fetchone()
        print(f"sector_moneyflow count={total}, range={min_date} ~ {max_date}")
        print_preview(conn, rows=10)
    finally:
        conn.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
