#!/usr/bin/env python3
"""
[Docker Version] 下载过去30天的A股数据
"""
import sqlite3
import time
import os
import sys
from datetime import datetime, timedelta
import asyncio

# 调整路径以适应 Docker 环境
sys.path.append('src')
from data_sources.tushare_client import TushareClient

# 手动指定最近30个自然日（包含交易日和非交易日，Tushare会自动过滤）
def get_last_30_days():
    """生成最近30个自然日的日期列表"""
    today = datetime.now()
    dates = []
    for i in range(30):
        date = (today - timedelta(days=i)).strftime('%Y%m%d')
        dates.append(date)
    return dates

def download_klines(client, conn, trading_days):
    """下载K线数据"""
    cursor = conn.cursor()
    total_klines = 0

    print(f"\n开始下载K线数据，共 {len(trading_days)} 天...")

    for i, trade_date in enumerate(trading_days, 1):
        print(f"[{i}/{len(trading_days)}] 下载 {trade_date}...")
        try:
            df = asyncio.run(client.get_daily_data_by_date(trade_date))

            if df is None or df.empty:
                print(f"  无数据（非交易日或节假日）")
                time.sleep(0.5)
                continue

            count = 0
            for _, row in df.iterrows():
                try:
                    stock_code = row['ts_code'].split('.')[0]
                    cursor.execute('''
                        INSERT OR REPLACE INTO klines
                        (stock_code, date, open, high, low, close, volume, amount, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    ''', (
                        stock_code,
                        row['trade_date'].strftime('%Y-%m-%d'),
                        float(row['open']),
                        float(row['high']),
                        float(row['low']),
                        float(row['close']),
                        int(row['vol'] * 100),
                        float(row['amount'] * 1000)
                    ))
                    count += 1
                except Exception as e:
                    print(f"  插入失败 {row.get('ts_code', 'unknown')}: {e}")

            conn.commit()
            total_klines += count
            print(f"  成功插入 {count} 条K线")
            time.sleep(0.5)  # API限流

        except Exception as e:
            print(f"  下载失败: {e}")
            time.sleep(1)

    print(f"\nK线数据下载完成，共 {total_klines} 条")
    return total_klines

def download_stocks_basic(client, conn):
    """下载股票基本信息"""
    print("\n下载股票基本信息...")

    stocks_df = asyncio.run(client.get_stock_basic())

    if stocks_df is None or stocks_df.empty:
        print("获取股票列表失败")
        return 0

    stocks_data = stocks_df.to_dict('records')
    print(f"获取到 {len(stocks_data)} 只股票")

    cursor = conn.cursor()
    stock_count = 0

    for stock in stocks_data:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO stocks
                (code, name, exchange, industry, created_at, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            """, (
                stock['symbol'],
                stock['name'],
                stock['exchange'],
                stock.get('industry', '未知')
            ))
            stock_count += 1
        except Exception as e:
            print(f"插入股票失败: {e}")

    conn.commit()
    print(f"股票信息插入完成，共 {stock_count} 只\n")
    return stock_count

def main():
    print("=" * 60)
    print("下载过去30天的A股数据 (Docker)")
    print("=" * 60)

    # 检查Token
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        print("\n错误: 未找到 TUSHARE_TOKEN")
        return

    # 初始化客户端
    print("\n初始化 Tushare 客户端...")
    client = TushareClient()

    if not client.is_available():
        print("错误: Tushare 客户端初始化失败")
        return

    # 连接数据库 (Docker路径)
    # 尝试连接 data/stock_picker.db，这是 Docker 挂载的默认路径
    db_path = 'data/stock_picker.db'
    
    # 确保目录存在
    if not os.path.exists('data'):
        os.makedirs('data')
        
    conn = sqlite3.connect(db_path)

    try:
        start_time = time.time()

        # 生成日期列表
        dates = get_last_30_days()
        
        # 即使有股票也重新下载，确保完整性
        stock_count = download_stocks_basic(client, conn)

        # 下载K线数据
        klines_count = download_klines(client, conn, dates)

        elapsed_time = time.time() - start_time

        print("\n" + "=" * 60)
        print("数据下载完成！")
        print("=" * 60)
        print(f"股票数量: {stock_count} 只")
        print(f"K线数据: {klines_count} 条")
        print(f"总耗时: {elapsed_time:.1f} 秒")
        print("=" * 60)

    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()

if __name__ == "__main__":
    main()
