import requests
import json
import time

STOCKS = ["000001.SZ", "600519.SH", "300750.SZ", "000002.SZ", "601318.SH"]

def fetch_data(stock_code):
    # 使用正确的端口：8002（数据服务配置端口）
    url = f"http://localhost:8002/api/fundamental/stock/{stock_code}/fetch-and-save"
    print(f"Triggering data fetch for {stock_code}...")
    try:
        # 减少超时时间，避免长时间等待
        response = requests.post(url, timeout=30)
        if response.status_code == 200:
            print(f"Success: {stock_code}")
            result = response.json()
            print(f"  保存状态: {result.get('save_status', 'unknown')}")
            print(f"  数据大小: {len(str(result.get('data', {})))} 字符")
        else:
            print(f"Failed: {stock_code}, Status: {response.status_code}")
            print(f"  错误信息: {response.text[:200]}")
    except requests.exceptions.Timeout:
        print(f"Timeout: {stock_code} - API在30秒内未响应")
    except requests.exceptions.ConnectionError:
        print(f"ConnectionError: {stock_code} - 无法连接到数据服务")
        print(f"  请确保数据服务在端口8002运行")
    except Exception as e:
        print(f"Error fetching {stock_code}: {e}")

if __name__ == "__main__":
    print("Starting fundamental data collection...")
    print("注意：请确保数据服务在端口8002运行")
    print("启动命令: cd data-service && python -m uvicorn src.main:app --reload --port 8002")
    print("-" * 50)

    success_count = 0
    for stock in STOCKS:
        fetch_data(stock)
        time.sleep(2) # 避免API限频，给服务处理时间
        print("-" * 30)

    print(f"\n处理完成: {success_count}/{len(STOCKS)} 成功")
    print("Done.")
