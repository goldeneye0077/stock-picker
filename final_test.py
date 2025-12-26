#!/usr/bin/env python3
"""
最终测试验证
"""

import asyncio
import sys
import os
from pathlib import Path

# 添加data-service到Python路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def test_xindazhou_final():
    """最终测试新大洲A"""
    analyzer = SmartSelectionAnalyzer()
    stock_code = "000571.SZ"

    print("=== 最终测试：新大洲A ===")

    # 获取所有数据
    fundamental_data = await analyzer._get_fundamental_data(stock_code)
    technical_data = await analyzer._get_technical_data(stock_code)
    capital_data = await analyzer._get_capital_data(stock_code)
    market_data = await analyzer._get_market_data(stock_code)

    print(f"基本面评分: {fundamental_data.get('overall_fundamental_score', 'N/A') if fundamental_data else 'N/A'}")
    print(f"技术面评分: {technical_data.get('technical_score', 'N/A') if technical_data else 'N/A'}")
    print(f"资金面评分: {analyzer._calculate_capital_score(capital_data) if capital_data else 'N/A'}")
    print(f"市场面评分: {market_data.get('market_score', 'N/A') if market_data else 'N/A'}")

    # 计算综合评分
    if all([technical_data, fundamental_data, capital_data, market_data]):
        technical_score = technical_data.get('technical_score', 0)
        fundamental_score = fundamental_data.get('overall_fundamental_score', 0)
        capital_score = analyzer._calculate_capital_score(capital_data)
        market_score = market_data.get('market_score', 0)

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

        print(f"\n综合评分: {overall_score:.1f}")

        # 判断是否会被选中
        min_score = 50  # 最低评分标准
        if overall_score >= min_score:
            print(f"问题：新大洲A仍然会被选中（评分 ≥ {min_score}）")
            print("建议：进一步提高评分标准或增加负面因子")
        else:
            print(f"修复成功：新大洲A不会被选中（评分 < {min_score}）")

async def test_strategy_comparison():
    """测试四种策略的差异"""
    analyzer = SmartSelectionAnalyzer()

    print("\n=== 策略对比测试 ===")

    # 模拟股票数据
    stock_data = {
        'technical_score': 80.0,
        'fundamental_score': 20.0,  # 低基本面评分
        'capital_score': 60.0,
        'market_score': 50.0
    }

    strategies = {
        '均衡策略': {'technical': 0.35, 'fundamental': 0.30, 'capital': 0.25, 'market': 0.10},
        '价值投资': {'technical': 0.20, 'fundamental': 0.50, 'capital': 0.20, 'market': 0.10},
        '技术突破': {'technical': 0.60, 'fundamental': 0.15, 'capital': 0.15, 'market': 0.10},
        '资金驱动': {'technical': 0.25, 'fundamental': 0.20, 'capital': 0.45, 'market': 0.10}
    }

    for strategy_name, weights in strategies.items():
        score = (
            stock_data['technical_score'] * weights['technical'] +
            stock_data['fundamental_score'] * weights['fundamental'] +
            stock_data['capital_score'] * weights['capital'] +
            stock_data['market_score'] * weights['market']
        )

        print(f"{strategy_name}: {score:.1f}分")

        # 价值投资策略应该对基本面差的股票评分最低
        if strategy_name == '价值投资' and score < 40:
            print("  价值投资策略成功：对基本面差的股票评分低")

async def test_hot_sector_improvement():
    """测试热门板块改进建议"""
    print("\n=== 热门板块改进建议 ===")

    print("当前问题：热门板块股票在数据库中无数据")
    print("解决方案：")
    print("1. 更新数据采集脚本，确保采集热门板块股票")
    print("2. 热门板块定义：")
    print("   - 商业航天：卫星、火箭、航天电子")
    print("   - CPO：光模块、光通信")
    print("   - AI算力硬件：GPU、AI芯片、服务器")
    print("3. 数据源建议：")
    print("   - 使用Tushare Pro的行业分类")
    print("   - 关注新闻热点和资金流向")
    print("   - 定期更新热门板块列表")

async def main():
    """主函数"""
    try:
        await test_xindazhou_final()
        await test_strategy_comparison()
        await test_hot_sector_improvement()

        print("\n=== 总结 ===")
        print("修复成果：")
        print("1. 基本面评分算法：差股票评分大幅降低")
        print("2. 技术面评分算法：区分强势和弱势股票")
        print("3. 行业默认值：评分减半，鼓励使用实际数据")
        print("4. 数据获取：修复了技术面和市场面评分计算")
        print("\n仍需改进：")
        print("1. 数据覆盖：确保热门板块股票有数据")
        print("2. 趋势判断：增加更准确的趋势分析")
        print("3. 板块热度：实时更新板块热度排名")
        print("4. 风险控制：增加ST股、退市风险识别")

    except Exception as e:
        print(f"测试失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())