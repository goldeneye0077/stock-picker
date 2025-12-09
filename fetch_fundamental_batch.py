#!/usr/bin/env python3
"""
批量获取基本面数据 - 优化版本
使用批量API，提高效率
"""
import requests
import json
import time

STOCKS = ["000001.SZ", "600519.SH", "300750.SZ", "000002.SZ", "601318.SH"]

def fetch_batch_data(stock_codes):
    """批量获取基本面数据"""
    url = "http://localhost:8002/api/fundamental/batch/fetch-and-save"
    print(f"批量获取 {len(stock_codes)} 只股票的基本面数据...")

    try:
        response = requests.post(url, json=stock_codes, timeout=60)

        if response.status_code == 200:
            result = response.json()
            print(f"批量处理完成")
            print(f"  总股票数: {result.get('total_stocks', 0)}")
            print(f"  成功数: {result.get('success_count', 0)}")
            print(f"  失败数: {result.get('failed_count', 0)}")

            # 显示详细结果
            results = result.get('results', {})
            for stock_code, stock_result in results.items():
                status = stock_result.get('save_status', 'unknown')
                if status == 'success':
                    print(f"  ✓ {stock_code}: 成功")
                else:
                    error = stock_result.get('error', '未知错误')
                    print(f"  ✗ {stock_code}: 失败 - {error[:100]}")

            return result
        else:
            print(f"批量请求失败，状态码: {response.status_code}")
            print(f"错误信息: {response.text[:500]}")
            return None

    except requests.exceptions.Timeout:
        print(f"批量请求超时（60秒）")
        return None
    except requests.exceptions.ConnectionError:
        print(f"无法连接到数据服务（端口8002）")
        print("请确保数据服务已启动: cd data-service && python -m uvicorn src.main:app --reload --port 8002")
        return None
    except Exception as e:
        print(f"批量请求错误: {e}")
        return None

def fetch_single_with_retry(stock_code, max_retries=2):
    """带重试的单只股票获取"""
    url = f"http://localhost:8002/api/fundamental/stock/{stock_code}/fetch-and-save"

    for attempt in range(max_retries):
        print(f"尝试 {attempt+1}/{max_retries}: {stock_code}")
        try:
            response = requests.post(url, timeout=30)
            if response.status_code == 200:
                result = response.json()
                print(f"  ✓ 成功: {stock_code}")
                print(f"    保存状态: {result.get('save_status', 'unknown')}")
                return True
            else:
                print(f"  ✗ 失败: 状态码 {response.status_code}")
                print(f"    错误: {response.text[:200]}")

        except requests.exceptions.Timeout:
            print(f"  ⏱️ 超时")
        except Exception as e:
            print(f"  ✗ 错误: {e}")

        if attempt < max_retries - 1:
            print(f"  等待3秒后重试...")
            time.sleep(3)

    return False

if __name__ == "__main__":
    print("基本面数据批量采集")
    print("=" * 50)

    # 先尝试批量API
    print("\n1. 尝试批量API:")
    batch_result = fetch_batch_data(STOCKS)

    if batch_result and batch_result.get('success_count', 0) == len(STOCKS):
        print("\n✓ 所有股票批量处理成功")
    else:
        print("\n2. 回退到单只处理:")
        success_count = 0
        for stock in STOCKS:
            if fetch_single_with_retry(stock):
                success_count += 1
            print("-" * 40)
            time.sleep(1)  # 避免API限频

        print(f"\n处理结果: {success_count}/{len(STOCKS)} 成功")

    print("\n" + "=" * 50)
    print("采集完成")