#!/usr/bin/env python3
"""
测试改进后的智能选股算法
"""

import asyncio
import sys
from pathlib import Path

# 添加data-service到Python路径
sys.path.insert(0, str(Path(__file__).parent / "data-service" / "src"))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def test_improved_algorithm():
    """测试改进后的算法"""
    print("=== 测试改进后的智能选股算法 ===")

    # 创建分析器实例
    analyzer = SmartSelectionAnalyzer()

    # 1. 测试获取股票列表
    print("\n1. 测试获取股票列表...")
    stocks = await analyzer._get_stock_list()
    print(f"获取到 {len(stocks)} 只股票（最近30天有交易数据的）")

    if stocks:
        print("前10只股票:")
        for i, stock in enumerate(stocks[:10]):
            print(f"  {i+1}. {stock['stock_code']} - {stock['stock_name']} ({stock['industry']})")

    # 2. 测试不同行业股票的基本面数据
    print("\n2. 测试不同行业股票的基本面数据:")
    test_stocks = [
        {"code": "000001", "name": "平安银行", "industry": "银行"},
        {"code": "600519", "name": "贵州茅台", "industry": "白酒"},
        {"code": "300750", "name": "宁德时代", "industry": "新能源"},
        {"code": "000002", "name": "万科A", "industry": "房地产"},
        {"code": "000858", "name": "五粮液", "industry": "白酒"},
    ]

    for test_stock in test_stocks:
        print(f"\n  {test_stock['code']} - {test_stock['name']} ({test_stock['industry']}):")
        fundamental_data = await analyzer._get_fundamental_data(test_stock['code'])
        if fundamental_data:
            has_data = fundamental_data.get('has_fundamental_data', False)
            print(f"    有实际数据: {has_data}")
            print(f"    ROE: {fundamental_data.get('roe')}%")
            print(f"    PE: {fundamental_data.get('pe')}")
            print(f"    PB: {fundamental_data.get('pb')}")
            print(f"    营收增长率: {fundamental_data.get('revenue_growth')}%")
            print(f"    基本面综合评分: {fundamental_data.get('overall_fundamental_score')}")

            # 计算基本面评分
            fundamental_score = analyzer._calculate_fundamental_score(fundamental_data)
            print(f"    计算出的基本面评分: {fundamental_score}")

    # 3. 测试运行智能选股
    print("\n3. 测试运行智能选股...")
    strategy_config = {
        'weights': {
            'technical': 0.35,
            'fundamental': 0.30,
            'capital': 0.25,
            'market': 0.10,
        },
        'min_score': 40.0,  # 降低最低评分
        'max_results': 20
    }

    try:
        results = await analyzer.run_smart_selection(strategy_config)
        print(f"找到 {len(results)} 只符合条件的股票")

        if results:
            print("\n选股结果（前10只）:")
            for i, result in enumerate(results[:10]):
                print(f"  {i+1}. {result['stock_code']} - {result['stock_name']}")
                print(f"     综合评分: {result['overall_score']}")
                print(f"     技术面: {result['technical_score']}, 基本面: {result['fundamental_score']}")
                print(f"     资金面: {result['capital_score']}, 市场面: {result['market_score']}")
                print(f"     风险等级: {result['risk_level']}, 持有期: {result['holding_period']}")

            # 统计行业分布
            industry_counts = {}
            for result in results:
                # 从股票代码获取行业信息
                for stock in stocks:
                    if stock['stock_code'] == result['stock_code']:
                        industry = stock['industry']
                        industry_counts[industry] = industry_counts.get(industry, 0) + 1
                        break

            print(f"\n行业分布:")
            for industry, count in sorted(industry_counts.items(), key=lambda x: x[1], reverse=True):
                print(f"  {industry}: {count}只")

    except Exception as e:
        print(f"运行智能选股失败: {e}")
        import traceback
        traceback.print_exc()

async def main():
    """主函数"""
    print("改进后的智能选股算法测试")
    print("=" * 50)

    await test_improved_algorithm()

    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())