#!/usr/bin/env python3
"""
分析热门板块股票为什么没被选中
"""

import asyncio
import aiosqlite
import sys
import os
from pathlib import Path

# 添加data-service到Python路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def analyze_hot_sector_stocks():
    """分析热门板块股票"""
    analyzer = SmartSelectionAnalyzer()

    # 热门板块股票示例（商业航天、CPO、AI算力硬件）
    hot_sector_stocks = [
        {"code": "300474.SZ", "name": "景嘉微", "sector": "AI算力硬件"},
        {"code": "002371.SZ", "name": "北方华创", "sector": "半导体设备"},
        {"code": "002049.SZ", "name": "紫光国微", "sector": "芯片"},
        {"code": "300750.SZ", "name": "宁德时代", "sector": "新能源"},
        {"code": "600519.SH", "name": "贵州茅台", "sector": "白酒"},
    ]

    print("=== 分析热门板块股票 ===")

    for stock in hot_sector_stocks:
        stock_code = stock["code"]
        stock_name = stock["name"]
        sector = stock["sector"]

        print(f"\n--- {stock_name} ({stock_code}) [{sector}] ---")

        # 获取基本面数据
        fundamental_data = await analyzer._get_fundamental_data(stock_code)
        if fundamental_data:
            print(f"  基本面评分: {fundamental_data.get('overall_fundamental_score', 'N/A')}")
            print(f"  数据来源: {fundamental_data.get('data_source', 'N/A')}")
            print(f"  ROE: {fundamental_data.get('roe', 'N/A')}%")
            print(f"  PE: {fundamental_data.get('pe', 'N/A')}")
        else:
            print("  无法获取基本面数据")

        # 获取技术面数据
        technical_data = await analyzer._get_technical_data(stock_code)
        if technical_data:
            print(f"  技术面评分: {technical_data.get('technical_score', 'N/A')}")
            print(f"  当前价格: {technical_data.get('current_price', 'N/A')}")
            print(f"  20日涨跌幅: {technical_data.get('price_change_20d', 'N/A')}%")
        else:
            print("  无法获取技术面数据")

        # 计算综合评分（均衡策略）
        if technical_data and fundamental_data:
            technical_score = technical_data.get('technical_score', 0)
            fundamental_score = fundamental_data.get('overall_fundamental_score', 0)

            # 获取资金面数据
            capital_data = await analyzer._get_capital_data(stock_code)
            capital_score = analyzer._calculate_capital_score(capital_data) if capital_data else 0

            # 获取市场面数据
            market_data = await analyzer._get_market_data(stock_code)
            market_score = market_data.get('market_score', 0) if market_data else 0

            # 均衡策略权重
            weights = {
                'technical': 0.35,
                'fundamental': 0.30,
                'capital': 0.25,
                'market': 0.10
            }

            overall_score = (
                technical_score * weights['technical'] +
                fundamental_score * weights['fundamental'] +
                capital_score * weights['capital'] +
                market_score * weights['market']
            )

            print(f"  综合评分: {overall_score:.1f}")

            # 判断是否会被选中（假设最低评分50分）
            if overall_score >= 50:
                print(f"  ✅ 会被选中 (≥50分)")
            else:
                print(f"  ❌ 不会被选中 (<50分)")
        else:
            print("  无法计算综合评分")

async def check_database_coverage():
    """检查数据库数据覆盖情况"""
    print("\n=== 数据库数据覆盖检查 ===")

    db_path = "data/stock_picker.db"

    try:
        async with aiosqlite.connect(db_path) as db:
            # 检查daily_basic表
            cursor = await db.execute("SELECT COUNT(*) FROM daily_basic")
            count = await cursor.fetchone()
            print(f"daily_basic表记录数: {count[0]}")

            # 检查最近日期
            cursor = await db.execute("SELECT MAX(trade_date) FROM daily_basic")
            max_date = await cursor.fetchone()
            print(f"daily_basic最新日期: {max_date[0]}")

            # 检查klines表
            cursor = await db.execute("SELECT COUNT(*) FROM klines")
            count = await cursor.fetchone()
            print(f"klines表记录数: {count[0]}")

            # 检查fund_flow表
            cursor = await db.execute("SELECT COUNT(*) FROM fund_flow")
            count = await cursor.fetchone()
            print(f"fund_flow表记录数: {count[0]}")

            # 检查热门股票是否有数据
            hot_stocks = ["300474.SZ", "002371.SZ", "002049.SZ", "300750.SZ", "600519.SH"]

            print("\n热门股票数据检查:")
            for stock_code in hot_stocks:
                # 检查daily_basic
                cursor = await db.execute("SELECT COUNT(*) FROM daily_basic WHERE stock_code = ?", (stock_code,))
                count = await cursor.fetchone()
                has_daily_basic = count[0] > 0

                # 检查klines
                cursor = await db.execute("SELECT COUNT(*) FROM klines WHERE stock_code = ?", (stock_code,))
                count = await cursor.fetchone()
                has_klines = count[0] > 0

                # 检查fund_flow
                cursor = await db.execute("SELECT COUNT(*) FROM fund_flow WHERE stock_code = ?", (stock_code,))
                count = await cursor.fetchone()
                has_fund_flow = count[0] > 0

                print(f"  {stock_code}: daily_basic={has_daily_basic}, klines={has_klines}, fund_flow={has_fund_flow}")

    except Exception as e:
        print(f"数据库检查失败: {e}")

async def analyze_scoring_problems():
    """分析评分算法问题"""
    print("\n=== 评分算法问题分析 ===")

    analyzer = SmartSelectionAnalyzer()

    # 测试不同情况的评分
    test_cases = [
        {
            "name": "优质股票（高ROE、低PE、高增长）",
            "roe": 25.0,
            "pe": 15.0,
            "revenue_growth": 30.0,
            "debt_ratio": 30.0
        },
        {
            "name": "一般股票（中等ROE、中等PE、中等增长）",
            "roe": 12.0,
            "pe": 20.0,
            "revenue_growth": 10.0,
            "debt_ratio": 50.0
        },
        {
            "name": "差股票（低ROE、高PE、负增长）",
            "roe": 3.0,
            "pe": 50.0,
            "revenue_growth": -5.0,
            "debt_ratio": 80.0
        }
    ]

    for case in test_cases:
        score = analyzer._calculate_fundamental_score_from_data(
            case["roe"], case["pe"], 2.0,  # PB固定为2.0
            case["revenue_growth"], case["revenue_growth"] * 0.8,  # 利润增长率为营收的80%
            case["debt_ratio"]
        )

        print(f"{case['name']}:")
        print(f"  ROE={case['roe']}%, PE={case['pe']}, 营收增长={case['revenue_growth']}%, 负债率={case['debt_ratio']}%")
        print(f"  基本面评分: {score:.1f}")

        if score >= 50:
            print(f"  ❌ 问题：差股票评分过高 ({score:.1f} ≥ 50)")
        print()

async def main():
    """主函数"""
    try:
        await analyze_hot_sector_stocks()
        await check_database_coverage()
        await analyze_scoring_problems()
    except Exception as e:
        print(f"分析失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())