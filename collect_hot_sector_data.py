#!/usr/bin/env python3
"""
专门采集热门板块股票数据
"""

import asyncio
import aiosqlite
import time
import os
import sys
from pathlib import Path
from datetime import datetime

# 添加data-service到Python路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from data_sources.tushare_client import TushareClient

async def collect_hot_sector_data():
    """采集热门板块股票数据"""
    print("=== 专门采集热门板块股票数据 ===\n")

    # 热门板块股票列表
    hot_sector_stocks = [
        # AI算力硬件板块
        "300474.SZ",  # 景嘉微
        "002371.SZ",  # 北方华创
        "002049.SZ",  # 紫光国微
        "300750.SZ",  # 宁德时代
        "600519.SH",  # 贵州茅台

        # 商业航天板块
        "600118.SH",  # 中国卫星
        "600879.SH",  # 航天电子
        "000901.SZ",  # 航天科技

        # CPO板块
        "300502.SZ",  # 新易盛
        "300394.SZ",  # 天孚通信
        "300308.SZ",  # 中际旭创

        # 其他热门股票
        "000858.SZ",  # 五粮液
        "002415.SZ",  # 海康威视
        "000001.SZ",  # 平安银行
    ]

    # 初始化Tushare客户端
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        print("错误: 未找到 TUSHARE_TOKEN 环境变量")
        print("请在 data-service/.env 文件中配置: TUSHARE_TOKEN=your_token")
        return

    os.environ['TUSHARE_TOKEN'] = token
    tushare_client = TushareClient()

    if not tushare_client.is_available():
        print("错误: Tushare 客户端初始化失败")
        return

    # 连接数据库
    db_path = "data/stock_picker.db"
    conn = await aiosqlite.connect(db_path)

    try:
        cursor = await conn.cursor()
        kline_count = 0
        flow_count = 0

        # 获取最近7个交易日
        end_date = datetime.now()
        start_date = end_date  # 只采集今天的数据

        trade_date = end_date.strftime('%Y%m%d')
        print(f"采集交易日: {trade_date}\n")

        for i, ts_code in enumerate(hot_sector_stocks, 1):
            stock_code = ts_code.split('.')[0]
            print(f"[{i}/{len(hot_sector_stocks)}] 处理 {ts_code}...")

            try:
                # 1. 采集日线数据
                print(f"  采集日线数据...")
                df = await tushare_client.get_daily_data(ts_code, trade_date, trade_date)
                if df is not None and not df.empty:
                    for _, row in df.iterrows():
                        await cursor.execute("""
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
                            int(row['vol'] * 100),
                            float(row['amount'] * 1000)
                        ))
                        kline_count += 1
                    print(f"  日线数据采集成功")
                else:
                    print(f"  日线数据无数据")

                # API限流
                time.sleep(0.5)

                # 2. 采集资金流向数据
                print(f"  采集资金流向数据...")
                df = await tushare_client.get_money_flow(ts_code, trade_date, trade_date)
                if df is not None and not df.empty:
                    for _, row in df.iterrows():
                        # 计算大单占比
                        total_amount = abs(row['buy_lg_amount']) + abs(row['sell_lg_amount']) + \
                                     abs(row['buy_elg_amount']) + abs(row['sell_elg_amount'])
                        small_amount = abs(row['buy_sm_amount']) + abs(row['sell_sm_amount']) + \
                                     abs(row['buy_md_amount']) + abs(row['sell_md_amount'])

                        large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0

                        await cursor.execute("""
                            INSERT OR REPLACE INTO fund_flow
                            (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            row['trade_date'].strftime('%Y-%m-%d'),
                            float(row.get('main_fund_flow', 0)),
                            float(row.get('retail_fund_flow', 0)),
                            float(row.get('extra_large_net_flow', 0)),
                            round(large_order_ratio, 4)
                        ))
                        flow_count += 1
                    print(f"  资金流向数据采集成功")
                else:
                    print(f"  资金流向数据无数据")

                # API限流
                time.sleep(0.5)

                await conn.commit()
                print(f"  完成 {ts_code} 数据采集\n")

            except Exception as e:
                print(f"  采集 {ts_code} 数据失败: {e}")
                time.sleep(1)

        print(f"\n数据采集完成")
        print(f"  新增K线数据: {kline_count} 条")
        print(f"  新增资金流向: {flow_count} 条")

    except Exception as e:
        print(f"数据采集过程中出现异常: {e}")
        import traceback
        traceback.print_exc()

    finally:
        await conn.close()

async def check_data_status():
    """检查数据状态"""
    print("\n=== 检查数据状态 ===\n")

    db_path = "data/stock_picker.db"
    conn = await aiosqlite.connect(db_path)

    try:
        cursor = await conn.cursor()

        # 检查热门股票是否有数据
        hot_stocks = ["300474", "002371", "002049", "300750", "600519"]

        for stock_code in hot_stocks:
            # 检查klines表
            await cursor.execute("""
                SELECT COUNT(*) FROM klines WHERE stock_code = ? AND date >= date('now', '-3 days')
            """, (stock_code,))
            count = await cursor.fetchone()
            has_klines = count[0] > 0

            # 检查fund_flow表
            await cursor.execute("""
                SELECT COUNT(*) FROM fund_flow WHERE stock_code = ? AND date >= date('now', '-3 days')
            """, (stock_code,))
            count = await cursor.fetchone()
            has_fund_flow = count[0] > 0

            if has_klines and has_fund_flow:
                print(f"OK {stock_code}: 有K线数据和资金流向数据")
            elif has_klines:
                print(f"○ {stock_code}: 只有K线数据")
            elif has_fund_flow:
                print(f"○ {stock_code}: 只有资金流向数据")
            else:
                print(f"x {stock_code}: 无数据")

    except Exception as e:
        print(f"检查数据状态失败: {e}")

    finally:
        await conn.close()

async def main():
    """主函数"""
    try:
        await collect_hot_sector_data()
        await check_data_status()
    except Exception as e:
        print(f"执行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())