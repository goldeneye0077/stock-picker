#!/usr/bin/env python3
"""
分析新大洲A的选股评分
"""

import asyncio
import aiosqlite
import sys
import os
from pathlib import Path

# 添加data-service到Python路径
sys.path.append(str(Path(__file__).parent / 'data-service' / 'src'))

from analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

async def analyze_xindazhou():
    """分析新大洲A的具体评分"""
    analyzer = SmartSelectionAnalyzer()

    # 新大洲A的股票代码
    stock_code = "000571.SZ"

    print(f"=== 分析新大洲A ({stock_code}) ===")

    # 1. 获取基本面数据
    print("\n1. 基本面数据:")
    fundamental_data = await analyzer._get_fundamental_data(stock_code)
    if fundamental_data:
        print(f"   ROE: {fundamental_data.get('roe', 'N/A')}%")
        print(f"   PE: {fundamental_data.get('pe', 'N/A')}")
        print(f"   PB: {fundamental_data.get('pb', 'N/A')}")
        print(f"   营收增长率: {fundamental_data.get('revenue_growth', 'N/A')}%")
        print(f"   利润增长率: {fundamental_data.get('profit_growth', 'N/A')}%")
        print(f"   负债率: {fundamental_data.get('debt_ratio', 'N/A')}%")
        print(f"   基本面评分: {fundamental_data.get('overall_fundamental_score', 'N/A')}")
        print(f"   数据来源: {fundamental_data.get('data_source', 'N/A')}")
        print(f"   行业: {fundamental_data.get('industry', 'N/A')}")
    else:
        print("   无法获取基本面数据")

    # 2. 获取技术面数据
    print("\n2. 技术面数据:")
    technical_data = await analyzer._get_technical_data(stock_code)
    if technical_data:
        print(f"   当前价格: {technical_data.get('current_price', 'N/A')}")
        print(f"   20日涨跌幅: {technical_data.get('price_change_20d', 'N/A')}%")
        print(f"   量比: {technical_data.get('volume_ratio', 'N/A')}")
        print(f"   技术面评分: {technical_data.get('technical_score', 'N/A')}")
    else:
        print("   无法获取技术面数据")

    # 3. 获取资金面数据
    print("\n3. 资金面数据:")
    capital_data = await analyzer._get_capital_data(stock_code)
    if capital_data:
        print(f"   主力资金净流入: {capital_data.get('main_net_inflow', 'N/A')}")
        print(f"   散户资金净流入: {capital_data.get('retail_net_inflow', 'N/A')}")
        print(f"   大单占比: {capital_data.get('large_order_ratio', 'N/A')}")
    else:
        print("   无法获取资金面数据")

    # 4. 获取市场面数据
    print("\n4. 市场面数据:")
    market_data = await analyzer._get_market_data(stock_code)
    if market_data:
        print(f"   板块热度: {market_data.get('sector_heat', 'N/A')}")
        print(f"   板块5日涨幅: {market_data.get('sector_5d_change', 'N/A')}%")
        print(f"   市场面评分: {market_data.get('market_score', 'N/A')}")
    else:
        print("   无法获取市场面数据")

    # 5. 计算综合评分
    print("\n5. 综合评分计算:")
    stock_info = {
        'code': stock_code,
        'name': '新大洲A'
    }

    # 获取行业
    try:
        async with aiosqlite.connect(analyzer.db_path) as db:
            industry = await analyzer._get_industry(stock_code, db)
            print(f"   行业: {industry}")
    except Exception as e:
        print(f"   获取行业失败: {e}")

    # 计算各维度评分
    technical_score = technical_data.get('technical_score', 0) if technical_data else 0
    fundamental_score = fundamental_data.get('overall_fundamental_score', 0) if fundamental_data else 0
    capital_score = analyzer._calculate_capital_score(capital_data) if capital_data else 0
    market_score = market_data.get('market_score', 0) if market_data else 0

    print(f"   技术面评分: {technical_score}")
    print(f"   基本面评分: {fundamental_score}")
    print(f"   资金面评分: {capital_score}")
    print(f"   市场面评分: {market_score}")

    # 计算均衡策略的综合评分
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

    print(f"   均衡策略综合评分: {overall_score:.1f}")

    # 6. 检查数据库中的实际数据
    print("\n6. 数据库实际数据检查:")
    await check_database_data(stock_code, analyzer.db_path)

async def check_database_data(stock_code: str, db_path: str):
    """检查数据库中的实际数据"""
    try:
        async with aiosqlite.connect(db_path) as db:
            # 检查daily_basic表
            cursor = await db.execute("""
                SELECT pe_ttm, pb, total_mv, circ_mv, trade_date
                FROM daily_basic
                WHERE stock_code = ?
                ORDER BY trade_date DESC
                LIMIT 1
            """, (stock_code,))

            row = await cursor.fetchone()
            if row:
                pe_ttm, pb, total_mv, circ_mv, trade_date = row
                print(f"   daily_basic表数据:")
                print(f"     PE TTM: {pe_ttm}")
                print(f"     PB: {pb}")
                print(f"     总市值: {total_mv}亿元")
                print(f"     流通市值: {circ_mv}亿元")
                print(f"     最新日期: {trade_date}")
            else:
                print("   daily_basic表中无数据")

            # 检查klines表
            cursor = await db.execute("""
                SELECT close, volume, trade_date
                FROM klines
                WHERE stock_code = ?
                ORDER BY trade_date DESC
                LIMIT 20
            """, (stock_code,))

            rows = await cursor.fetchall()
            if rows:
                print(f"   klines表数据: {len(rows)}条记录")
                if len(rows) >= 2:
                    latest_close = rows[0][0]
                    prev_close = rows[1][0]
                    price_change = ((latest_close - prev_close) / prev_close * 100) if prev_close > 0 else 0
                    print(f"     最新收盘价: {latest_close}")
                    print(f"     前一日收盘价: {prev_close}")
                    print(f"     日涨跌幅: {price_change:.2f}%")
            else:
                print("   klines表中无数据")

            # 检查fund_flow表
            cursor = await db.execute("""
                SELECT main_fund_flow, retail_fund_flow, large_order_ratio, date
                FROM fund_flow
                WHERE stock_code = ?
                ORDER BY date DESC
                LIMIT 1
            """, (stock_code,))

            row = await cursor.fetchone()
            if row:
                main_flow, retail_flow, large_order_ratio, date = row
                print(f"   fund_flow表数据:")
                print(f"     主力资金流向: {main_flow}")
                print(f"     散户资金流向: {retail_flow}")
                print(f"     大单占比: {large_order_ratio}")
                print(f"     最新日期: {date}")
            else:
                print("   fund_flow表中无数据")

    except Exception as e:
        print(f"   数据库查询失败: {e}")

async def main():
    """主函数"""
    try:
        await analyze_xindazhou()
    except Exception as e:
        print(f"分析失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())