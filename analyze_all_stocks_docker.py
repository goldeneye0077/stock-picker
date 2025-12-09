"""
[Docker Version] 批量分析所有股票的成交量数据
"""
import asyncio
import aiosqlite
import sys
from pathlib import Path
import pandas as pd
from loguru import logger

# 配置日志
logger.remove()
logger.add(sys.stdout, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{message}</level>")

# Docker 路径
DATABASE_PATH = Path("/data/stock_picker.db")

async def analyze_stock_volume(db, stock_code: str) -> bool:
    """分析单只股票的成交量"""
    try:
        # 获取最近30天K线数据
        cursor = await db.execute("""
            SELECT date, volume FROM klines
            WHERE stock_code = ?
            ORDER BY date DESC
            LIMIT 30
        """, (stock_code,))

        rows = await cursor.fetchall()
        if len(rows) < 20:
            # logger.debug(f"股票 {stock_code} 数据不足(<20天)，跳过分析")
            return False

        # 转换为DataFrame并排序
        df = pd.DataFrame(rows, columns=['date', 'volume'])
        df = df.sort_values('date')

        # 计算20日平均成交量和量比
        df['avg_volume_20'] = df['volume'].rolling(window=20).mean()
        df['volume_ratio'] = df['volume'] / df['avg_volume_20']
        df['is_volume_surge'] = df['volume_ratio'] > 2.0

        # 保存分析结果到数据库
        saved_count = 0
        for _, row in df.iterrows():
            if pd.notna(row['volume_ratio']):
                analysis_result = f"量比{row['volume_ratio']:.2f}倍"
                if row['is_volume_surge']:
                    analysis_result += "，异常放量"

                await db.execute("""
                    INSERT OR REPLACE INTO volume_analysis
                    (stock_code, date, volume_ratio, avg_volume_20, is_volume_surge, analysis_result, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    stock_code,
                    row['date'],
                    float(row['volume_ratio']),
                    int(row['avg_volume_20']),
                    bool(row['is_volume_surge']),
                    analysis_result
                ))
                saved_count += 1

        await db.commit()
        return saved_count > 0

    except Exception as e:
        logger.error(f"分析股票 {stock_code} 失败: {e}")
        return False


async def main():
    """批量分析所有有K线数据的股票"""
    try:
        logger.info("开始批量成交量分析...")

        async with aiosqlite.connect(DATABASE_PATH) as db:
            # 获取所有有K线数据的股票代码（最近7天有数据）
            cursor = await db.execute("""
                SELECT DISTINCT stock_code FROM klines
                WHERE date >= date('now', '-7 days')
                ORDER BY stock_code
            """)
            stock_codes = [row[0] for row in await cursor.fetchall()]

            total = len(stock_codes)
            logger.info(f"找到 {total} 只股票需要分析")

            success_count = 0
            failed_count = 0

            for i, stock_code in enumerate(stock_codes, 1):
                if i % 100 == 0:
                    logger.info(f"进度: {i}/{total} ({i/total*100:.1f}%) - 成功: {success_count}, 失败: {failed_count}")

                if await analyze_stock_volume(db, stock_code):
                    success_count += 1
                else:
                    failed_count += 1

            logger.info(f"批量分析完成！总计: {total}, 成功: {success_count}, 失败/跳过: {failed_count}")

            # 显示统计信息
            cursor = await db.execute("""
                SELECT COUNT(*) FROM volume_analysis
                WHERE is_volume_surge = 1 AND date >= date('now', '-3 days')
            """)
            surge_count = (await cursor.fetchone())[0]

            logger.info(f"最近3天异常放量股票数: {surge_count} 只")

    except Exception as e:
        logger.error(f"批量分析失败: {e}")
        import traceback
        logger.error(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
