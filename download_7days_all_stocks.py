#!/usr/bin/env python3
"""
高效批量下载最近 7 天 A 股全量数据

使用 Tushare 批量接口，一次 API 调用获取某一天所有股票的数据，
大幅减少 API 调用次数，从 5000+ 次降至约 15 次。

特点:
- 自动获取交易日历，跳过非交易日
- 批量下载日线数据和资金流向数据
- 支持增量更新，避免重复下载
- 详细的进度日志和统计信息
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


def get_trading_days(tushare_client, days: int = 7) -> list:
    """
    获取最近 N 个交易日的日期列表

    Args:
        tushare_client: TushareClient 实例
        days: 需要获取的天数

    Returns:
        交易日列表，格式 ['20250930', '20250929', ...]
    """
    import asyncio

    print(f"\n正在获取最近 {days} 天的交易日历...")

    # 计算日期范围（考虑周末和节假日，取更长的范围）
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days * 2)  # 取 2 倍天数确保覆盖

    # 获取交易日历
    cal_df = asyncio.run(tushare_client.get_trade_cal(
        start_date.strftime('%Y%m%d'),
        end_date.strftime('%Y%m%d')
    ))

    if cal_df is None or cal_df.empty:
        print("警告: 无法获取交易日历，使用最近 7 个自然日")
        return [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]

    # 筛选出交易日
    trading_days = cal_df[cal_df['is_open'] == 1]['cal_date'].tolist()
    # 转换为字符串格式并倒序排列（最近的在前）
    trading_days = [d.strftime('%Y%m%d') for d in sorted(trading_days, reverse=True)]

    # 取最近的 N 个交易日
    result = trading_days[:days]
    print(f"找到 {len(result)} 个交易日: {', '.join(result)}")

    return result


def download_stocks_basic(tushare_client, conn):
    """
    下载股票基本信息列表

    Returns:
        股票数量
    """
    import asyncio

    print("\n" + "=" * 60)
    print("第 1 步: 下载股票基本信息")
    print("=" * 60)

    stocks_df = asyncio.run(tushare_client.get_stock_basic())

    if stocks_df is None or stocks_df.empty:
        print("错误: 获取股票列表失败")
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

            if stock_count % 1000 == 0:
                print(f"  已插入 {stock_count} 只股票...")

        except Exception as e:
            print(f"插入股票 {stock.get('ts_code', 'unknown')} 失败: {e}")

    conn.commit()
    print(f"OK 股票基本信息插入完成，共 {stock_count} 只\n")

    return stock_count


def download_daily_data_batch(tushare_client, conn, trading_days: list):
    """
    批量下载指定交易日的日线数据

    Args:
        tushare_client: TushareClient 实例
        conn: 数据库连接
        trading_days: 交易日列表

    Returns:
        (总K线数, API调用次数)
    """
    import asyncio

    print("\n" + "=" * 60)
    print("第 2 步: 批量下载日线数据")
    print("=" * 60)

    cursor = conn.cursor()
    total_klines = 0
    api_calls = 0

    for i, trade_date in enumerate(trading_days, 1):
        print(f"\n[{i}/{len(trading_days)}] 下载 {trade_date} 的日线数据...")

        try:
            # 批量获取该日期所有股票的数据
            df = asyncio.run(tushare_client.get_daily_data_by_date(trade_date))
            api_calls += 1

            if df is None or df.empty:
                print(f"  x {trade_date} 无数据（非交易日）")
                time.sleep(0.5)  # API 限流
                continue

            # 批量插入数据库
            kline_count = 0
            for _, row in df.iterrows():
                try:
                    # 从 ts_code 提取股票代码（例如: 000001.SZ -> 000001）
                    stock_code = row['ts_code'].split('.')[0]

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
                    kline_count += 1

                except Exception as e:
                    print(f"  插入 {row.get('ts_code', 'unknown')} 失败: {e}")

            conn.commit()
            total_klines += kline_count
            print(f"  OK 成功插入 {kline_count} 条K线数据")

            # API 限流：每分钟 120 次，安全起见每次间隔 0.5 秒
            time.sleep(0.5)

        except Exception as e:
            print(f"  ✗ 下载 {trade_date} 数据失败: {e}")
            time.sleep(1)

    print(f"\nOK 日线数据下载完成，共 {total_klines} 条K线，API调用 {api_calls} 次")
    return total_klines, api_calls


def download_moneyflow_batch(tushare_client, conn, trading_days: list):
    """
    批量下载指定交易日的资金流向数据

    Args:
        tushare_client: TushareClient 实例
        conn: 数据库连接
        trading_days: 交易日列表

    Returns:
        (总记录数, API调用次数)
    """
    import asyncio

    print("\n" + "=" * 60)
    print("第 3 步: 批量下载资金流向数据")
    print("=" * 60)

    cursor = conn.cursor()
    total_records = 0
    api_calls = 0

    for i, trade_date in enumerate(trading_days, 1):
        print(f"\n[{i}/{len(trading_days)}] 下载 {trade_date} 的资金流向数据...")

        try:
            # 批量获取该日期所有股票的资金流向
            df = asyncio.run(tushare_client.get_moneyflow_by_date(trade_date))
            api_calls += 1

            if df is None or df.empty:
                print(f"  x {trade_date} 无资金流向数据")
                time.sleep(0.5)
                continue

            # 批量插入数据库
            record_count = 0
            for _, row in df.iterrows():
                try:
                    stock_code = row['ts_code'].split('.')[0]

                    # 计算大单占比
                    total_amount = abs(row['buy_lg_amount']) + abs(row['sell_lg_amount']) + \
                                   abs(row['buy_elg_amount']) + abs(row['sell_elg_amount'])
                    small_amount = abs(row['buy_sm_amount']) + abs(row['sell_sm_amount']) + \
                                   abs(row['buy_md_amount']) + abs(row['sell_md_amount'])

                    large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0

                    # 计算机构资金流入（使用特大单作为机构资金的近似值）
                    # 主力资金 = 大单 + 特大单
                    # 机构资金近似为特大单
                    institutional_flow = float(row.get('extra_large_net_flow', 0))

                    # 调试：打印前5条数据查看
                    if record_count < 5:
                        print(f"  调试 - {stock_code}: main={row['main_fund_flow']}, extra_large={row.get('extra_large_net_flow', 'N/A')}, inst={institutional_flow}")

                    cursor.execute("""
                        INSERT OR REPLACE INTO fund_flow
                        (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                    """, (
                        stock_code,
                        row['trade_date'].strftime('%Y-%m-%d'),
                        float(row['main_fund_flow']),
                        float(row['retail_fund_flow']),
                        institutional_flow,  # 使用特大单作为机构资金
                        round(large_order_ratio, 4)
                    ))
                    record_count += 1

                except Exception as e:
                    print(f"  插入 {row.get('ts_code', 'unknown')} 资金流向失败: {e}")

            conn.commit()
            total_records += record_count
            print(f"  OK 成功插入 {record_count} 条资金流向数据")

            time.sleep(0.5)  # API 限流

        except Exception as e:
            print(f"  ✗ 下载 {trade_date} 资金流向失败: {e}")
            time.sleep(1)

    print(f"\nOK 资金流向数据下载完成，共 {total_records} 条记录，API调用 {api_calls} 次")
    return total_records, api_calls


def generate_volume_analysis(conn):
    """
    基于已下载的 K 线数据生成成交量分析
    """
    print("\n" + "=" * 60)
    print("第 4 步: 生成成交量分析数据")
    print("=" * 60)

    cursor = conn.cursor()

    # 获取最近有数据的股票
    cursor.execute("""
        SELECT DISTINCT stock_code FROM klines
        WHERE date >= date('now', '-10 days')
        ORDER BY stock_code
    """)
    stocks = cursor.fetchall()

    print(f"为 {len(stocks)} 只股票生成成交量分析...")

    analysis_count = 0

    for i, (stock_code,) in enumerate(stocks):
        # 获取该股票最近 30 天的 K 线数据
        cursor.execute("""
            SELECT volume, date FROM klines
            WHERE stock_code = ?
            ORDER BY date DESC LIMIT 30
        """, (stock_code,))

        kline_data = cursor.fetchall()

        if len(kline_data) >= 20:
            volumes = [row[0] for row in kline_data]
            avg_volume = sum(volumes) / len(volumes)

            # 为最近 7 天生成分析
            for volume, date in kline_data[:7]:
                if avg_volume > 0:
                    volume_ratio = volume / avg_volume
                    is_surge = volume_ratio > 2.0

                    cursor.execute("""
                        INSERT OR REPLACE INTO volume_analysis
                        (stock_code, date, volume_ratio, avg_volume_20, is_volume_surge, analysis_result, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                    """, (
                        stock_code, date, round(volume_ratio, 2), int(avg_volume),
                        is_surge, f"量比{volume_ratio:.2f}倍" + ("，异常放量" if is_surge else "")
                    ))
                    analysis_count += 1

        if (i + 1) % 1000 == 0:
            conn.commit()
            print(f"  已处理 {i+1}/{len(stocks)} 只股票...")

    conn.commit()
    print(f"OK 成交量分析完成，生成 {analysis_count} 条分析记录\n")

    return analysis_count


def main():
    """主函数"""
    print("\n" + "=" * 60)
    print("高效批量下载最近 7 天 A 股全量数据")
    print("=" * 60)

    # 检查环境变量
    token = os.getenv('TUSHARE_TOKEN')
    if not token:
        print("\n错误: 未找到 TUSHARE_TOKEN 环境变量")
        print("请在 data-service/.env 文件中配置: TUSHARE_TOKEN=your_token")
        return

    # 初始化 Tushare 客户端
    print("\n初始化 Tushare 客户端...")
    os.environ['TUSHARE_TOKEN'] = token
    tushare_client = TushareClient()

    if not tushare_client.is_available():
        print("错误: Tushare 客户端初始化失败")
        return

    # 连接数据库
    conn = sqlite3.connect('data/stock_picker.db')

    try:
        start_time = time.time()

        # 获取交易日列表
        trading_days = get_trading_days(tushare_client, days=7)
        if not trading_days:
            print("错误: 无法获取交易日列表")
            return

        # 第 1 步: 下载股票基本信息
        stock_count = download_stocks_basic(tushare_client, conn)
        total_api_calls = 1  # 股票列表 1 次

        # 第 2 步: 批量下载日线数据
        klines_count, api_calls = download_daily_data_batch(tushare_client, conn, trading_days)
        total_api_calls += api_calls

        # 第 3 步: 批量下载资金流向数据
        flow_count, api_calls = download_moneyflow_batch(tushare_client, conn, trading_days)
        total_api_calls += api_calls

        # 第 4 步: 生成成交量分析
        analysis_count = generate_volume_analysis(conn)

        # 统计信息
        elapsed_time = time.time() - start_time

        print("\n" + "=" * 60)
        print("数据下载完成！")
        print("=" * 60)
        print(f"OK 股票数量: {stock_count} 只")
        print(f"OK K线数据: {klines_count} 条")
        print(f"OK 资金流向: {flow_count} 条")
        print(f"OK 成交量分析: {analysis_count} 条")
        print(f"OK API 调用次数: {total_api_calls} 次（远低于 200 次限额）")
        print(f"OK 总耗时: {elapsed_time:.1f} 秒")
        print("=" * 60)

    except Exception as e:
        print(f"\n错误: 数据下载过程中出现异常: {e}")
        import traceback
        traceback.print_exc()

    finally:
        conn.close()


if __name__ == "__main__":
    main()