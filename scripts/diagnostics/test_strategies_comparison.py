#!/usr/bin/env python3
"""
测试四种策略的差异
"""

import asyncio
import sys
from pathlib import Path

# 添加data-service到Python路径
sys.path.insert(0, str(Path(__file__).parent / "data-service" / "src"))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def compare_strategies():
    """比较四种策略"""
    print("=== 智能选股策略对比测试 ===\n")

    # 创建分析器实例
    analyzer = SmartSelectionAnalyzer()

    # 获取策略列表
    strategies = await analyzer.get_selection_strategies()
    print(f"可用策略数量: {len(strategies)}\n")

    # 定义四种策略配置
    strategy_configs = {
        "均衡策略": {
            'weights': {'technical': 0.35, 'fundamental': 0.30, 'capital': 0.25, 'market': 0.10},
            'description': '技术面、基本面、资金面均衡配置'
        },
        "价值投资": {
            'weights': {'technical': 0.20, 'fundamental': 0.50, 'capital': 0.20, 'market': 0.10},
            'description': '侧重基本面分析，寻找低估优质股'
        },
        "技术突破": {
            'weights': {'technical': 0.50, 'fundamental': 0.20, 'capital': 0.20, 'market': 0.10},
            'description': '侧重技术面分析，捕捉趋势机会'
        },
        "资金驱动": {
            'weights': {'technical': 0.25, 'fundamental': 0.25, 'capital': 0.40, 'market': 0.10},
            'description': '侧重资金流向，跟随主力资金'
        }
    }

    # 测试每种策略
    all_results = {}

    for strategy_name, config in strategy_configs.items():
        print(f"\n{'='*60}")
        print(f"策略: {strategy_name}")
        print(f"描述: {config['description']}")
        print(f"权重配置: 技术面{config['weights']['technical']:.0%}, "
              f"基本面{config['weights']['fundamental']:.0%}, "
              f"资金面{config['weights']['capital']:.0%}, "
              f"市场面{config['weights']['market']:.0%}")
        print(f"{'='*60}")

        # 运行选股
        strategy_config = {
            'weights': config['weights'],
            'min_score': 50.0,  # 统一使用50分最低评分
            'max_results': 10   # 每种策略取前10只
        }

        try:
            results = await analyzer.run_smart_selection(strategy_config)
            all_results[strategy_name] = results

            print(f"选股数量: {len(results)}")

            if results:
                # 显示前5只股票
                print("\n前5只选股结果:")
                for i, result in enumerate(results[:5]):
                    print(f"  {i+1}. {result['stock_code']} - {result['stock_name']}")
                    print(f"     综合评分: {result['overall_score']:.1f} "
                          f"(技术{result['technical_score']:.1f}, "
                          f"基本{result['fundamental_score']:.1f}, "
                          f"资金{result['capital_score']:.1f}, "
                          f"市场{result['market_score']:.1f})")

                # 计算平均分
                avg_overall = sum(r['overall_score'] for r in results) / len(results)
                avg_tech = sum(r['technical_score'] for r in results) / len(results)
                avg_fund = sum(r['fundamental_score'] for r in results) / len(results)
                avg_capital = sum(r['capital_score'] for r in results) / len(results)
                avg_market = sum(r['market_score'] for r in results) / len(results)

                print(f"\n平均评分: 综合{avg_overall:.1f}, "
                      f"技术{avg_tech:.1f}, 基本{avg_fund:.1f}, "
                      f"资金{avg_capital:.1f}, 市场{avg_market:.1f}")

                # 分析行业分布
                industries = {}
                for result in results:
                    # 从股票代码获取行业（简化处理）
                    industry = "未知"
                    for strategy in strategies:
                        if strategy['strategy_name'] == strategy_name:
                            # 这里应该从数据库获取行业信息，简化处理
                            industry = "测试行业"
                            break
                    industries[industry] = industries.get(industry, 0) + 1

                print(f"行业分布: {len(industries)}个行业")

        except Exception as e:
            print(f"运行策略失败: {e}")
            import traceback
            traceback.print_exc()

    # 比较策略差异
    print(f"\n{'='*80}")
    print("策略对比分析")
    print(f"{'='*80}")

    # 检查选股重叠度
    if all_results:
        stock_sets = {}
        for strategy_name, results in all_results.items():
            stock_codes = set(r['stock_code'] for r in results)
            stock_sets[strategy_name] = stock_codes

        print("\n策略间选股重叠度:")
        strategies_list = list(stock_sets.keys())

        for i in range(len(strategies_list)):
            for j in range(i+1, len(strategies_list)):
                strategy1 = strategies_list[i]
                strategy2 = strategies_list[j]
                set1 = stock_sets[strategy1]
                set2 = stock_sets[strategy2]

                overlap = set1.intersection(set2)
                overlap_count = len(overlap)
                total_unique = len(set1.union(set2))

                if total_unique > 0:
                    overlap_ratio = overlap_count / total_unique
                    print(f"  {strategy1} vs {strategy2}: "
                          f"{overlap_count}只重叠 ({overlap_ratio:.0%})")

                    if overlap_count > 0:
                        print(f"    重叠股票: {', '.join(sorted(overlap))}")

        # 分析各策略特点
        print("\n各策略特点分析:")
        for strategy_name, results in all_results.items():
            if results:
                # 计算各维度平均分
                avg_tech = sum(r['technical_score'] for r in results) / len(results)
                avg_fund = sum(r['fundamental_score'] for r in results) / len(results)
                avg_capital = sum(r['capital_score'] for r in results) / len(results)

                print(f"\n  {strategy_name}:")
                print(f"    技术面平均分: {avg_tech:.1f}")
                print(f"    基本面平均分: {avg_fund:.1f}")
                print(f"    资金面平均分: {avg_capital:.1f}")

                # 找出最高分股票
                top_stock = max(results, key=lambda x: x['overall_score'])
                print(f"    最高分股票: {top_stock['stock_code']} "
                      f"(综合{top_stock['overall_score']:.1f})")

async def test_single_stock_with_different_strategies():
    """测试单只股票在不同策略下的评分"""
    print(f"\n{'='*80}")
    print("单只股票在不同策略下的评分测试")
    print(f"{'='*80}")

    analyzer = SmartSelectionAnalyzer()

    # 获取一只股票
    stocks = await analyzer._get_stock_list()
    if not stocks:
        print("未获取到股票列表")
        return

    test_stock = stocks[0]  # 第一只股票
    print(f"\n测试股票: {test_stock['stock_code']} - {test_stock['stock_name']}")

    # 四种策略权重
    strategies = {
        "均衡策略": {'technical': 0.35, 'fundamental': 0.30, 'capital': 0.25, 'market': 0.10},
        "价值投资": {'technical': 0.20, 'fundamental': 0.50, 'capital': 0.20, 'market': 0.10},
        "技术突破": {'technical': 0.50, 'fundamental': 0.20, 'capital': 0.20, 'market': 0.10},
        "资金驱动": {'technical': 0.25, 'fundamental': 0.25, 'capital': 0.40, 'market': 0.10}
    }

    # 分析这只股票
    stock_info = test_stock
    results = {}

    for strategy_name, weights in strategies.items():
        result = await analyzer.analyze_stock(stock_info, weights)
        if result:
            results[strategy_name] = result

    # 显示结果
    if results:
        print(f"\n{'策略':<12} {'综合评分':<8} {'技术面':<8} {'基本面':<8} {'资金面':<8} {'市场面':<8}")
        print("-" * 60)

        for strategy_name, result in results.items():
            print(f"{strategy_name:<12} {result['overall_score']:<8.1f} "
                  f"{result['technical_score']:<8.1f} {result['fundamental_score']:<8.1f} "
                  f"{result['capital_score']:<8.1f} {result['market_score']:<8.1f}")

        # 分析差异
        print(f"\n分析:")
        max_score_strategy = max(results.items(), key=lambda x: x[1]['overall_score'])
        min_score_strategy = min(results.items(), key=lambda x: x[1]['overall_score'])

        print(f"  最高分策略: {max_score_strategy[0]} ({max_score_strategy[1]['overall_score']:.1f}分)")
        print(f"  最低分策略: {min_score_strategy[0]} ({min_score_strategy[1]['overall_score']:.1f}分)")

        score_range = max_score_strategy[1]['overall_score'] - min_score_strategy[1]['overall_score']
        print(f"  评分差异: {score_range:.1f}分")

        if score_range > 5:
            print(f"  ✅ 策略差异明显，不同策略适合不同风格的股票")
        elif score_range > 2:
            print(f"  ⚠️  策略有一定差异")
        else:
            print(f"  ❌ 策略差异不明显，可能需要调整权重配置")

async def main():
    """主函数"""
    print("智能选股策略对比测试")
    print("=" * 50)

    await compare_strategies()
    await test_single_stock_with_different_strategies()

    print("\n测试完成")

if __name__ == "__main__":
    asyncio.run(main())