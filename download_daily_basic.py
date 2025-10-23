"""
快速下载 daily_basic 数据的独立脚本
"""
import sys
import os
import time
from datetime import datetime, timedelta
import pandas as pd
from dotenv import load_dotenv

# 加载环境变量
env_path = os.path.join(os.path.dirname(__file__), 'data-service', '.env')
load_dotenv(env_path)
print(f"加载环境变量文件: {env_path}")
print(f"TUSHARE_TOKEN 已设置: {'是' if os.getenv('TUSHARE_TOKEN') else '否'}")

# 添加 data-service 到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'data-service', 'src'))

from data_sources.tushare_client import TushareClient
import asyncio
import aiosqlite

DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'data', 'stock_picker.db')

async def main():
    """下载最近7天的 daily_basic 数据"""

    # 初始化 Tushare 客户端
    tushare_client = TushareClient()

    # 生成最近7天的日期
    today = datetime.now()
    trading_days = []
    for i in range(7):
        date = (today - timedelta(days=i)).strftime('%Y%m%d')
        trading_days.append(date)

    print(f"准备下载 {len(trading_days)} 天的 daily_basic 数据...")
    print(f"日期范围: {trading_days[-1]} 到 {trading_days[0]}")

    total_count = 0

    async with aiosqlite.connect(DATABASE_PATH) as db:
        for i, trade_date in enumerate(trading_days, 1):
            print(f"\n[{i}/{len(trading_days)}] 下载 {trade_date} 的数据...")

            # 获取数据
            df = await tushare_client.get_daily_basic_by_date(trade_date)

            if df is not None and not df.empty:
                # 插入数据库
                for _, row in df.iterrows():
                    stock_code = row['ts_code'].split('.')[0]
                    await db.execute("""
                        INSERT OR REPLACE INTO daily_basic
                        (stock_code, trade_date, close, turnover_rate, turnover_rate_f, volume_ratio,
                         pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                         total_share, float_share, free_share, total_mv, circ_mv, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                    """, (
                        stock_code,
                        row['trade_date'].strftime('%Y-%m-%d'),
                        float(row['close']) if pd.notna(row['close']) else None,
                        float(row['turnover_rate']) if pd.notna(row['turnover_rate']) else None,
                        float(row['turnover_rate_f']) if pd.notna(row['turnover_rate_f']) else None,
                        float(row['volume_ratio']) if pd.notna(row['volume_ratio']) else None,
                        float(row['pe']) if pd.notna(row['pe']) else None,
                        float(row['pe_ttm']) if pd.notna(row['pe_ttm']) else None,
                        float(row['pb']) if pd.notna(row['pb']) else None,
                        float(row['ps']) if pd.notna(row['ps']) else None,
                        float(row['ps_ttm']) if pd.notna(row['ps_ttm']) else None,
                        float(row['dv_ratio']) if pd.notna(row['dv_ratio']) else None,
                        float(row['dv_ttm']) if pd.notna(row['dv_ttm']) else None,
                        float(row['total_share']) if pd.notna(row['total_share']) else None,
                        float(row['float_share']) if pd.notna(row['float_share']) else None,
                        float(row['free_share']) if pd.notna(row['free_share']) else None,
                        float(row['total_mv']) if pd.notna(row['total_mv']) else None,
                        float(row['circ_mv']) if pd.notna(row['circ_mv']) else None
                    ))

                await db.commit()
                total_count += len(df)
                print(f"  成功插入 {len(df)} 条记录")
            else:
                print(f"  {trade_date} 无数据（可能非交易日）")

            # API 限流
            time.sleep(0.6)

    print(f"\n完成！共插入 {total_count} 条 daily_basic 记录")

if __name__ == '__main__':
    asyncio.run(main())
