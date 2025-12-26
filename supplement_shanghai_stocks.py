#!/usr/bin/env python3
"""
补充上证股票数据
由于Tushare免费API可能返回不完整数据，此脚本专门补充上证股票数据
"""

import sqlite3
import time
import os
from datetime import datetime, timedelta
import sys
from pathlib import Path

# 加载 .env 文件
from dotenv import load_dotenv

# 加载 data-service/.env 文件
env_path = Path(__file__).parent / 'data-service' / '.env'
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
    print(f"已加载配置文件: {env_path}")
else:
    print(f"警告: 未找到配置文件 {env_path}")

# 添加 data-service 路径以导入 tushare 客户端
sys.path.append('data-service/src')
from data_sources.tushare_client import TushareClient

def get_shanghai_stocks(tushare_client):
    """专门获取上证股票列表"""
    import asyncio

    print("\n正在获取上证股票列表...")

    try:
        # 获取所有股票
        df = asyncio.run(tushare_client.get_stock_basic())

        if df is None or df.empty:
            print("错误: 获取股票列表失败")
            return []

        # 筛选上证股票（代码以60开头，交易所为SSE）
        shanghai_stocks = df[(df['symbol'].str.startswith('60')) & (df['exchange'] == 'SSE')]

        print(f"找到 {len(shanghai_stocks)} 只上证股票")
        return shanghai_stocks.to_dict('records')

    except Exception as e:
        print(f"获取上证股票失败: {e}")
        return []

def download_shanghai_daily_data(tushare_client, conn, days=7):
    """下载上证股票的日线数据"""
    import asyncio

    print("\n" + "=" * 60)
    print("下载上证股票日线数据")
    print("=" * 60)

    # 获取最近N个交易日
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days * 2)

    # 获取交易日历
    cal_df = asyncio.run(tushare_client.get_trade_cal(
        start_date.strftime('%Y%m%d'),
        end_date.strftime('%Y%m%d')
    ))

    if cal_df is None or cal_df.empty:
        print("警告: 无法获取交易日历，使用最近7个自然日")
        trading_days = [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]
    else:
        # 筛选出交易日
        trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
        trading_days = [d.strftime('%Y%m%d') for d in sorted(trading_days, reverse=True)]
        trading_days = trading_days[:days]

    print(f"将下载 {len(trading_days)} 个交易日的上证股票数据: {', '.join(trading_days)}")

    cursor = conn.cursor()
    total_klines = 0

    # 获取上证股票列表
    shanghai_stocks = get_shanghai_stocks(tushare_client)
    if not shanghai_stocks:
        print("错误: 未获取到上证股票列表")
        return 0

    # 逐个股票下载数据（因为Tushare批量接口可能不完整）
    for i, stock in enumerate(shanghai_stocks, 1):
        stock_code = stock['symbol']
        stock_name = stock['name']

        print(f"\n[{i}/{len(shanghai_stocks)}] 下载 {stock_code} {stock_name} 的数据...")

        for trade_date in trading_days:
            try:
                # 获取单只股票单日数据
                df = asyncio.run(tushare_client.get_daily_data(
                    f"{stock_code}.SH",  # 上证股票后缀为.SH
                    start_date=trade_date,
                    end_date=trade_date
                ))

                if df is None or df.empty:
                    continue

                # 插入数据
                for _, row in df.iterrows():
                    try:
                        cursor.execute("""
                            INSERT OR REPLACE INTO klines
                            (stock_code, date, open, high, low, close, volume, amount, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            row['trade_date'].strftime('%Y-%m-%d'),
                            float(row['open']),
                            float(row['high']),
                            float(row['low']),
                            float(row['close']),
                            int(row['vol'] * 100),  # 转换为股数
                            float(row['amount'] * 1000)  # 转换为元
                        ))
                        total_klines += 1

                    except Exception as e:
                        print(f"  插入 {stock_code} {trade_date} 数据失败: {e}")

                conn.commit()

            except Exception as e:
                print(f"  下载 {stock_code} {trade_date} 数据失败: {e}")

            # API限流
            time.sleep(0.5)

        # 每10只股票显示一次进度
        if i % 10 == 0:
            print(f"  进度: {i}/{len(shanghai_stocks)}，已下载 {total_klines} 条K线数据")

    print(f"\n上证股票数据下载完成，共下载 {total_klines} 条K线数据")
    return total_klines

def update_stock_basic_info(tushare_client, conn):
    """更新股票基本信息，确保上证股票信息完整"""
    import asyncio

    print("\n" + "=" * 60)
    print("更新股票基本信息")
    print("=" * 60)

    try:
        df = asyncio.run(tushare_client.get_stock_basic())

        if df is None or df.empty:
            print("错误: 获取股票基本信息失败")
            return 0

        cursor = conn.cursor()
        stock_count = 0

        for stock in df.to_dict('records'):
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
                print(f"插入股票 {stock.get('symbol', 'unknown')} 失败: {e}")

        conn.commit()
        print(f"OK 股票基本信息更新完成，共 {stock_count} 只股票")
        return stock_count

    except Exception as e:
        print(f"更新股票基本信息失败: {e}")
        return 0

def main():
    """主函数"""
    print("=" * 60)
    print("上证股票数据补充工具")
    print("=" * 60)

    # 初始化Tushare客户端
    tushare_client = TushareClient()
    if not tushare_client.pro:
        print("错误: Tushare客户端初始化失败，请检查TUSHARE_TOKEN配置")
        return

    # 数据库路径
    db_path = Path(__file__).parent / "data" / "stock_picker.db"
    print(f"数据库路径: {db_path}")

    if not db_path.exists():
        print(f"错误: 数据库文件不存在: {db_path}")
        return

    # 连接数据库
    conn = sqlite3.connect(str(db_path))

    try:
        # 1. 更新股票基本信息
        update_stock_basic_info(tushare_client, conn)

        # 2. 下载上证股票日线数据
        download_shanghai_daily_data(tushare_client, conn, days=7)

        print("\n" + "=" * 60)
        print("上证股票数据补充完成！")
        print("=" * 60)

    except Exception as e:
        print(f"程序执行失败: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()