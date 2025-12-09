#!/usr/bin/env python3
"""
测试评分算法分布
"""

import asyncio
import sys
from pathlib import Path

# 添加data-service到Python路径
sys.path.insert(0, str(Path(__file__).parent / "data-service" / "src"))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def test_scoring_distribution():
    """测试评分分布"""
    print("=== 测试评分算法分布 ===\n")

    # 创建分析器实例
    analyzer = SmartSelectionAnalyzer()

    # 获取股票列表
    stocks = await analyzer._get_stock_list()
    print(f"股票数量: {len(stocks)}")

    if not stocks:
        print("未获取到股票列表")
        return

    # 分析前20只股票
    sample_stocks = stocks[:20]

    scores = {
        'technical': [],
        'fundamental': [],
        'capital': [],
        'market': [],
        'overall': []
    }

    print("分析前20只股票的评分分布:\n")
    print(f"{'股票代码':<10} {'股票名称':<10} {'技术面':<8} {'基本面':<8} {'资金面':<8} {'市场面':<8} {'综合':<8}")
    print("-" * 70)

    for i, stock in enumerate(sample_stocks):
        weights = {
            'technical': 0.35,
            'fundamental': 0.30,
            'capital': 0.25,
            'market': 0.10,
        }

        result = await analyzer.analyze_stock(stock, weights)

        if result:
            tech_score = result['technical_score']
            fund_score = result['fundamental_score']
            capital_score = result['capital_score']
            market_score = result['market_score']
            overall_score = result['overall_score']

            scores['technical'].append(tech_score)
            scores['fundamental'].append(fund_score)
            scores['capital'].append(capital_score)
            scores['market'].append(market_score)
            scores['overall'].append(overall_score)

            print(f"{stock['stock_code']:<10} {stock['stock_name']:<10} "
                  f"{tech_score:<8.1f} {fund_score:<8.1f} {capital_score:<8.1f} "
                  f"{market_score:<8.1f} {overall_score:<8.1f}")

    # 计算统计信息
    print("\n" + "=" * 70)
    print("评分统计信息:\n")

    for dimension in ['technical', 'fundamental', 'capital', 'market', 'overall']:
        if scores[dimension]:
            avg = sum(scores[dimension]) / len(scores[dimension])
            min_val = min(scores[dimension])
            max_val = max(scores[dimension])

            print(f"{dimension:>12}评分: 平均={avg:.1f}, 最低={min_val:.1f}, 最高={max_val:.1f}")

    # 分析评分分布
    print("\n" + "=" * 70)
    print("评分分布分析:\n")

    # 技术面评分分布
    tech_bins = {'0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0}
    for score in scores['technical']:
        if score <= 20:
            tech_bins['0-20'] += 1
        elif score <= 40:
            tech_bins['21-40'] += 1
        elif score <= 60:
            tech_bins['41-60'] += 1
        elif score <= 80:
            tech_bins['61-80'] += 1
        else:
            tech_bins['81-100'] += 1

    print("技术面评分分布:")
    for bin_range, count in tech_bins.items():
        print(f"  {bin_range}: {count}只股票 ({count/len(scores['technical'])*100:.1f}%)")

    # 基本面评分分布
    fund_bins = {'0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0}
    for score in scores['fundamental']:
        if score <= 20:
            fund_bins['0-20'] += 1
        elif score <= 40:
            fund_bins['21-40'] += 1
        elif score <= 60:
            fund_bins['41-60'] += 1
        elif score <= 80:
            fund_bins['61-80'] += 1
        else:
            fund_bins['81-100'] += 1

    print("\n基本面评分分布:")
    for bin_range, count in fund_bins.items():
        print(f"  {bin_range}: {count}只股票 ({count/len(scores['fundamental'])*100:.1f}%)")

    # 综合评分分布
    overall_bins = {'0-20': 0, '21-40': 0, '41-60': 0, '61-80': 0, '81-100': 0}
    for score in scores['overall']:
        if score <= 20:
            overall_bins['0-20'] += 1
        elif score <= 40:
            overall_bins['21-40'] += 1
        elif score <= 60:
            overall_bins['41-60'] += 1
        elif score <= 80:
            overall_bins['61-80'] += 1
        else:
            overall_bins['81-100'] += 1

    print("\n综合评分分布:")
    for bin_range, count in overall_bins.items():
        print(f"  {bin_range}: {count}只股票 ({count/len(scores['overall'])*100:.1f}%)")

async def main():
    """主函数"""
    print("评分算法分布测试")
    print("=" * 50)

    await test_scoring_distribution()

    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())