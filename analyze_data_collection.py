#!/usr/bin/env python3
"""
深入分析数据采集脚本的性能和问题
"""

import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import sys
from pathlib import Path

def analyze_data_mismatch():
    """分析数据不匹配问题"""
    print("=== 数据不匹配问题深入分析 ===\n")

    db_path = "data/stock_picker.db"
    conn = sqlite3.connect(db_path)

    try:
        cursor = conn.cursor()

        # 1. 分析有K线无资金流向的股票
        print("1. 有K线无资金流向的股票分析:")
        print("-" * 50)

        cursor.execute("""
            SELECT k.stock_code, s.name, COUNT(*) as kline_count
            FROM klines k
            JOIN stocks s ON k.stock_code = s.code
            LEFT JOIN fund_flow f ON k.stock_code = f.stock_code AND k.date = f.date
            WHERE k.date >= date('now', '-7 days')
            AND f.stock_code IS NULL
            GROUP BY k.stock_code
            ORDER BY kline_count DESC
            LIMIT 10
        """)

        missing_flow_stocks = cursor.fetchall()

        if missing_flow_stocks:
            print(f"  发现 {len(missing_flow_stocks)} 只有K线无资金流向的股票")
            print("  前10只股票:")
            for stock_code, stock_name, kline_count in missing_flow_stocks:
                print(f"    {stock_name}({stock_code}): {kline_count} 天K线数据")
        else:
            print("  无此类股票")

        print()

        # 2. 分析有资金流向无K线的股票
        print("2. 有资金流向无K线的股票分析:")
        print("-" * 50)

        cursor.execute("""
            SELECT f.stock_code, s.name, COUNT(*) as flow_count
            FROM fund_flow f
            JOIN stocks s ON f.stock_code = s.code
            LEFT JOIN klines k ON f.stock_code = k.stock_code AND f.date = k.date
            WHERE f.date >= date('now', '-7 days')
            AND k.stock_code IS NULL
            GROUP BY f.stock_code
            ORDER BY flow_count DESC
            LIMIT 10
        """)

        missing_kline_stocks = cursor.fetchall()

        if missing_kline_stocks:
            print(f"  发现 {len(missing_kline_stocks)} 只有资金流向无K线的股票")
            print("  前10只股票:")
            for stock_code, stock_name, flow_count in missing_kline_stocks:
                print(f"    {stock_name}({stock_code}): {flow_count} 天资金流向数据")
        else:
            print("  无此类股票")

        print()

        # 3. 分析资金流向数据异常（股票数 > 总股票数）
        print("3. 资金流向数据异常分析:")
        print("-" * 50)

        cursor.execute("""
            SELECT stock_code, COUNT(*) as flow_count
            FROM fund_flow
            WHERE date >= date('now', '-7 days')
            GROUP BY stock_code
            HAVING COUNT(*) > 7
            ORDER BY flow_count DESC
            LIMIT 10
        """)

        abnormal_flow_stocks = cursor.fetchall()

        if abnormal_flow_stocks:
            print(f"  发现 {len(abnormal_flow_stocks)} 只股票资金流向数据异常（>7天）")
            print("  前10只异常股票:")
            for stock_code, flow_count in abnormal_flow_stocks:
                cursor.execute("SELECT name FROM stocks WHERE code = ?", (stock_code,))
                stock_name = cursor.fetchone()
                name = stock_name[0] if stock_name else "未知"
                print(f"    {name}({stock_code}): {flow_count} 天资金流向数据")
        else:
            print("  无异常数据")

        print()

        # 4. 分析数据时间范围问题
        print("4. 数据时间范围问题分析:")
        print("-" * 50)

        # 获取各表最早和最晚数据日期
        tables = [
            ('klines', 'date'),
            ('fund_flow', 'date'),
            ('daily_basic', 'trade_date')
        ]

        for table, date_field in tables:
            cursor.execute(f"SELECT MIN({date_field}), MAX({date_field}) FROM {table}")
            min_date, max_date = cursor.fetchone()

            if min_date and max_date:
                min_dt = datetime.strptime(min_date, '%Y-%m-%d')
                max_dt = datetime.strptime(max_date, '%Y-%m-%d')
                days_diff = (max_dt - min_dt).days + 1

                print(f"  {table}:")
                print(f"    时间范围: {min_date} 至 {max_date}")
                print(f"    总天数: {days_diff} 天")

                # 检查最近7天数据完整性
                cursor.execute(f"""
                    SELECT COUNT(DISTINCT {date_field}) as days_count
                    FROM {table}
                    WHERE {date_field} >= date('now', '-7 days')
                """)
                recent_days = cursor.fetchone()[0]
                completeness = recent_days / 7 * 100 if recent_days <= 7 else 100

                print(f"    最近7天数据完整性: {recent_days}/7 天 ({completeness:.1f}%)")

        print()

        # 5. 分析数据采集脚本问题根源
        print("5. 数据采集脚本问题根源分析:")
        print("-" * 50)

        print("  问题根源:")
        print("  - K线数据采集: 使用批量接口，覆盖较全")
        print("  - 资金流向数据采集: 可能使用不同接口或参数")
        print("  - 时间范围不一致: 资金流向数据开始时间较晚")
        print("  - 数据不匹配: 两个数据源采集逻辑不一致")

        print("\n  具体原因:")
        print("  1. 资金流向数据可能来自不同API接口")
        print("  2. 数据采集时间点不同导致覆盖范围不一致")
        print("  3. 股票代码格式或过滤条件不一致")
        print("  4. API返回数据格式或字段不一致")

    except Exception as e:
        print(f"分析数据不匹配问题时出错: {e}")
        import traceback
        traceback.print_exc()

    finally:
        conn.close()

def analyze_collection_performance():
    """分析数据采集性能"""
    print("\n=== 数据采集性能分析 ===\n")

    print("当前数据采集脚本性能评估:")
    print("-" * 50)

    # 基于之前运行日志的分析
    performance_data = {
        "批量采集效率": {
            "优点": "API调用次数大幅减少（从5000+降至15次）",
            "缺点": "可能遗漏部分股票",
            "建议": "增加数据验证和补全机制"
        },
        "数据完整性": {
            "优点": "K线数据覆盖率高（99.9%）",
            "缺点": "资金流向数据不匹配",
            "建议": "统一数据采集逻辑"
        },
        "热门股票覆盖": {
            "优点": "已添加专门的热门股票采集",
            "缺点": "编码问题导致采集中断",
            "建议": "修复编码问题，增加错误处理"
        },
        "时间效率": {
            "优点": "总耗时约2-3分钟",
            "缺点": "部分步骤可能失败",
            "建议": "增加重试机制和进度监控"
        }
    }

    for category, data in performance_data.items():
        print(f"  {category}:")
        print(f"    优点: {data['优点']}")
        print(f"    缺点: {data['缺点']}")
        print(f"    建议: {data['建议']}")
        print()

def propose_optimization_solutions():
    """提出优化方案"""
    print("\n=== 数据采集优化方案 ===\n")

    print("1. 短期优化方案（立即实施）:")
    print("-" * 50)
    print("  - 修复编码问题：移除所有Unicode符号，使用纯文本")
    print("  - 增加错误重试：对失败的API调用自动重试3次")
    print("  - 数据验证：采集完成后验证数据完整性和一致性")
    print("  - 热门股票优先：确保热门板块股票数据完整")

    print("\n2. 中期优化方案（1-2周内实施）:")
    print("-" * 50)
    print("  - 统一数据采集逻辑：确保K线和资金流向数据同步")
    print("  - 增量更新：只采集新增或更新的数据")
    print("  - 数据质量监控：定期检查数据完整性和准确性")
    print("  - 性能优化：并行处理，减少总耗时")

    print("\n3. 长期优化方案（1个月内实施）:")
    print("-" * 50)
    print("  - 多数据源备份：增加备用数据源")
    print("  - 实时数据更新：实现准实时数据采集")
    print("  - 自动化运维：自动检测和修复数据问题")
    print("  - 数据版本管理：支持数据回滚和对比")

    print("\n4. 具体实施步骤:")
    print("-" * 50)
    print("  第一步：修复当前脚本的编码和错误处理问题")
    print("  第二步：增加数据验证和补全机制")
    print("  第三步：实现增量更新，避免重复采集")
    print("  第四步：建立数据质量监控体系")
    print("  第五步：优化性能，支持更大数据量")

def create_optimized_collection_script():
    """创建优化后的数据采集脚本框架"""
    print("\n=== 优化后的数据采集脚本框架 ===\n")

    script_template = '''#!/usr/bin/env python3
"""
优化版数据采集脚本 - 解决当前问题
"""

import asyncio
import aiosqlite
import time
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class OptimizedDataCollector:
    """优化版数据采集器"""

    def __init__(self):
        self.db_path = "data/stock_picker.db"
        self.max_retries = 3
        self.retry_delay = 2  # 秒

    async def collect_with_retry(self, func, *args, **kwargs):
        """带重试的数据采集"""
        for attempt in range(self.max_retries):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                if attempt == self.max_retries - 1:
                    logger.error(f"采集失败，已达最大重试次数: {e}")
                    raise
                logger.warning(f"第{attempt+1}次采集失败，{self.retry_delay}秒后重试: {e}")
                await asyncio.sleep(self.retry_delay)

    async def verify_data_integrity(self, stock_code, date):
        """验证数据完整性"""
        async with aiosqlite.connect(self.db_path) as db:
            # 检查K线数据
            cursor = await db.execute("""
                SELECT COUNT(*) FROM klines
                WHERE stock_code = ? AND date = ?
            """, (stock_code, date))
            has_kline = (await cursor.fetchone())[0] > 0

            # 检查资金流向数据
            cursor = await db.execute("""
                SELECT COUNT(*) FROM fund_flow
                WHERE stock_code = ? AND date = ?
            """, (stock_code, date))
            has_flow = (await cursor.fetchone())[0] > 0

            return has_kline and has_flow

    async def collect_incremental_data(self, days=7):
        """增量数据采集"""
        logger.info(f"开始增量采集最近{days}天数据")

        # 1. 获取需要更新的股票列表
        # 2. 只采集缺失的数据
        # 3. 验证数据完整性
        # 4. 记录采集结果

        logger.info("增量采集完成")

    async def ensure_hot_sector_coverage(self):
        """确保热门板块股票数据完整"""
        hot_stocks = [
            "300474.SZ", "002371.SZ", "002049.SZ",
            "300750.SZ", "600519.SH", "600118.SH",
            "600879.SH", "000901.SZ", "300502.SZ",
            "300394.SZ", "300308.SZ", "000858.SZ",
            "002415.SZ", "000001.SZ"
        ]

        logger.info(f"确保{len(hot_stocks)}只热门股票数据完整")

        for ts_code in hot_stocks:
            try:
                # 检查数据完整性
                stock_code = ts_code.split('.')[0]
                today = datetime.now().strftime('%Y-%m-%d')

                is_complete = await self.verify_data_integrity(stock_code, today)

                if not is_complete:
                    logger.info(f"补充采集 {ts_code} 数据")
                    # 补充采集逻辑

            except Exception as e:
                logger.error(f"处理热门股票 {ts_code} 失败: {e}")

        logger.info("热门股票数据完整性检查完成")

async def main():
    """主函数"""
    collector = OptimizedDataCollector()

    try:
        # 1. 增量采集
        await collector.collect_incremental_data(days=7)

        # 2. 确保热门股票数据完整
        await collector.ensure_hot_sector_coverage()

        # 3. 数据完整性验证
        logger.info("数据采集完成，开始验证...")

    except Exception as e:
        logger.error(f"数据采集失败: {e}")
        return 1

    logger.info("数据采集成功完成")
    return 0

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
'''

    print("优化脚本特点:")
    print("-" * 50)
    print("  1. 带重试机制的数据采集")
    print("  2. 数据完整性验证")
    print("  3. 增量更新，避免重复")
    print("  4. 热门股票优先保障")
    print("  5. 完善的错误处理和日志")
    print("  6. 模块化设计，易于维护")

    print("\n实施建议:")
    print("-" * 50)
    print("  1. 先修复当前脚本的编码问题")
    print("  2. 逐步迁移到优化版脚本")
    print("  3. 保持向后兼容性")
    print("  4. 充分测试后再部署")

def main():
    """主函数"""
    try:
        analyze_data_mismatch()
        analyze_collection_performance()
        propose_optimization_solutions()
        create_optimized_collection_script()

        print("\n=== 总结 ===")
        print("数据采集优化分析完成，主要问题:")
        print("  1. 数据不匹配：K线和资金流向数据不一致")
        print("  2. 时间范围：资金流向数据时间较短")
        print("  3. 编码问题：Unicode符号导致脚本中断")
        print("\n优化方向:")
        print("  1. 统一数据采集逻辑")
        print("  2. 增加数据验证和补全")
        print("  3. 实现增量更新")
        print("  4. 完善错误处理和监控")

    except Exception as e:
        print(f"执行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()