#!/usr/bin/env python3
"""
下载大盘资金流向数据（东财市场资金流向）

从 Tushare 获取市场整体的资金流向数据，包括：
- 上证、深证指数
- 主力资金净流入
- 超大单、大单、中单、小单的净流入

特点:
- 支持指定日期范围
- 自动处理数据更新
- 详细的进度日志
"""
import sqlite3
import time
import sys
from datetime import datetime, timedelta
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

# 添加 data-service 到 Python 路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from data_sources.tushare_client import TushareClient

# 数据库路径
DB_PATH = 'data/stock_picker.db'


def get_date_range(days: int = 30):
    """
    获取日期范围

    Args:
        days: 最近天数

    Returns:
        (start_date, end_date) 格式为 YYYYMMDD
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days)

    return start_date.strftime('%Y%m%d'), end_date.strftime('%Y%m%d')


async def download_market_moneyflow(tushare_client, conn, start_date: str, end_date: str):
    """
    下载大盘资金流向数据

    Args:
        tushare_client: TushareClient 实例
        conn: 数据库连接
        start_date: 开始日期 YYYYMMDD
        end_date: 结束日期 YYYYMMDD

    Returns:
        下载的记录数
    """
    print("\n" + "=" * 60)
    print("下载大盘资金流向数据")
    print("=" * 60)
    print(f"日期范围: {start_date} - {end_date}")

    cursor = conn.cursor()

    try:
        # 获取大盘资金流向数据
        df = await tushare_client.get_market_moneyflow(
            start_date=start_date,
            end_date=end_date
        )

        if df is None or df.empty:
            print("未获取到数据")
            return 0

        print(f"获取到 {len(df)} 条记录")

        # 批量插入数据库
        record_count = 0
        for _, row in df.iterrows():
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO market_moneyflow
                    (trade_date, close_sh, pct_change_sh, close_sz, pct_change_sz,
                     net_amount, net_amount_rate, buy_elg_amount, buy_elg_amount_rate,
                     buy_lg_amount, buy_lg_amount_rate, buy_md_amount, buy_md_amount_rate,
                     buy_sm_amount, buy_sm_amount_rate, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
                """, (
                    row['trade_date'].strftime('%Y-%m-%d'),
                    float(row.get('close_sh', 0)),
                    float(row.get('pct_change_sh', 0)),
                    float(row.get('close_sz', 0)),
                    float(row.get('pct_change_sz', 0)),
                    float(row.get('net_amount', 0)),
                    float(row.get('net_amount_rate', 0)),
                    float(row.get('buy_elg_amount', 0)),
                    float(row.get('buy_elg_amount_rate', 0)),
                    float(row.get('buy_lg_amount', 0)),
                    float(row.get('buy_lg_amount_rate', 0)),
                    float(row.get('buy_md_amount', 0)),
                    float(row.get('buy_md_amount_rate', 0)),
                    float(row.get('buy_sm_amount', 0)),
                    float(row.get('buy_sm_amount_rate', 0))
                ))
                record_count += 1

            except Exception as e:
                print(f"  插入 {row.get('trade_date', 'unknown')} 数据失败: {e}")

        conn.commit()
        print(f"\nOK 成功插入 {record_count} 条大盘资金流向数据")
        return record_count

    except Exception as e:
        print(f"下载失败: {e}")
        return 0


def main():
    """主函数"""
    import asyncio

    print("=" * 60)
    print("大盘资金流向数据下载工具")
    print("=" * 60)
    print()

    # 初始化 Tushare 客户端
    print("正在初始化 Tushare 客户端...")
    tushare_client = TushareClient()

    # 连接数据库
    conn = sqlite3.connect(DB_PATH)

    try:
        # 获取日期范围（最近 30 天）
        start_date, end_date = get_date_range(days=30)

        # 下载数据
        record_count = asyncio.run(
            download_market_moneyflow(tushare_client, conn, start_date, end_date)
        )

        print("\n" + "=" * 60)
        print("下载完成！")
        print("=" * 60)
        print(f"OK 共下载 {record_count} 条记录")
        print(f"OK 日期范围: {start_date} - {end_date}")
        print("=" * 60)

    except KeyboardInterrupt:
        print("\n\n用户中断下载")
    except Exception as e:
        print(f"\n错误: {e}")
        import traceback
        traceback.print_exc()
    finally:
        conn.close()
        print("\n数据库连接已关闭")


if __name__ == "__main__":
    main()
