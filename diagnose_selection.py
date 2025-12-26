#!/usr/bin/env python3
"""诊断选股问题"""

import sys
import asyncio
from datetime import datetime

# 添加项目路径
sys.path.append('data-service/src')

from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer

async def diagnose():
    print("=== 选股问题诊断 ===")
    print(f"诊断时间: {datetime.now()}")

    analyzer = AdvancedSelectionAnalyzer()

    # 1. 检查数据库连接和股票数量
    print("\n1. 检查数据库...")
    try:
        stocks = await analyzer._get_stock_list()
        print(f"  数据库中有 {len(stocks)} 只股票")

        if stocks:
            # 检查前5只股票的基本信息
            print("  前5只股票示例:")
            for i, stock in enumerate(stocks[:5]):
                print(f"    {i+1}. {stock.get('stock_code')} - {stock.get('stock_name')} - 行业: {stock.get('industry', '未知')}")
    except Exception as e:
        print(f"  数据库检查失败: {e}")

    # 2. 测试单只股票分析
    print("\n2. 测试单只股票分析...")
    if stocks:
        test_stock = stocks[0]
        print(f"  测试股票: {test_stock.get('stock_code')}")

        try:
            result = await analyzer.analyze_stock(test_stock)
            if result:
                print(f"  分析成功!")
                print(f"    综合评分: {result['composite_score']:.1f}")
                print(f"    趋势斜率: {result['trend_slope']:.4f}%")
                print(f"    板块热度: {result['sector_heat']:.1f}")
                print(f"    技术评分: {result['technical_score']:.1f}")
                print(f"    基本面评分: {result['fundamental_score']:.1f}")

                # 检查是否满足筛选条件
                print(f"  筛选条件检查:")
                print(f"    最低评分50: {'通过' if result['composite_score'] >= 50 else '不通过'}")
                trend_pass = result['trend_slope'] >= -0.05
                print(f"    上升趋势(斜率>-0.05%): {'通过' if trend_pass else f'不通过 (斜率={result[\"trend_slope\"]:.4f}%)'}")
                sector_pass = result['sector_heat'] >= 30
                print(f"    热门板块(热度>=30): {'通过' if sector_pass else f'不通过 (热度={result[\"sector_heat\"]:.1f})'}")
            else:
                print("  分析失败或数据不足")
        except Exception as e:
            print(f"  分析失败: {e}")
            import traceback
            traceback.print_exc()

    # 3. 测试完整选股算法（简化版）
    print("\n3. 测试完整选股算法（分析前20只股票）...")
    try:
        # 只分析前20只股票加快速度
        test_stocks = stocks[:20] if len(stocks) > 20 else stocks

        qualified_stocks = []
        for i, stock in enumerate(test_stocks):
            result = await analyzer.analyze_stock(stock)
            if result and result['composite_score'] >= 50:
                if result['trend_slope'] >= -0.05 and result['sector_heat'] >= 30:
                    qualified_stocks.append(result)

            if (i + 1) % 5 == 0:
                print(f"  已分析 {i+1}/{len(test_stocks)} 只股票，找到 {len(qualified_stocks)} 只符合条件的")

        print(f"  结果: 在 {len(test_stocks)} 只股票中，找到 {len(qualified_stocks)} 只符合条件的股票")

        if qualified_stocks:
            print("  符合条件的股票:")
            for i, r in enumerate(qualified_stocks):
                print(f"    {i+1}. {r['stock_code']} - 评分: {r['composite_score']:.1f}, 斜率: {r['trend_slope']:.4f}%, 热度: {r['sector_heat']:.1f}")
        else:
            print("  没有找到符合条件的股票")

    except Exception as e:
        print(f"  选股测试失败: {e}")

    # 4. 检查API端点
    print("\n4. 检查API端点...")
    import requests
    try:
        # 测试健康检查
        health_url = "http://localhost:8002/api/advanced-selection/advanced/health"
        response = requests.get(health_url, timeout=5)
        print(f"  健康检查: {'正常' if response.status_code == 200 else '异常'}")

        # 测试策略列表
        strategies_url = "http://localhost:8002/api/advanced-selection/advanced/strategies"
        response = requests.get(strategies_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  策略列表: 有 {data.get('count', 0)} 个策略")
        else:
            print(f"  策略列表: 请求失败 ({response.status_code})")

    except Exception as e:
        print(f"  API检查失败: {e}")

    print("\n=== 诊断完成 ===")

if __name__ == "__main__":
    asyncio.run(diagnose())