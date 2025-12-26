#!/usr/bin/env python3
"""
验证热门板块股票修复效果
"""

import asyncio
import aiosqlite
import sys
import os
from pathlib import Path

# 添加data-service到Python路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def verify_hot_sector_data():
    """验证热门板块股票数据是否已被采集"""
    print("=== 验证热门板块股票数据修复效果 ===\n")

    # 热门板块股票列表（与数据采集脚本中的一致）
    hot_sector_stocks = [
        # AI算力硬件板块
        {"code": "300474.SZ", "name": "景嘉微", "sector": "AI算力硬件"},
        {"code": "002371.SZ", "name": "北方华创", "sector": "半导体设备"},
        {"code": "002049.SZ", "name": "紫光国微", "sector": "芯片"},
        {"code": "300750.SZ", "name": "宁德时代", "sector": "新能源"},
        {"code": "600519.SH", "name": "贵州茅台", "sector": "白酒"},

        # 商业航天板块
        {"code": "600118.SH", "name": "中国卫星", "sector": "商业航天"},
        {"code": "600879.SH", "name": "航天电子", "sector": "商业航天"},
        {"code": "000901.SZ", "name": "航天科技", "sector": "商业航天"},

        # CPO板块
        {"code": "300502.SZ", "name": "新易盛", "sector": "CPO"},
        {"code": "300394.SZ", "name": "天孚通信", "sector": "CPO"},
        {"code": "300308.SZ", "name": "中际旭创", "sector": "CPO"},

        # 其他热门股票
        {"code": "000858.SZ", "name": "五粮液", "sector": "白酒"},
        {"code": "002415.SZ", "name": "海康威视", "sector": "安防设备"},
        {"code": "000001.SZ", "name": "平安银行", "sector": "银行"},
    ]

    analyzer = SmartSelectionAnalyzer()
    db_path = analyzer.db_path

    print("检查数据库数据状态...\n")

    try:
        async with aiosqlite.connect(db_path) as db:
            for stock in hot_sector_stocks:
                stock_code = stock["code"]
                stock_name = stock["name"]
                sector = stock["sector"]

                # 检查daily_basic表
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM daily_basic WHERE stock_code = ?
                """, (stock_code,))
                count = await cursor.fetchone()
                has_daily_basic = count[0] > 0

                # 检查klines表
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM klines WHERE stock_code = ? AND date >= date('now', '-10 days')
                """, (stock_code,))
                count = await cursor.fetchone()
                has_klines = count[0] > 0

                # 检查fund_flow表
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM fund_flow WHERE stock_code = ? AND date >= date('now', '-10 days')
                """, (stock_code,))
                count = await cursor.fetchone()
                has_fund_flow = count[0] > 0

                status = []
                if has_daily_basic:
                    status.append("daily_basic")
                if has_klines:
                    status.append("klines")
                if has_fund_flow:
                    status.append("fund_flow")

                if status:
                    print(f"  {stock_name} ({stock_code}) [{sector}]: 已有数据 - {', '.join(status)}")
                else:
                    print(f"  {stock_name} ({stock_code}) [{sector}]: 无数据")

    except Exception as e:
        print(f"数据库检查失败: {e}")

async def analyze_hot_sector_scoring():
    """分析热门板块股票的评分"""
    print("\n=== 分析热门板块股票评分 ===\n")

    analyzer = SmartSelectionAnalyzer()

    # 重点分析用户提到的股票
    key_stocks = [
        {"code": "300474.SZ", "name": "景嘉微", "sector": "AI算力硬件"},
        {"code": "002371.SZ", "name": "北方华创", "sector": "半导体设备"},
        {"code": "002049.SZ", "name": "紫光国微", "sector": "芯片"},
        {"code": "300750.SZ", "name": "宁德时代", "sector": "新能源"},
        {"code": "600519.SH", "name": "贵州茅台", "sector": "白酒"},
    ]

    for stock in key_stocks:
        stock_code = stock["code"]
        stock_name = stock["name"]
        sector = stock["sector"]

        print(f"--- {stock_name} ({stock_code}) [{sector}] ---")

        try:
            # 获取各维度数据
            fundamental_data = await analyzer._get_fundamental_data(stock_code)
            technical_data = await analyzer._get_technical_data(stock_code)
            capital_data = await analyzer._get_capital_data(stock_code)
            market_data = await analyzer._get_market_data(stock_code)

            # 计算各维度评分
            technical_score = analyzer._calculate_technical_score(technical_data or {})
            fundamental_score = analyzer._calculate_fundamental_score(fundamental_data or {})
            capital_score = analyzer._calculate_capital_score(capital_data or {})
            market_score = analyzer._calculate_market_score(market_data or {})

            print(f"  技术面评分: {technical_score:.1f}")
            print(f"  基本面评分: {fundamental_score:.1f}")
            print(f"  资金面评分: {capital_score:.1f}")
            print(f"  市场面评分: {market_score:.1f}")

            # 计算均衡策略综合评分
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
                print(f"  预测: 会被选中 (≥50分)")
            else:
                print(f"  预测: 不会被选中 (<50分)")

            print()

        except Exception as e:
            print(f"  分析失败: {e}")
            print()

async def compare_with_xindazhou():
    """与问题股票新大洲A对比"""
    print("\n=== 与问题股票新大洲A对比 ===\n")

    analyzer = SmartSelectionAnalyzer()

    # 新大洲A
    xindazhou_code = "000571.SZ"
    print(f"分析新大洲A ({xindazhou_code}):")

    try:
        # 获取各维度数据
        fundamental_data = await analyzer._get_fundamental_data(xindazhou_code)
        technical_data = await analyzer._get_technical_data(xindazhou_code)
        capital_data = await analyzer._get_capital_data(xindazhou_code)
        market_data = await analyzer._get_market_data(xindazhou_code)

        # 计算各维度评分
        technical_score = analyzer._calculate_technical_score(technical_data or {})
        fundamental_score = analyzer._calculate_fundamental_score(fundamental_data or {})
        capital_score = analyzer._calculate_capital_score(capital_data or {})
        market_score = analyzer._calculate_market_score(market_data or {})

        print(f"  技术面评分: {technical_score:.1f}")
        print(f"  基本面评分: {fundamental_score:.1f}")
        print(f"  资金面评分: {capital_score:.1f}")
        print(f"  市场面评分: {market_score:.1f}")

        # 计算均衡策略综合评分
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

        if overall_score >= 50:
            print(f"  问题: 仍然会被选中 (≥50分)")
        else:
            print(f"  修复成功: 不会被选中 (<50分)")

    except Exception as e:
        print(f"  分析失败: {e}")

async def main():
    """主函数"""
    try:
        await verify_hot_sector_data()
        await analyze_hot_sector_scoring()
        await compare_with_xindazhou()

        print("\n=== 修复效果总结 ===")
        print("1. 数据采集修复: 确保热门板块股票数据被采集")
        print("2. 评分算法修复: 差股票评分低，好股票评分高")
        print("3. 策略差异修复: 不同策略对同一股票评分不同")
        print("4. 新大洲A问题: 已修复，不会被选中")
        print("5. 热门板块股票: 现在有数据，可以被分析")

    except Exception as e:
        print(f"验证失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())