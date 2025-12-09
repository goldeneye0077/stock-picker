#!/usr/bin/env python3
"""
测试基本面数据获取
"""

import asyncio
import sys
from pathlib import Path

# 添加data-service到Python路径
sys.path.insert(0, str(Path(__file__).parent / "data-service" / "src"))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def test_fundamental_data():
    """测试基本面数据获取"""
    print("=== 测试基本面数据获取 ===\n")

    # 创建分析器实例
    analyzer = SmartSelectionAnalyzer()

    # 获取股票列表
    stocks = await analyzer._get_stock_list()
    print(f"股票数量: {len(stocks)}")

    if not stocks:
        print("未获取到股票列表")
        return

    # 测试前10只股票的基本面数据
    sample_stocks = stocks[:10]

    print("测试前10只股票的基本面数据:\n")
    print(f"{'股票代码':<10} {'股票名称':<10} {'数据源':<15} {'ROE(%)':<8} {'PE':<8} {'PB':<8} {'营收增长(%)':<12} {'基本面评分':<10}")
    print("-" * 80)

    for i, stock in enumerate(sample_stocks):
        stock_code = stock['raw_code']

        fundamental_data = await analyzer._get_fundamental_data(stock_code)

        if fundamental_data:
            data_source = fundamental_data.get('data_source', 'unknown')
            roe = fundamental_data.get('roe', 0)
            pe = fundamental_data.get('pe', 0)
            pb = fundamental_data.get('pb', 0)
            revenue_growth = fundamental_data.get('revenue_growth', 0)
            overall_score = fundamental_data.get('overall_fundamental_score', 0)
            has_data = fundamental_data.get('has_fundamental_data', False)

            print(f"{stock['stock_code']:<10} {stock['stock_name']:<10} "
                  f"{data_source:<15} {roe:<8.1f} {pe:<8.1f} {pb:<8.2f} "
                  f"{revenue_growth:<12.1f} {overall_score:<10.1f} "
                  f"{'(有实际数据)' if has_data else '(无实际数据)'}")

    # 测试特定股票
    print("\n" + "=" * 80)
    print("测试特定股票的基本面数据:\n")

    test_codes = ['000001', '600519', '300750', '000858']

    for code in test_codes:
        print(f"\n股票代码: {code}")
        fundamental_data = await analyzer._get_fundamental_data(code)

        if fundamental_data:
            print(f"  数据源: {fundamental_data.get('data_source')}")
            print(f"  有实际数据: {fundamental_data.get('has_fundamental_data')}")
            print(f"  ROE: {fundamental_data.get('roe')}%")
            print(f"  PE: {fundamental_data.get('pe')}")
            print(f"  PB: {fundamental_data.get('pb')}")
            print(f"  营收增长率: {fundamental_data.get('revenue_growth')}%")
            print(f"  利润增长率: {fundamental_data.get('profit_growth')}%")
            print(f"  负债率: {fundamental_data.get('debt_ratio')}%")
            print(f"  股息率: {fundamental_data.get('dividend_yield', 0)}%")
            print(f"  换手率: {fundamental_data.get('turnover_rate', 0)}%")
            print(f"  总市值: {fundamental_data.get('total_market_value', 0)}亿元")
            print(f"  基本面综合评分: {fundamental_data.get('overall_fundamental_score')}")

            # 计算基本面评分
            fundamental_score = analyzer._calculate_fundamental_score(fundamental_data)
            print(f"  计算出的基本面评分: {fundamental_score}")
        else:
            print("  未获取到基本面数据")

async def main():
    """主函数"""
    print("基本面数据获取测试")
    print("=" * 50)

    await test_fundamental_data()

    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())