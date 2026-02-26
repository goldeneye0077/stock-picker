"""直接测试 Tushare 数据拉取"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# 加载 data-service 的 .env
env_path = Path(__file__).parent.parent / "data-service" / ".env"
load_dotenv(dotenv_path=env_path)
print(f"TUSHARE_TOKEN: {os.getenv('TUSHARE_TOKEN', 'NOT SET')[:10]}...")

sys.path.insert(0, str(Path(__file__).parent.parent / "data-service"))

import tushare as ts
token = os.getenv("TUSHARE_TOKEN")
ts.set_token(token)
pro = ts.pro_api()

# 1. 测试交易日历
print("\n=== 测试交易日历 ===")
from datetime import datetime, timedelta
end = datetime.now()
start = end - timedelta(days=14)
cal = pro.trade_cal(start_date=start.strftime('%Y%m%d'), end_date=end.strftime('%Y%m%d'))
trading_days = cal[cal['is_open'] == 1]['cal_date'].tolist()
print(f"交易日: {trading_days[-5:]}")

# 2. 测试日线数据
if trading_days:
    latest = trading_days[-1]
    print(f"\n=== 测试日线数据 ({latest}) ===")
    df = pro.daily(trade_date=latest, fields='ts_code,trade_date,open,high,low,close,vol,amount')
    print(f"获得 {len(df)} 条K线数据")
    if not df.empty:
        print(df.head(3))

print("\n=== Tushare 测试完成 ===")
