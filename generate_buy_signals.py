"""
生成买入信号
基于成交量分析、K线数据和资金流向综合评分
"""
import asyncio
import aiosqlite
import sys
from pathlib import Path
from datetime import datetime
from loguru import logger

# 配置日志
logger.remove()
logger.add(sys.stdout, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{message}</level>")

DATABASE_PATH = Path(__file__).parent / "data" / "stock_picker.db"


def score_volume(volume_ratio: float) -> float:
    """成交量评分 (0-100)"""
    if volume_ratio > 3.0:
        return 90
    elif volume_ratio > 2.0:
        return 75
    elif volume_ratio > 1.5:
        return 60
    elif volume_ratio > 1.0:
        return 40
    else:
        return 20


def score_price_action(price_change: float) -> float:
    """价格走势评分 (0-100)"""
    if price_change > 5:
        return 80
    elif price_change > 2:
        return 70
    elif price_change > 0:
        return 60
    elif price_change > -2:
        return 40
    else:
        return 20


def score_fund_flow(main_fund_flow: float) -> float:
    """资金流向评分 (0-100)"""
    if main_fund_flow > 10000000:  # 1000万
        return 90
    elif main_fund_flow > 5000000:  # 500万
        return 75
    elif main_fund_flow > 1000000:  # 100万
        return 60
    elif main_fund_flow > 0:
        return 50
    else:
        return 30


def calculate_signal(volume_score: float, price_score: float, fund_score: float) -> tuple:
    """计算综合信号"""
    # 加权计算总分
    total_score = (volume_score * 0.4 + price_score * 0.3 + fund_score * 0.3)
    confidence = min(total_score / 100.0, 1.0)

    # 确定信号类型
    if confidence > 0.8:
        signal_type = "强烈买入"
    elif confidence > 0.6:
        signal_type = "买入"
    elif confidence > 0.4:
        signal_type = "关注"
    else:
        signal_type = "观察"

    return signal_type, confidence


async def generate_signals_for_stock(db, stock_code: str, stock_name: str) -> dict:
    """为单只股票生成买入信号"""
    try:
        # 1. 获取最新成交量分析
        cursor = await db.execute("""
            SELECT volume_ratio, is_volume_surge
            FROM volume_analysis
            WHERE stock_code = ?
            ORDER BY date DESC
            LIMIT 1
        """, (stock_code,))
        volume_row = await cursor.fetchone()

        if not volume_row:
            return None  # 没有成交量分析数据

        volume_ratio = volume_row[0]
        is_volume_surge = volume_row[1]

        # 2. 获取最新K线数据计算价格变化
        cursor = await db.execute("""
            SELECT close, open
            FROM klines
            WHERE stock_code = ?
            ORDER BY date DESC
            LIMIT 2
        """, (stock_code,))
        kline_rows = await cursor.fetchall()

        if len(kline_rows) < 2:
            return None

        latest_close = kline_rows[0][0]
        prev_close = kline_rows[1][0]
        price_change = ((latest_close - prev_close) / prev_close) * 100 if prev_close > 0 else 0

        # 3. 获取资金流向数据
        cursor = await db.execute("""
            SELECT main_fund_flow
            FROM fund_flow
            WHERE stock_code = ?
            ORDER BY date DESC
            LIMIT 1
        """, (stock_code,))
        fund_row = await cursor.fetchone()

        main_fund_flow = fund_row[0] if fund_row else 0

        # 4. 计算各项评分
        vol_score = score_volume(volume_ratio)
        price_score = score_price_action(price_change)
        fund_score = score_fund_flow(main_fund_flow)

        # 5. 生成综合信号
        signal_type, confidence = calculate_signal(vol_score, price_score, fund_score)

        # 6. 仅保存有价值的信号（关注及以上）
        if confidence < 0.4:
            return None

        # 7. 保存到数据库（使用现有表结构）
        analysis_data = f"volume_score:{vol_score:.2f},price_score:{price_score:.2f},fund_score:{fund_score:.2f}"
        await db.execute("""
            INSERT OR REPLACE INTO buy_signals
            (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
        """, (
            stock_code,
            signal_type,
            round(confidence, 4),
            latest_close,
            0,  # volume placeholder
            analysis_data
        ))

        return {
            "stock_code": stock_code,
            "signal_type": signal_type,
            "confidence": confidence,
            "volume_ratio": volume_ratio
        }

    except Exception as e:
        logger.error(f"生成信号失败 {stock_code}: {e}")
        return None


async def main():
    """批量生成所有股票的买入信号"""
    try:
        logger.info("开始生成买入信号...")

        async with aiosqlite.connect(DATABASE_PATH) as db:
            # 获取所有有成交量分析的股票
            cursor = await db.execute("""
                SELECT DISTINCT va.stock_code, s.name
                FROM volume_analysis va
                LEFT JOIN stocks s ON va.stock_code = s.code
                WHERE va.date >= date('now', '-3 days')
                ORDER BY va.stock_code
            """)
            stocks = await cursor.fetchall()

            total = len(stocks)
            logger.info(f"找到 {total} 只股票需要分析")

            signal_counts = {"强烈买入": 0, "买入": 0, "关注": 0, "观察": 0}
            processed = 0

            for stock_code, stock_name in stocks:
                result = await generate_signals_for_stock(db, stock_code, stock_name or "未知")

                if result:
                    signal_counts[result['signal_type']] += 1
                    if result['confidence'] >= 0.6:  # 显示买入及以上信号
                        logger.info(f"  {stock_code} {stock_name}: {result['signal_type']} (置信度{result['confidence']:.1%}, 量比{result['volume_ratio']:.2f})")

                processed += 1
                if processed % 500 == 0:
                    logger.info(f"进度: {processed}/{total} ({processed/total*100:.1f}%)")

            await db.commit()

            logger.info(f"\n批量信号生成完成！")
            logger.info(f"  强烈买入: {signal_counts['强烈买入']} 只")
            logger.info(f"  买入: {signal_counts['买入']} 只")
            logger.info(f"  关注: {signal_counts['关注']} 只")

            # 统计今日信号数
            cursor = await db.execute("""
                SELECT COUNT(*) FROM buy_signals
                WHERE date(created_at) = date('now')
            """)
            today_count = (await cursor.fetchone())[0]
            logger.info(f"\n今日新增信号: {today_count} 条")

    except Exception as e:
        logger.error(f"批量信号生成失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
