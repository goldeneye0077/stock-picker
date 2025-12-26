#!/usr/bin/env python3
"""
更新数据到最新交易日
"""

import sqlite3
from datetime import datetime, timedelta
import subprocess
import sys

def get_latest_trading_day():
    """获取最新交易日"""
    print("=== 获取最新交易日 ===")

    # 从数据库中找到最新的数据日期
    db_path = "data/stock_picker.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 获取K线数据最新日期
    cursor.execute("SELECT MAX(date) FROM klines")
    latest_date = cursor.fetchone()[0]
    print(f"数据库最新数据日期: {latest_date}")

    # 获取今日日期
    today = datetime.now().strftime("%Y-%m-%d")
    print(f"今日日期: {today}")

    # 如果最新日期不是今天，尝试更新到最近的工作日
    if latest_date != today:
        print(f"数据未更新到今日，尝试更新到最近工作日...")

        # 从今天往前找，直到找到有数据的工作日
        current_date = datetime.now()
        for i in range(10):  # 最多往前找10天
            check_date = (current_date - timedelta(days=i)).strftime("%Y-%m-%d")
            cursor.execute("SELECT COUNT(*) FROM klines WHERE date = ?", (check_date,))
            count = cursor.fetchone()[0]

            if count > 1000:  # 如果有足够的数据，认为是交易日
                print(f"找到最近交易日: {check_date} (有{count}条记录)")
                conn.close()
                return check_date.replace("-", "")

    conn.close()
    return latest_date.replace("-", "")

def update_data(target_date):
    """更新数据到指定日期"""
    print(f"\n=== 更新数据到 {target_date} ===")

    # 运行更新脚本
    try:
        # 使用subprocess运行更新脚本
        cmd = [sys.executable, "update_today_kline.py"]
        env = {**dict(os.environ), "TARGET_DATE": target_date}

        result = subprocess.run(cmd, capture_output=True, text=True, env=env)

        print("更新脚本输出:")
        print(result.stdout)
        if result.stderr:
            print("错误输出:")
            print(result.stderr)

        return result.returncode == 0
    except Exception as e:
        print(f"运行更新脚本失败: {e}")
        return False

def check_update_result():
    """检查更新结果"""
    print("\n=== 检查更新结果 ===")

    db_path = "data/stock_picker.db"
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # 检查更新后的最新日期
    cursor.execute("SELECT MAX(date) FROM klines")
    new_latest_date = cursor.fetchone()[0]

    # 检查数据量
    cursor.execute("SELECT COUNT(*) FROM klines WHERE date = ?", (new_latest_date,))
    count = cursor.fetchone()[0]

    print(f"更新后最新日期: {new_latest_date}")
    print(f"该日期数据量: {count} 条记录")

    # 检查数据完整性
    cursor.execute("SELECT COUNT(DISTINCT stock_code) FROM klines WHERE date = ?", (new_latest_date,))
    stock_count = cursor.fetchone()[0]
    print(f"该日期股票数量: {stock_count} 只")

    conn.close()

    if count > 1000 and stock_count > 1000:
        print("✅ 数据更新成功")
        return True
    else:
        print("❌ 数据更新可能不完整")
        return False

if __name__ == "__main__":
    import os

    # 获取最新交易日
    latest_trading_day = get_latest_trading_day()
    print(f"\n目标更新日期: {latest_trading_day}")

    # 更新数据
    if update_data(latest_trading_day):
        print("\n✅ 数据更新完成")
    else:
        print("\n❌ 数据更新失败")

    # 检查更新结果
    check_update_result()