#!/usr/bin/env python3
"""Diagnose selection problem"""

import sys
import asyncio
from datetime import datetime

# Add project path
sys.path.append('data-service/src')

from analyzers.smart_selection.advanced_selection_analyzer import AdvancedSelectionAnalyzer

async def diagnose():
    print("=== Selection Problem Diagnosis ===")
    print(f"Diagnosis time: {datetime.now()}")

    analyzer = AdvancedSelectionAnalyzer()

    # 1. Check database connection and stock count
    print("\n1. Checking database...")
    try:
        stocks = await analyzer._get_stock_list()
        print(f"  Database has {len(stocks)} stocks")

        if stocks:
            # Check basic info of first 5 stocks
            print("  First 5 stocks example:")
            for i, stock in enumerate(stocks[:5]):
                print(f"    {i+1}. {stock.get('stock_code')} - {stock.get('stock_name')} - Industry: {stock.get('industry', 'Unknown')}")
    except Exception as e:
        print(f"  Database check failed: {e}")

    # 2. Test single stock analysis
    print("\n2. Testing single stock analysis...")
    if stocks:
        test_stock = stocks[0]
        print(f"  Test stock: {test_stock.get('stock_code')}")

        try:
            result = await analyzer.analyze_stock(test_stock)
            if result:
                print(f"  Analysis successful!")
                print(f"    Composite score: {result['composite_score']:.1f}")
                print(f"    Trend slope: {result['trend_slope']:.4f}%")
                print(f"    Sector heat: {result['sector_heat']:.1f}")
                print(f"    Technical score: {result['technical_score']:.1f}")
                print(f"    Fundamental score: {result['fundamental_score']:.1f}")

                # Check if meets filter conditions
                print(f"  Filter condition check:")
                print(f"    Min score 50: {'PASS' if result['composite_score'] >= 50 else 'FAIL'}")
                trend_pass = result['trend_slope'] >= -0.05
                slope_str = f" (slope={result['trend_slope']:.4f}%)"
                print(f"    Uptrend(slope>-0.05%): {'PASS' if trend_pass else 'FAIL' + slope_str}")
                sector_pass = result['sector_heat'] >= 30
                heat_str = f" (heat={result['sector_heat']:.1f})"
                print(f"    Hot sector(heat>=30): {'PASS' if sector_pass else 'FAIL' + heat_str}")
            else:
                print("  Analysis failed or insufficient data")
        except Exception as e:
            print(f"  Analysis failed: {e}")
            import traceback
            traceback.print_exc()

    # 3. Test full selection algorithm (simplified)
    print("\n3. Testing full selection algorithm (analyze first 20 stocks)...")
    try:
        # Only analyze first 20 stocks for speed
        test_stocks = stocks[:20] if len(stocks) > 20 else stocks

        qualified_stocks = []
        for i, stock in enumerate(test_stocks):
            result = await analyzer.analyze_stock(stock)
            if result and result['composite_score'] >= 50:
                if result['trend_slope'] >= -0.05 and result['sector_heat'] >= 30:
                    qualified_stocks.append(result)

            if (i + 1) % 5 == 0:
                print(f"  Analyzed {i+1}/{len(test_stocks)} stocks, found {len(qualified_stocks)} qualified")

        print(f"  Result: In {len(test_stocks)} stocks, found {len(qualified_stocks)} qualified stocks")

        if qualified_stocks:
            print("  Qualified stocks:")
            for i, r in enumerate(qualified_stocks):
                print(f"    {i+1}. {r['stock_code']} - Score: {r['composite_score']:.1f}, Slope: {r['trend_slope']:.4f}%, Heat: {r['sector_heat']:.1f}")
        else:
            print("  No qualified stocks found")

    except Exception as e:
        print(f"  Selection test failed: {e}")

    # 4. Check API endpoints
    print("\n4. Checking API endpoints...")
    import requests
    try:
        # Test health check
        health_url = "http://localhost:8002/api/advanced-selection/advanced/health"
        response = requests.get(health_url, timeout=5)
        print(f"  Health check: {'OK' if response.status_code == 200 else 'FAILED'}")

        # Test strategies list
        strategies_url = "http://localhost:8002/api/advanced-selection/advanced/strategies"
        response = requests.get(strategies_url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  Strategies list: {data.get('count', 0)} strategies")
        else:
            print(f"  Strategies list: Request failed ({response.status_code})")

    except Exception as e:
        print(f"  API check failed: {e}")

    print("\n=== Diagnosis completed ===")

if __name__ == "__main__":
    asyncio.run(diagnose())