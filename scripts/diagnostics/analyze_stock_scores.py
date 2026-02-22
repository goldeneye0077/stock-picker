#!/usr/bin/env python3
"""
分析不同代码段股票的评分情况
诊断为什么只能筛选出9字头股票
"""

import asyncio
import sys
import random
from datetime import datetime

# 添加项目路径
sys.path.append('data-service/src')

from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer


async def analyze_stock_scores():
    """分析不同代码段股票的评分"""
    print("=" * 80)
    print("股票评分分析报告")
    print("=" * 80)

    analyzer = AdvancedSelectionAnalyzer()

    # 获取股票列表
    stocks = await analyzer._get_stock_list()
    if not stocks:
        print("错误: 无法获取股票列表")
        return

    print(f"数据库中共有 {len(stocks)} 只股票")

    # 按代码段分类
    stock_groups = {
        '上证A股 (60开头)': [],
        '深证主板 (00开头)': [],
        '创业板 (30开头)': [],
        '科创板 (68开头)': [],
        '北交所 (8开头)': [],
        '其他 (9开头等)': []
    }

    for stock in stocks:
        code = stock.get('stock_code', '')
        if not code:
            continue

        if code.startswith('60'):
            stock_groups['上证A股 (60开头)'].append(stock)
        elif code.startswith('00'):
            stock_groups['深证主板 (00开头)'].append(stock)
        elif code.startswith('30'):
            stock_groups['创业板 (30开头)'].append(stock)
        elif code.startswith('68'):
            stock_groups['科创板 (68开头)'].append(stock)
        elif code.startswith('8'):
            stock_groups['北交所 (8开头)'].append(stock)
        else:
            stock_groups['其他 (9开头等)'].append(stock)

    # 打印各市场股票数量
    print("\n各市场股票数量统计:")
    for market, market_stocks in stock_groups.items():
        print(f"  {market}: {len(market_stocks)} 只")

    # 从每个市场随机抽取5只股票进行分析
    print("\n" + "=" * 80)
    print("各市场股票评分分析（每市场随机5只）")
    print("=" * 80)

    all_results = []

    for market, market_stocks in stock_groups.items():
        if not market_stocks:
            print(f"\n{market}: 无股票数据")
            continue

        # 随机抽取5只股票
        sample_size = min(5, len(market_stocks))
        sample_stocks = random.sample(market_stocks, sample_size)

        print(f"\n{market} (分析{sample_size}只):")
        print("-" * 60)

        market_results = []

        for i, stock in enumerate(sample_stocks, 1):
            code = stock.get('stock_code', '未知')
            name = stock.get('stock_name', '未知')

            print(f"\n{i}. {code} - {name}")

            try:
                # 分析股票
                result = await analyzer.analyze_stock(stock)

                if result:
                    score = result['composite_score']
                    trend = result['trend_slope']
                    heat = result['sector_heat']
                    tech = result['technical_score']
                    fund = result['fundamental_score']

                    print(f"   综合评分: {score:.1f}")
                    print(f"   趋势斜率: {trend:.4f}%")
                    print(f"   板块热度: {heat:.1f}")
                    print(f"   技术评分: {tech:.1f}")
                    print(f"   基本面评分: {fund:.1f}")

                    # 检查筛选条件
                    min_score = 20  # 用户设置的最低评分
                    require_uptrend = True
                    require_hot_sector = True

                    passes_score = score >= min_score
                    passes_trend = not require_uptrend or trend >= -0.05
                    passes_sector = not require_hot_sector or heat >= 30

                    print(f"   筛选结果: 评分{'通过' if passes_score else '不通过'} | "
                          f"趋势{'通过' if passes_trend else '不通过'} | "
                          f"板块{'通过' if passes_sector else '不通过'}")

                    if passes_score and passes_trend and passes_sector:
                        print(f"   ✅ 符合动量突破策略条件!")
                        market_results.append({
                            'code': code,
                            'name': name,
                            'score': score,
                            'trend': trend,
                            'heat': heat
                        })
                    else:
                        print(f"   ❌ 不符合动量突破策略条件")

                else:
                    print(f"   分析失败或数据不足")

            except Exception as e:
                print(f"   分析异常: {e}")

            # 避免过度消耗资源
            await asyncio.sleep(0.1)

        all_results.append({
            'market': market,
            'results': market_results,
            'total_analyzed': sample_size,
            'qualified': len(market_results)
        })

    # 汇总分析
    print("\n" + "=" * 80)
    print("汇总分析报告")
    print("=" * 80)

    total_analyzed = 0
    total_qualified = 0

    for market_data in all_results:
        market = market_data['market']
        analyzed = market_data['total_analyzed']
        qualified = market_data['qualified']

        total_analyzed += analyzed
        total_qualified += qualified

        qualification_rate = (qualified / analyzed * 100) if analyzed > 0 else 0

        print(f"\n{market}:")
        print(f"  分析数量: {analyzed} 只")
        print(f"  符合条件: {qualified} 只")
        print(f"  合格率: {qualification_rate:.1f}%")

        if market_data['results']:
            print(f"  符合条件的股票:")
            for stock in market_data['results']:
                print(f"    {stock['code']} - {stock['name']}: "
                      f"评分={stock['score']:.1f}, 斜率={stock['trend']:.4f}%, 热度={stock['heat']:.1f}")

    overall_rate = (total_qualified / total_analyzed * 100) if total_analyzed > 0 else 0
    print(f"\n总体统计:")
    print(f"  总分析数量: {total_analyzed} 只")
    print(f"  总符合条件: {total_qualified} 只")
    print(f"  总体合格率: {overall_rate:.1f}%")

    # 分析可能的问题
    print("\n" + "=" * 80)
    print("问题诊断")
    print("=" * 80)

    if total_qualified == 0:
        print("❌ 问题: 没有股票符合动量突破策略条件")
        print("可能原因:")
        print("  1. 评分算法过于严格")
        print("  2. 趋势斜率条件太苛刻（当前要求: slope >= -0.05%）")
        print("  3. 板块热度条件太苛刻（当前要求: heat >= 30）")
        print("  4. 数据质量问题（某些市场数据不完整）")
    else:
        # 检查是否有市场完全没有符合条件的股票
        problematic_markets = []
        for market_data in all_results:
            if market_data['qualified'] == 0 and market_data['total_analyzed'] > 0:
                problematic_markets.append(market_data['market'])

        if problematic_markets:
            print(f"⚠️ 注意: 以下市场没有符合条件的股票:")
            for market in problematic_markets:
                print(f"  - {market}")
            print("\n可能原因:")
            print("  1. 这些市场的股票评分普遍较低")
            print("  2. 数据质量问题（行业信息缺失等）")
            print("  3. 市场特性不同（某些市场波动性较小）")
        else:
            print("✅ 所有市场都有符合条件的股票")

    print("\n" + "=" * 80)
    print("建议")
    print("=" * 80)

    print("1. 如果某些市场股票评分普遍较低:")
    print("   - 检查这些市场的行业数据完整性")
    print("   - 考虑调整评分权重")
    print("   - 验证技术指标计算是否正确")

    print("\n2. 如果趋势斜率条件太严格:")
    print("   - 考虑放宽趋势斜率条件（如改为 slope >= -0.1%）")
    print("   - 或者取消趋势斜率要求")

    print("\n3. 如果板块热度条件太严格:")
    print("   - 降低板块热度阈值（如改为 heat >= 20）")
    print("   - 改进板块热度计算方法")

    print("\n4. 数据质量问题:")
    print("   - 确保所有股票都有完整的行业信息")
    print("   - 检查K线数据是否完整（至少需要20个交易日数据）")
    print("   - 验证资金流向数据是否可用")

    return all_results


async def test_momentum_strategy():
    """测试动量突破策略的实际筛选结果"""
    print("\n" + "=" * 80)
    print("动量突破策略测试")
    print("=" * 80)

    analyzer = AdvancedSelectionAnalyzer()

    # 测试参数
    min_score = 20
    max_results = 20
    require_uptrend = True
    require_hot_sector = True

    print(f"测试参数:")
    print(f"  最低评分: {min_score}")
    print(f"  最大结果: {max_results}")
    print(f"  要求上升趋势: {require_uptrend}")
    print(f"  要求热门板块: {require_hot_sector}")

    try:
        # 运行策略
        results = await analyzer.run_advanced_selection(
            min_score=min_score,
            max_results=max_results,
            require_uptrend=require_uptrend,
            require_hot_sector=require_hot_sector
        )

        print(f"\n筛选结果: 共找到 {len(results)} 只股票")

        if results:
            # 按市场分类
            market_counts = {
                '上证A股 (60开头)': 0,
                '深证主板 (00开头)': 0,
                '创业板 (30开头)': 0,
                '科创板 (68开头)': 0,
                '北交所 (8开头)': 0,
                '其他 (9开头等)': 0
            }

            print("\n详细结果:")
            for i, result in enumerate(results, 1):
                code = result['stock_code']

                if code.startswith('60'):
                    market = '上证A股 (60开头)'
                elif code.startswith('00'):
                    market = '深证主板 (00开头)'
                elif code.startswith('30'):
                    market = '创业板 (30开头)'
                elif code.startswith('68'):
                    market = '科创板 (68开头)'
                elif code.startswith('8'):
                    market = '北交所 (8开头)'
                else:
                    market = '其他 (9开头等)'

                market_counts[market] += 1

                print(f"{i}. {code} - {market}")
                print(f"   综合评分: {result['composite_score']:.1f}")
                print(f"   趋势斜率: {result['trend_slope']:.4f}%")
                print(f"   板块热度: {result['sector_heat']:.1f}")

            print("\n市场分布:")
            for market, count in market_counts.items():
                if count > 0:
                    print(f"  {market}: {count} 只")
        else:
            print("⚠️ 没有找到符合条件的股票")

    except Exception as e:
        print(f"策略测试失败: {e}")
        import traceback
        traceback.print_exc()


async def main():
    """主函数"""
    print(f"分析时间: {datetime.now()}")

    # 分析各市场股票评分
    await analyze_stock_scores()

    # 测试动量突破策略
    await test_momentum_strategy()

    print("\n" + "=" * 80)
    print("分析完成")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(main())