try:
    import tushare as ts
    TUSHARE_AVAILABLE = True
except ImportError:
    TUSHARE_AVAILABLE = False
    ts = None
import pandas as pd
from typing import Optional, List, Dict
from loguru import logger
import os
from datetime import datetime, timedelta

class TushareClient:
    def __init__(self):
        self.token = os.getenv("TUSHARE_TOKEN")
        if not TUSHARE_AVAILABLE:
            logger.warning("Tushare module not available. Install with: pip install tushare")
            self.pro = None
        elif self.token:
            ts.set_token(self.token)
            self.pro = ts.pro_api()
            logger.info("Tushare client initialized successfully")
        else:
            logger.warning("Tushare token not found. Please set TUSHARE_TOKEN environment variable")
            self.pro = None

    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """Get basic stock information"""
        if not self.pro:
            return None

        try:
            df = self.pro.stock_basic(
                exchange='',
                list_status='L',
                fields='ts_code,symbol,name,area,industry,market,exchange,list_date'
            )
            logger.info(f"Retrieved {len(df)} stocks from Tushare")
            return df
        except Exception as e:
            logger.error(f"Error fetching stock basic data: {e}")
            return None

    async def get_daily_data(self, ts_code: str, start_date: str = None, end_date: str = None) -> Optional[pd.DataFrame]:
        """Get daily K-line data for a stock"""
        if not self.pro:
            return None

        try:
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365)).strftime('%Y%m%d')
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')

            df = self.pro.daily(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date,
                fields='ts_code,trade_date,open,high,low,close,vol,amount'
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                df = df.sort_values('trade_date')
                logger.debug(f"Retrieved {len(df)} daily records for {ts_code}")

            return df
        except Exception as e:
            logger.error(f"Error fetching daily data for {ts_code}: {e}")
            return None

    async def get_money_flow(self, ts_code: str, start_date: str = None, end_date: str = None) -> Optional[pd.DataFrame]:
        """Get money flow data for a stock"""
        if not self.pro:
            return None

        try:
            if not start_date:
                start_date = (datetime.now() - timedelta(days=30)).strftime('%Y%m%d')
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')

            df = self.pro.moneyflow(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date,
                fields='ts_code,trade_date,buy_sm_amount,sell_sm_amount,buy_md_amount,sell_md_amount,buy_lg_amount,sell_lg_amount,buy_elg_amount,sell_elg_amount'
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                df = df.sort_values('trade_date')

                # Calculate net flows
                df['small_net_flow'] = df['buy_sm_amount'] - df['sell_sm_amount']
                df['medium_net_flow'] = df['buy_md_amount'] - df['sell_md_amount']
                df['large_net_flow'] = df['buy_lg_amount'] - df['sell_lg_amount']
                df['extra_large_net_flow'] = df['buy_elg_amount'] - df['sell_elg_amount']

                # Main fund = large + extra large
                df['main_fund_flow'] = df['large_net_flow'] + df['extra_large_net_flow']
                # Retail fund = small + medium
                df['retail_fund_flow'] = df['small_net_flow'] + df['medium_net_flow']

                logger.debug(f"Retrieved {len(df)} money flow records for {ts_code}")

            return df
        except Exception as e:
            logger.error(f"Error fetching money flow for {ts_code}: {e}")
            return None

    async def get_top_list(self, trade_date: str = None) -> Optional[pd.DataFrame]:
        """Get top active stocks"""
        if not self.pro:
            return None

        try:
            if not trade_date:
                trade_date = datetime.now().strftime('%Y%m%d')

            df = self.pro.top_list(
                trade_date=trade_date,
                fields='ts_code,name,close,pct_chg,turnover_rate,volume_ratio,pe,total_mv'
            )

            if not df.empty:
                logger.debug(f"Retrieved {len(df)} top stocks for {trade_date}")

            return df
        except Exception as e:
            logger.error(f"Error fetching top list: {e}")
            return None

    def is_available(self) -> bool:
        """Check if Tushare client is available"""
        return self.pro is not None