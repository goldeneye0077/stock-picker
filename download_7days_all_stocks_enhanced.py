#!/usr/bin/env python3
"""
增强版：高效批量下载最近 7 天 A 股全量数据

整合错误重试机制和数据完整性验证功能
使用 Tushare 批量接口，一次 API 调用获取某一天所有股票的数据，
大幅减少 API 调用次数，从 5000+ 次降至约 15 次。

特点:
- 自动获取交易日历，跳过非交易日
- 批量下载日线数据和资金流向数据
- 支持增量更新，避免重复下载
- 详细的进度日志和统计信息
- 错误重试机制（最大3次重试）
- 数据完整性验证
- 热门股票优先保障
"""

import sqlite3
import time
import os
from datetime import datetime, timedelta
import sys
from pathlib import Path
import asyncio

# 加载 .env 文件
from dotenv import load_dotenv

# 导入重试和验证工具
sys.path.append('.')
from retry_utils import sync_collect_with_retry, default_sync_collect_with_retry
from data_validation import DataValidator

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


def get_trading_days_with_retry(tushare_client, days: int = 7) -> list:
    """
    获取最近 N 个交易日的日期列表（带重试）

    Args:
        tushare_client: TushareClient 实例
        days: 需要获取的天数

    Returns:
        交易日列表，格式 ['20250930', '20250929', ...]
    """
    print(f"\n正在获取最近 {days} 天的交易日历...")

    def _get_trading_days():
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

    # 使用重试机制
    try:
        return sync_collect_with_retry(_get_trading_days)
    except Exception as e:
        print(f"获取交易日历失败: {e}")
        # 返回默认的最近7天
        end_date = datetime.now()
        return [(end_date - timedelta(days=i)).strftime('%Y%m%d') for i in range(days)]


def download_stocks_basic_with_retry(tushare_client, conn):
    """
    下载股票基本信息列表（带重试）

    Returns:
        股票数量
    """
    print("\n" + "=" * 60)
    print("第 1 步: 下载股票基本信息（带重试）")
    print("=" * 60)

    def _download_stocks():
        stocks_df = asyncio.run(tushare_client.get_stock_basic())

        if stocks_df is None or stocks_df.empty:
            raise Exception("获取股票列表失败")

        stocks_data = stocks_df.to_dict('records')
        print(f"获取到 {len(stocks_data)} 只股票")

        cursor = conn.cursor()

        for stock in stocks_data:
            try:
                # 转换 ts_code (000001.SZ) 为简单代码 (000001)
                code = stock['ts_code'].split('.')[0]

                cursor.execute("""
                    INSERT OR REPLACE INTO stocks
                    (code, name, exchange, industry, created_at, updated_at)
                    VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (
                    code,
                    stock['name'],
                    stock['exchange'],
                    stock.get('industry', '')
                ))

            except Exception as e:
                print(f"插入股票 {stock.get('ts_code', 'unknown')} 失败: {e}")

        conn.commit()
        print(f"成功更新 {len(stocks_data)} 只股票基本信息")
        return len(stocks_data)

    # 使用重试机制
    try:
        return sync_collect_with_retry(_download_stocks)
    except Exception as e:
        print(f"下载股票基本信息失败: {e}")
        return 0


def download_klines_batch_with_retry(tushare_client, conn, trading_days: list):
    """
    批量下载指定交易日的日线数据（带重试）

    Args:
        tushare_client: TushareClient 实例
        conn: 数据库连接
        trading_days: 交易日列表

    Returns:
        (总记录数, API调用次数)
    """
    print("\n" + "=" * 60)
    print("第 2 步: 批量下载日线数据（带重试）")
    print("=" * 60)

    cursor = conn.cursor()
    total_klines = 0
    api_calls = 0

    for i, trade_date in enumerate(trading_days, 1):
        print(f"\n[{i}/{len(trading_days)}] 下载 {trade_date} 的日线数据...")

        def _download_daily_data():
            # 批量获取该日期所有股票的日线数据
            df = asyncio.run(tushare_client.get_daily_data_by_date(trade_date))
            return df

        try:
            # 使用重试机制下载数据
            df = sync_collect_with_retry(_download_daily_data)
            api_calls += 1

            if df is None or df.empty:
                print(f"  x {trade_date} 无日线数据")
                time.sleep(0.5)
                continue

            # 批量插入数据库
            record_count = 0
            for _, row in df.iterrows():
                try:
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
                    record_count += 1

                except Exception as e:
                    print(f"  插入 {row.get('ts_code', 'unknown')} K线失败: {e}")

            conn.commit()
            total_klines += record_count
            print(f"  OK 成功插入 {record_count} 条K线数据")

            time.sleep(0.5)  # API 限流

        except Exception as e:
            print(f"  x 下载 {trade_date} 日线数据失败: {e}")
            time.sleep(1)

    print(f"\nOK 日线数据下载完成，共 {total_klines} 条K线，API调用 {api_calls} 次")
    return total_klines, api_calls


def download_moneyflow_batch_with_retry(tushare_client, conn, trading_days: list):
    """
    批量下载指定交易日的资金流向数据（带重试）

    Args:
        tushare_client: TushareClient 实例
        conn: 数据库连接
        trading_days: 交易日列表

    Returns:
        (总记录数, API调用次数)
    """
    print("\n" + "=" * 60)
    print("第 3 步: 批量下载资金流向数据（带重试）")
    print("=" * 60)

    cursor = conn.cursor()
    total_records = 0
    api_calls = 0

    for i, trade_date in enumerate(trading_days, 1):
        print(f"\n[{i}/{len(trading_days)}] 下载 {trade_date} 的资金流向数据...")

        def _download_moneyflow_data():
            # 批量获取该日期所有股票的资金流向
            df = asyncio.run(tushare_client.get_moneyflow_by_date(trade_date))
            return df

        try:
            # 使用重试机制下载数据
            df = sync_collect_with_retry(_download_moneyflow_data)
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
                    institutional_flow = float(row.get('extra_large_net_flow', 0))

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
            print(f"  x 下载 {trade_date} 资金流向失败: {e}")
            time.sleep(1)

    print(f"\nOK 资金流向数据下载完成，共 {total_records} 条记录，API调用 {api_calls} 次")
    return total_records, api_calls


def ensure_hot_sector_stocks_with_retry(tushare_client, conn, trading_days: list):
    """
    确保热门板块股票的数据被采集（带重试）

    即使批量接口没有返回这些股票的数据，也要单独为热门板块股票获取数据
    """
    print("\n" + "=" * 60)
    print("第 4 步: 确保热门板块股票数据完整（带重试）")
    print("=" * 60)

    # 热门股票列表（14只）
    hot_stocks = [
        ("300474", "SZ"), ("002371", "SZ"), ("002049", "SZ"),  # AI算力硬件
        ("300750", "SZ"),  # 新能源
        ("600519", "SH"), ("000858", "SZ"),  # 白酒
        ("600118", "SH"), ("600879", "SH"), ("000901", "SZ"),  # 商业航天
        ("300502", "SZ"), ("300394", "SZ"), ("300308", "SZ"),  # CPO板块
        ("002415", "SZ"), ("000001", "SZ")  # 其他
    ]

    cursor = conn.cursor()
    supplemented_count = 0

    for stock_code, exchange in hot_stocks:
        ts_code = f"{stock_code}.{exchange}"
        print(f"\n检查热门股票 {ts_code} 数据完整性...")

        # 检查最近交易日是否有数据
        latest_date = trading_days[0] if trading_days else datetime.now().strftime('%Y%m%d')
        check_date = latest_date[:4] + '-' + latest_date[4:6] + '-' + latest_date[6:8]

        cursor.execute("""
            SELECT COUNT(*) FROM klines
            WHERE stock_code = ? AND date = ?
        """, (stock_code, check_date))
        has_kline = cursor.fetchone()[0] > 0

        cursor.execute("""
            SELECT COUNT(*) FROM fund_flow
            WHERE stock_code = ? AND date = ?
        """, (stock_code, check_date))
        has_flow = cursor.fetchone()[0] > 0

        if has_kline and has_flow:
            print(f"  OK {ts_code} 已有最近数据，跳过")
            continue

        print(f"  x {ts_code} 数据不完整，开始补充采集...")

        # 补充采集K线数据
        if not has_kline:
            try:
                def _supplement_kline():
                    df = asyncio.run(tushare_client.get_daily_data(
                        ts_code,
                        start_date=trading_days[-1] if trading_days else latest_date,
                        end_date=latest_date
                    ))
                    return df

                df = sync_collect_with_retry(_supplement_kline)

                if df is not None and not df.empty:
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
                                int(row['vol'] * 100),
                                float(row['amount'] * 1000)
                            ))
                        except Exception as e:
                            print(f"    插入K线失败: {e}")

                    conn.commit()
                    print(f"    OK 补充 {len(df)} 条K线数据")
                    supplemented_count += 1

            except Exception as e:
                print(f"    x 补充K线数据失败: {e}")

        # 补充采集资金流向数据
        if not has_flow:
            try:
                def _supplement_flow():
                    df = asyncio.run(tushare_client.get_moneyflow(
                        ts_code,
                        start_date=trading_days[-1] if trading_days else latest_date,
                        end_date=latest_date
                    ))
                    return df

                df = sync_collect_with_retry(_supplement_flow)

                if df is not None and not df.empty:
                    for _, row in df.iterrows():
                        try:
                            # 计算大单占比
                            total_amount = abs(row['buy_lg_amount']) + abs(row['sell_lg_amount']) + \
                                         abs(row['buy_elg_amount']) + abs(row['sell_elg_amount'])
                            small_amount = abs(row['buy_sm_amount']) + abs(row['sell_sm_amount']) + \
                                         abs(row['buy_md_amount']) + abs(row['sell_md_amount'])

                            large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0
                            institutional_flow = float(row.get('extra_large_net_flow', 0))

                            cursor.execute("""
                                INSERT OR REPLACE INTO fund_flow
                                (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                            """, (
                                stock_code,
                                row['trade_date'].strftime('%Y-%m-%d'),
                                float(row['main_fund_flow']),
                                float(row['retail_fund_flow']),
                                institutional_flow,
                                round(large_order_ratio, 4)
                            ))
                        except Exception as e:
                            print(f"    插入资金流向失败: {e}")

                    conn.commit()
                    print(f"    OK 补充 {len(df)} 条资金流向数据")
                    supplemented_count += 1

            except Exception as e:
                print(f"    x 补充资金流向数据失败: {e}")

        time.sleep(0.5)  # API 限流

    print(f"\n热门股票数据补充完成，共补充 {supplemented_count} 只股票数据")


def verify_data_quality():
    """验证数据质量"""
    print("\n" + "=" * 60)
    print("第 5 步: 数据质量验证")
    print("=" * 60)

    validator = DataValidator()

    try:
        # 异步运行验证
        async def _run_validation():
            # 生成质量报告
            report = await validator.generate_quality_report()

            print(f"\n数据质量报告:")
            print(f"  报告时间: {report['report_date']}")
            print(f"  日期范围: {report['date_range']}")
            print(f"  总体评分: {report['overall_score']}/100 ({report['quality_level']})")
            print(f"  评分明细:")
            print(f"    数据覆盖率: {report['score_breakdown']['coverage_score']:.1f}分")
            print(f"    热门股票: {report['score_breakdown']['hot_sector_score']:.1f}分")
            print(f"    数据一致性: {report['score_breakdown']['consistency_score']:.1f}分")

            print(f"\n  覆盖率指标:")
            print(f"    K线平均覆盖率: {report['coverage_metrics']['avg_kline_coverage']:.1%}")
            print(f"    资金流向平均覆盖率: {report['coverage_metrics']['avg_flow_coverage']:.1%}")
            print(f"    数据一致性: {report['coverage_metrics']['avg_consistency']:.1%}")

            print(f"\n  热门股票指标:")
            print(f"    日期范围: {report['hot_sector_metrics']['date_range']}")
            print(f"    K线平均覆盖率: {report['hot_sector_metrics']['avg_kline_coverage']:.1%}")
            print(f"    资金流向平均覆盖率: {report['hot_sector_metrics']['avg_flow_coverage']:.1%}")

            return report['overall_score']

        # 运行异步验证
        score = asyncio.run(_run_validation())

        if score >= 90:
            print(f"\n✅ 数据质量优秀 ({score:.1f}/100)")
        elif score >= 80:
            print(f"\n⚠️  数据质量良好 ({score:.1f}/100)，有改进空间")
        else:
            print(f"\n❌ 数据质量需要改进 ({score:.1f}/100)")

    except Exception as e:
        print(f"数据质量验证失败: {e}")


def main():
    """主函数"""
    print("智能选股系统 - 增强版数据采集")
    print("=" * 60)
    print("特点: 错误重试 + 数据验证 + 热门股票保障")
    print("=" * 60)

    start_time = time.time()

    try:
        # 1. 初始化 Tushare 客户端
        print("\n初始化 Tushare 客户端...")
        tushare_client = TushareClient()
        if not tushare_client.is_available():
            print("错误: Tushare 客户端不可用，请检查 token 配置")
            return 1

        # 2. 连接数据库
        db_path = "data/stock_picker.db"
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        conn = sqlite3.connect(db_path)
        print(f"已连接数据库: {db_path}")

        # 3. 获取交易日历（带重试）
        trading_days = get_trading_days_with_retry(tushare_client, days=7)

        # 4. 下载股票基本信息（带重试）
        stock_count = download_stocks_basic_with_retry(tushare_client, conn)

        # 5. 批量下载日线数据（带重试）
        kline_count, kline_api_calls = download_klines_batch_with_retry(tushare_client, conn, trading_days)

        # 6. 批量下载资金流向数据（带重试）
        flow_count, flow_api_calls = download_moneyflow_batch_with_retry(tushare_client, conn, trading_days)

        # 7. 确保热门股票数据完整（带重试）
        ensure_hot_sector_stocks_with_retry(tushare_client, conn, trading_days)

        # 8. 验证数据质量
        verify_data_quality()

        # 9. 统计信息
        elapsed_time = time.time() - start_time
        total_api_calls = kline_api_calls + flow_api_calls

        print("\n" + "=" * 60)
        print("数据采集完成!")
        print("=" * 60)
        print(f"股票总数: {stock_count} 只")
        print(f"K线数据: {kline_count} 条")
        print(f"资金流向数据: {flow_count} 条")
        print(f"API调用次数: {total_api_calls} 次")
        print(f"总耗时: {elapsed_time:.1f} 秒")
        print(f"平均每秒处理: {kline_count/elapsed_time:.1f} 条K线")
        print("=" * 60)

        conn.close()
        return 0

    except Exception as e:
        print(f"\n❌ 数据采集失败: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)