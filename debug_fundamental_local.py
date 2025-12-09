import asyncio
import os
import sys
import logging
from datetime import datetime

# 设置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 添加路径
sys.path.insert(0, os.path.abspath("data-service/src"))

# 模拟环境变量
os.environ["TUSHARE_TOKEN"] = "c9613b322d2fcb78c7fd37d8a53559c937970767d658e3233731be32"

try:
    from data_sources.tushare_client import TushareClient
    from analyzers.fundamental.fundamental_client import FundamentalClient
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

async def debug():
    print("Initializing clients...")
    try:
        tushare_client = TushareClient()
        client = FundamentalClient(tushare_client, db_path="data/stock_picker.db")
        
        stock_code = "000001.SZ"
        print(f"Fetching data for {stock_code}...")
        
        data = await client.fetch_comprehensive_fundamental_data(stock_code)
        print("Data fetch complete.")
        
        # Debug income statement
        inc = data.get('income_statement', {})
        if inc:
            print(f"Income Statement Dates: f_end_date={inc.get('f_end_date')}, end_date={inc.get('end_date')}, ann_date={inc.get('ann_date')}")
            
        print(f"Score: {data.get('fundamental_score')}")
        
        # Check for exceptions in data
        for key, value in data.items():
            if value is None:
                print(f"Warning: {key} is None")
        
        print("Saving to DB...")
        success = await client.save_fundamental_data_to_db(stock_code, data)
        print(f"Save success: {success}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(debug())
