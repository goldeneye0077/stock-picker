#!/usr/bin/env python3
"""检查策略信息"""

import json
import sys
import requests

def main():
    url = "http://localhost:8002/api/advanced-selection/advanced/strategies"
    response = requests.get(url)

    if response.status_code != 200:
        print(f"请求失败: {response.status_code}")
        print(response.text)
        return

    data = response.json()

    print("高级选股策略列表:")
    print("=" * 80)

    for strategy in data['strategies']:
        print(f"ID: {strategy['id']}")
        print(f"  策略名称: {strategy['strategy_name']}")
        print(f"  描述: {strategy['description']}")
        print(f"  最低评分: {strategy['min_score']}")
        print(f"  要求上升趋势: {strategy['require_uptrend']}")
        print(f"  要求热门板块: {strategy['require_hot_sector']}")
        print(f"  最大结果数: {strategy['max_results']}")
        print(f"  是否激活: {strategy['is_active']}")
        print("-" * 40)

if __name__ == "__main__":
    main()