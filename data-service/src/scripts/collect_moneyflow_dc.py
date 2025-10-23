"""
个股资金流向数据采集脚本（Tushare DC接口）
使用东方财富资金流向数据，需要5000积分
"""

import asyncio
import sys
import os
from pathlib import Path
from datetime import datetime, timedelta
from loguru import logger
from dotenv import load_dotenv

# 加载环境变量
env_path = Path(__file__).parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

# 添加项目根目录到 Python 路径
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from src.data_sources.tushare_client import TushareClient
from src.utils.database import get_database

async def get_recent_trading_days(client: TushareClient, days: int = 7) -> list:
    """
    获取最近N个交易日

    Args:
        client: Tushare客户端
        days: 获取天数

    Returns:
        交易日列表，格式为 YYYYMMDD
    """
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days * 2)  # 多取一些天数，保证有足够的交易日

    trade_cal = await client.get_trade_cal(
        start_date=start_date.strftime('%Y%m%d'),
        end_date=end_date.strftime('%Y%m%d')
    )

    if trade_cal is None or trade_cal.empty:
        logger.warning("无法获取交易日历")
        return []

    # 筛选出交易日
    trading_days = trade_cal[trade_cal['is_open'] == 1]['cal_date'].tolist()
    # 转换为字符串格式
    trading_days = [day.strftime('%Y%m%d') for day in trading_days]
    # 降序排序，最新的日期在前
    trading_days.sort(reverse=True)

    # 返回最近N个交易日
    return trading_days[:days]

async def save_moneyflow_dc_data(trade_date: str, df):
    """
    将 DC 资金流向数据保存到数据库

    Args:
        trade_date: 交易日期
        df: 资金流向数据 DataFrame
    """
    if df is None or df.empty:
        logger.warning(f"日期 {trade_date} 无数据可保存")
        return

    async with get_database() as conn:
        cursor = await conn.cursor()

        # 先删除该日期的旧数据
        await cursor.execute(
            "DELETE FROM fund_flow WHERE date = ?",
            (trade_date,)
        )

        # 准备插入数据
        insert_count = 0
        for _, row in df.iterrows():
            try:
                # 转换字段：
                # - net_mf_amount: 主力净流入额（万元）-> main_fund_flow（转换为元）
                # - net_md_amount + net_sm_amount: 中单+小单 -> retail_fund_flow（万元转元）
                # - net_elg_amount + net_lg_amount: 超大单+大单（可作为机构资金）-> institutional_flow
                # - net_mf_rate: 主力净流入占比 -> large_order_ratio

                main_fund_flow = (row.get('net_mf_amount', 0) or 0) * 10000  # 万元转元
                retail_fund_flow = ((row.get('net_md_amount', 0) or 0) + (row.get('net_sm_amount', 0) or 0)) * 10000
                institutional_flow = ((row.get('net_elg_amount', 0) or 0) + (row.get('net_lg_amount', 0) or 0)) * 10000
                large_order_ratio = row.get('net_mf_rate', 0) or 0

                await cursor.execute("""
                    INSERT INTO fund_flow
                    (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (
                    row['ts_code'],
                    trade_date,
                    main_fund_flow,
                    retail_fund_flow,
                    institutional_flow,
                    large_order_ratio
                ))
                insert_count += 1
            except Exception as e:
                logger.error(f"保存股票 {row.get('ts_code')} 资金流向数据失败: {e}")
                continue

        await conn.commit()
        logger.info(f"日期 {trade_date}: 成功保存 {insert_count} 条资金流向数据")

async def collect_moneyflow_dc(days: int = 7):
    """
    采集最近N天的个股资金流向数据

    Args:
        days: 采集天数
    """
    logger.info(f"开始采集最近 {days} 天的个股资金流向数据（DC接口）")

    # 初始化 Tushare 客户端
    client = TushareClient()
    if not client.is_available():
        logger.error("Tushare 客户端初始化失败，请检查 TUSHARE_TOKEN 环境变量")
        return

    # 获取最近的交易日
    logger.info("获取交易日历...")
    trading_days = await get_recent_trading_days(client, days)

    if not trading_days:
        logger.error("未能获取交易日信息")
        return

    logger.info(f"将采集以下 {len(trading_days)} 个交易日的数据: {', '.join(trading_days)}")

    # 逐日采集数据
    for trade_date in trading_days:
        logger.info(f"正在采集 {trade_date} 的资金流向数据...")

        try:
            # 获取该日期所有股票的资金流向
            df = await client.get_moneyflow_dc_by_date(trade_date)

            if df is not None and not df.empty:
                # 保存到数据库
                await save_moneyflow_dc_data(trade_date, df)

                # API限频：每分钟120次调用，这里休眠0.6秒
                await asyncio.sleep(0.6)
            else:
                logger.warning(f"日期 {trade_date} 无资金流向数据（可能为非交易日）")

        except Exception as e:
            logger.error(f"采集日期 {trade_date} 的数据时出错: {e}")
            continue

    logger.info("资金流向数据采集完成！")

async def main():
    """主函数"""
    # 可以通过命令行参数指定采集天数
    days = 7
    if len(sys.argv) > 1:
        try:
            days = int(sys.argv[1])
        except ValueError:
            logger.warning(f"无效的天数参数: {sys.argv[1]}，使用默认值 7")

    await collect_moneyflow_dc(days)

if __name__ == "__main__":
    asyncio.run(main())
