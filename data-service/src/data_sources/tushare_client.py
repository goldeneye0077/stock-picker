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

from .base import DataSource, DataSourceError, DataFormatError, DataSourceUnavailableError, DataSourceRateLimitError

class TushareClient(DataSource):
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

    async def get_stk_auction(self, trade_date: str, ts_code: Optional[str] = None) -> Optional[pd.DataFrame]:
        """
        获取当日集合竞价成交数据（9:25~9:29）
        Args:
            trade_date: 日期，支持 'YYYYMMDD' 或 'YYYY-MM-DD'
            ts_code: 可选，单只股票代码（如 '000001.SZ'）
        Returns:
            DataFrame，列包含：ts_code, trade_date, vol, price, amount, pre_close, turnover_rate, volume_ratio, float_share
        """
        if not self.pro:
            logger.warning("Tushare Pro client not initialized, cannot fetch stk_auction")
            return None
        try:
            # 统一日期格式为 YYYYMMDD
            s = str(trade_date).strip()
            if len(s) >= 10 and "-" in s:
                dt = datetime.strptime(s[:10], "%Y-%m-%d")
                td = dt.strftime("%Y%m%d")
            elif len(s) == 8 and s.isdigit():
                td = s
            else:
                td = datetime.now().strftime("%Y%m%d")

            kwargs = {
                "trade_date": td,
            }
            if ts_code:
                kwargs["ts_code"] = ts_code

            df = self.pro.stk_auction(
                **kwargs,
                fields="ts_code,trade_date,vol,price,amount,pre_close,turnover_rate,volume_ratio,float_share"
            )
            if df is None or df.empty:
                logger.info(f"No stk_auction data for {td} (ts_code={ts_code or 'ALL'})")
                return None

            # 规范列名与类型
            df["trade_date"] = pd.to_datetime(df["trade_date"])
            for col in ["vol", "price", "amount", "pre_close", "turnover_rate", "volume_ratio", "float_share"]:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")
            logger.info(f"Retrieved {len(df)} stk_auction records for {td}")
            return df
        except Exception as e:
            logger.error(f"Error fetching stk_auction: {e}")
            return None

    async def get_daily_data_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        批量获取指定日期所有股票的日线数据

        Args:
            trade_date: 交易日期，格式 YYYYMMDD，例如 '20250930'

        Returns:
            包含所有股票日线数据的 DataFrame，失败返回 None
        """
        if not self.pro:
            return None

        try:
            df = self.pro.daily(
                trade_date=trade_date,
                fields='ts_code,trade_date,open,high,low,close,vol,amount'
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                logger.info(f"Retrieved {len(df)} daily records for date {trade_date}")
            else:
                logger.warning(f"No data for date {trade_date} (possibly non-trading day)")

            return df
        except Exception as e:
            logger.error(f"Error fetching daily data for date {trade_date}: {e}")
            return None

    async def get_moneyflow_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        批量获取指定日期所有股票的资金流向数据

        Args:
            trade_date: 交易日期，格式 YYYYMMDD，例如 '20250930'

        Returns:
            包含所有股票资金流向数据的 DataFrame，失败返回 None
        """
        if not self.pro:
            return None

        try:
            df = self.pro.moneyflow(
                trade_date=trade_date,
                fields='ts_code,trade_date,buy_sm_amount,sell_sm_amount,buy_md_amount,sell_md_amount,buy_lg_amount,sell_lg_amount,buy_elg_amount,sell_elg_amount'
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])

                # 计算净流入
                df['small_net_flow'] = df['buy_sm_amount'] - df['sell_sm_amount']
                df['medium_net_flow'] = df['buy_md_amount'] - df['sell_md_amount']
                df['large_net_flow'] = df['buy_lg_amount'] - df['sell_lg_amount']
                df['extra_large_net_flow'] = df['buy_elg_amount'] - df['sell_elg_amount']

                # 主力资金 = 大单 + 特大单
                df['main_fund_flow'] = df['large_net_flow'] + df['extra_large_net_flow']
                # 散户资金 = 小单 + 中单
                df['retail_fund_flow'] = df['small_net_flow'] + df['medium_net_flow']

                logger.info(f"Retrieved {len(df)} moneyflow records for date {trade_date}")
            else:
                logger.warning(f"No moneyflow data for date {trade_date}")

            return df
        except Exception as e:
            logger.error(f"Error fetching moneyflow for date {trade_date}: {e}")
            return None

    async def get_trade_cal(self, start_date: str, end_date: str, exchange: str = 'SSE') -> Optional[pd.DataFrame]:
        """
        获取交易日历，用于判断哪些日期是交易日

        Args:
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD
            exchange: 交易所代码，SSE-上交所, SZSE-深交所

        Returns:
            交易日历 DataFrame
        """
        if not self.pro:
            return None

        try:
            df = self.pro.trade_cal(
                exchange=exchange,
                start_date=start_date,
                end_date=end_date,
                fields='cal_date,is_open'
            )

            if not df.empty:
                df['cal_date'] = pd.to_datetime(df['cal_date'])
                logger.debug(f"Retrieved trade calendar from {start_date} to {end_date}")

            return df
        except Exception as e:
            logger.error(f"Error fetching trade calendar: {e}")
            return None

    async def get_market_moneyflow(self, start_date: str = None, end_date: str = None, trade_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取大盘资金流向数据（东财市场资金流向）

        Args:
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD
            trade_date: 交易日期 YYYYMMDD（与日期范围二选一）

        Returns:
            大盘资金流向 DataFrame，包含以下字段：
            - trade_date: 交易日期
            - close_sh: 上证指数收盘点位
            - pct_change_sh: 上证指数涨跌幅
            - close_sz: 深证指数收盘点位
            - pct_change_sz: 深证指数涨跌幅
            - net_amount: 主力资金净流入金额（元）
            - net_amount_rate: 主力资金净流入占比（%）
            - buy_elg_amount: 超大单净流入金额（元）
            - buy_elg_amount_rate: 超大单净流入占比（%）
            - buy_lg_amount: 大单净流入金额（元）
            - buy_lg_amount_rate: 大单净流入占比（%）
            - buy_md_amount: 中单净流入金额（元）
            - buy_md_amount_rate: 中单净流入占比（%）
            - buy_sm_amount: 小单净流入金额（元）
            - buy_sm_amount_rate: 小单净流入占比（%）
        """
        if not self.pro:
            return None

        try:
            params = {}
            if trade_date:
                params['trade_date'] = trade_date
            elif start_date and end_date:
                params['start_date'] = start_date
                params['end_date'] = end_date
            else:
                logger.warning("Either trade_date or start_date/end_date must be provided")
                return None

            df = self.pro.moneyflow_mkt_dc(**params)

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                logger.info(f"Retrieved {len(df)} market moneyflow records")
            else:
                logger.warning(f"No market moneyflow data available")

            return df
        except Exception as e:
            logger.error(f"Error fetching market moneyflow: {e}")
            return None

    async def get_sector_moneyflow(self, trade_date: str = None, start_date: str = None, end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取板块资金流向数据（东财概念及行业板块资金流向）

        Args:
            trade_date: 交易日期，格式 YYYYMMDD
            start_date: 开始日期，格式 YYYYMMDD
            end_date: 结束日期，格式 YYYYMMDD

        Returns:
            板块资金流向 DataFrame，包含以下字段：
            - trade_date: 交易日期
            - ts_code: 板块代码
            - name: 板块名称
            - pct_change: 板块涨跌幅（%）
            - close: 板块指数
            - net_amount: 主力净流入额（元）
            - net_amount_rate: 主力净流入占比（%）
            - buy_elg_amount: 超大单净流入额（元）
            - buy_elg_amount_rate: 超大单净流入占比（%）
            - buy_lg_amount: 大单净流入额（元）
            - buy_lg_amount_rate: 大单净流入占比（%）
            - buy_md_amount: 中单净流入额（元）
            - buy_md_amount_rate: 中单净流入占比（%）
            - buy_sm_amount: 小单净流入额（元）
            - buy_sm_amount_rate: 小单净流入占比（%）
            - rank: 排名
        """
        if not self.pro:
            return None

        try:
            params = {}
            if trade_date:
                params['trade_date'] = trade_date
            elif start_date and end_date:
                params['start_date'] = start_date
                params['end_date'] = end_date
            else:
                logger.warning("Either trade_date or start_date/end_date must be provided")
                return None

            df = self.pro.moneyflow_ind_dc(**params)

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                logger.info(f"Retrieved {len(df)} sector moneyflow records")
            else:
                logger.warning(f"No sector moneyflow data available")

            return df
        except Exception as e:
            logger.error(f"Error fetching sector moneyflow: {e}")
            return None

    async def get_realtime_quotes(self, ts_codes: List[str] = None) -> Optional[pd.DataFrame]:
        if not TUSHARE_AVAILABLE or ts is None:
            logger.warning("Tushare module not available, cannot fetch realtime quotes")
            return None

        try:
            if ts_codes and len(ts_codes) > 0:
                codes: List[str] = ts_codes
            else:
                if not self.pro:
                    logger.warning("Tushare Pro client not initialized, cannot fetch stock list for realtime quotes")
                    return None
                stock_basic = await self.get_stock_basic()
                if stock_basic is None or stock_basic.empty:
                    logger.warning("No stock basic data available for realtime quotes")
                    return None
                codes = [str(c) for c in stock_basic["ts_code"].tolist() if c]

            chunks: List[List[str]] = []
            chunk_size = 50
            for i in range(0, len(codes), chunk_size):
                chunk = codes[i:i + chunk_size]
                if chunk:
                    chunks.append(chunk)

            frames: List[pd.DataFrame] = []
            for chunk in chunks:
                joined_codes = ",".join(chunk)
                df_chunk = ts.realtime_quote(ts_code=joined_codes)
                if df_chunk is not None and not df_chunk.empty:
                    df_chunk.columns = [str(c).lower() for c in df_chunk.columns]
                    frames.append(df_chunk)

            if not frames:
                logger.warning("No realtime data returned from realtime_quote")
                return None

            df = pd.concat(frames, ignore_index=True)

            if "ts_code" not in df.columns:
                logger.warning("realtime_quote result missing ts_code column")
                return None

            if "price" in df.columns:
                df["close"] = df["price"]

            if "volume" in df.columns and "vol" not in df.columns:
                df["vol"] = df["volume"]

            if "a1_v" in df.columns and "ask_volume1" not in df.columns:
                df["ask_volume1"] = df["a1_v"]

            if "b1_v" in df.columns and "bid_volume1" not in df.columns:
                df["bid_volume1"] = df["b1_v"]

            if "pre_close" in df.columns and "close" in df.columns:
                pre_close = df["pre_close"].astype(float)
                close = df["close"].astype(float)
                df["change_amount"] = close - pre_close
                non_zero = pre_close != 0
                df["change_percent"] = 0.0
                df.loc[non_zero, "change_percent"] = (df.loc[non_zero, "change_amount"] / pre_close[non_zero]) * 100.0

            logger.info(f"Retrieved realtime quotes for {len(df)} records using realtime_quote")
            return df
        except Exception as e:
            logger.error(f"Error fetching realtime quotes via realtime_quote: {e}")
            return None

    async def get_stock_realtime(self, ts_code: str) -> Optional[Dict]:
        """
        获取单只股票的实时行情

        Args:
            ts_code: 股票代码，例如 '000001.SZ'

        Returns:
            实时行情字典
        """
        if not self.pro:
            return None

        try:
            df = await self.get_realtime_quotes([ts_code])

            if df is not None and not df.empty:
                return df.iloc[0].to_dict()

            return None
        except Exception as e:
            logger.error(f"Error fetching realtime data for {ts_code}: {e}")
            return None

    async def get_moneyflow_dc(self, ts_code: str = None, trade_date: str = None,
                                start_date: str = None, end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取个股资金流向数据（DC接口，需要5000积分）
        数据来源：东方财富，每日盘后更新

        Args:
            ts_code: 股票代码，例如 '000001.SZ'
            trade_date: 交易日期 YYYYMMDD
            start_date: 开始日期 YYYYMMDD
            end_date: 结束日期 YYYYMMDD

        Returns:
            资金流向 DataFrame，包含以下字段：
            - trade_date: 交易日期
            - ts_code: 股票代码
            - name: 股票名称
            - pct_change: 涨跌幅
            - close: 收盘价
            - net_mf_amount: 主力净流入额（万元）
            - net_mf_rate: 主力净流入占比
            - net_mf_vol: 主力净流入量（手）
            - buy_elg_amount: 超大单买入额（万元）
            - sell_elg_amount: 超大单卖出额（万元）
            - net_elg_amount: 超大单净流入额（万元）
            - net_elg_rate: 超大单净流入占比
            - buy_lg_amount: 大单买入额（万元）
            - sell_lg_amount: 大单卖出额（万元）
            - net_lg_amount: 大单净流入额（万元）
            - net_lg_rate: 大单净流入占比
            - buy_md_amount: 中单买入额（万元）
            - sell_md_amount: 中单卖出额（万元）
            - net_md_amount: 中单净流入额（万元）
            - net_md_rate: 中单净流入占比
            - buy_sm_amount: 小单买入额（万元）
            - sell_sm_amount: 小单卖出额（万元）
            - net_sm_amount: 小单净流入额（万元）
            - net_sm_rate: 小单净流入占比
        """
        if not self.pro:
            return None

        try:
            # 如果没有指定日期范围，默认获取最近30天的数据
            if not start_date and not end_date and not trade_date:
                end_date = datetime.now().strftime('%Y%m%d')
                start_date = (datetime.now() - timedelta(days=30)).strftime('%Y%m%d')

            df = self.pro.moneyflow_dc(
                ts_code=ts_code,
                trade_date=trade_date,
                start_date=start_date,
                end_date=end_date
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                df = df.sort_values('trade_date')
                logger.info(f"Retrieved {len(df)} DC moneyflow records")
            else:
                logger.warning(f"No DC moneyflow data found")

            return df
        except Exception as e:
            logger.error(f"Error fetching DC moneyflow data: {e}")
            return None

    async def get_moneyflow_dc_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        批量获取指定日期所有股票的资金流向数据（DC接口）

        Args:
            trade_date: 交易日期，格式 YYYYMMDD，例如 '20250930'

        Returns:
            包含所有股票资金流向数据的 DataFrame，失败返回 None
        """
        if not self.pro:
            return None

        try:
            df = self.pro.moneyflow_dc(trade_date=trade_date)

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                logger.info(f"Retrieved {len(df)} DC moneyflow records for date {trade_date}")
            else:
                logger.warning(f"No DC moneyflow data for date {trade_date}")

            return df
        except Exception as e:
            logger.error(f"Error fetching DC moneyflow for date {trade_date}: {e}")
            return None

    async def get_daily_basic_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        批量获取指定日期所有股票的每日技术指标数据

        数据来源：Tushare daily_basic 接口

        Args:
            trade_date: 交易日期，格式 YYYYMMDD

        Returns:
            DataFrame 或 None
        """
        if not self.pro:
            logger.warning("Tushare Pro client not initialized")
            return None

        try:
            df = self.pro.daily_basic(
                trade_date=trade_date,
                fields=(
                    "ts_code,trade_date,close,"
                    "turnover_rate,turnover_rate_f,volume_ratio,"
                    "pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,"
                    "total_share,float_share,free_share,total_mv,circ_mv"
                ),
            )

            if df is None or df.empty:
                logger.warning(f"No daily_basic data for date {trade_date}")
                return None

            if "trade_date" in df.columns:
                df["trade_date"] = pd.to_datetime(df["trade_date"])

            if "close" not in df.columns:
                df["close"] = None

            numeric_cols = [
                "close",
                "turnover_rate",
                "turnover_rate_f",
                "volume_ratio",
                "pe",
                "pe_ttm",
                "pb",
                "ps",
                "ps_ttm",
                "dv_ratio",
                "total_share",
                "float_share",
                "free_share",
                "total_mv",
                "circ_mv",
            ]
            for col in numeric_cols:
                if col in df.columns:
                    df[col] = pd.to_numeric(df[col], errors="coerce")

            logger.info(f"Retrieved {len(df)} daily_basic records for date {trade_date}")
            return df
        except Exception as e:
            logger.error(f"Error fetching daily_basic for date {trade_date}: {e}")
            return None

    async def get_kpl_concept(self, trade_date: str) -> Optional[pd.DataFrame]:
        if not self.pro:
            return None

        try:
            s = str(trade_date).strip()
            if len(s) >= 10 and "-" in s:
                dt = datetime.strptime(s[:10], "%Y-%m-%d")
                td = dt.strftime("%Y%m%d")
            elif len(s) == 8 and s.isdigit():
                td = s
            else:
                td = datetime.now().strftime("%Y%m%d")

            df = self.pro.kpl_concept(
                trade_date=td,
                fields="trade_date,ts_code,name,z_t_num,up_num",
            )

            if df is None or df.empty:
                logger.warning(f"No kpl_concept data for date {td}")
                return None

            if "trade_date" in df.columns:
                df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce")
            if "z_t_num" in df.columns:
                df["z_t_num"] = pd.to_numeric(df["z_t_num"], errors="coerce")

            logger.info(f"Retrieved {len(df)} kpl_concept records for date {td}")
            return df
        except Exception as e:
            logger.error(f"Error fetching kpl_concept for date {trade_date}: {e}")
            return None

    async def get_kpl_concept_cons(self, trade_date: str, ts_code: Optional[str] = None) -> Optional[pd.DataFrame]:
        if not self.pro:
            return None

        try:
            s = str(trade_date).strip()
            if len(s) >= 10 and "-" in s:
                dt = datetime.strptime(s[:10], "%Y-%m-%d")
                td = dt.strftime("%Y%m%d")
            elif len(s) == 8 and s.isdigit():
                td = s
            else:
                td = datetime.now().strftime("%Y%m%d")

            params: Dict[str, str] = {"trade_date": td}
            if ts_code:
                params["ts_code"] = ts_code

            df = self.pro.kpl_concept_cons(
                **params,
                fields="trade_date,ts_code,name,con_code,con_name,desc,hot_num",
            )

            if df is None or df.empty:
                logger.warning(f"No kpl_concept_cons data for date {td}")
                return None

            if "trade_date" in df.columns:
                df["trade_date"] = pd.to_datetime(df["trade_date"], errors="coerce")
            if "hot_num" in df.columns:
                df["hot_num"] = pd.to_numeric(df["hot_num"], errors="coerce")

            logger.info(f"Retrieved {len(df)} kpl_concept_cons records for date {td}")
            return df
        except Exception as e:
            logger.error(f"Error fetching kpl_concept_cons for date {trade_date}: {e}")
            return None

    def is_available(self) -> bool:
        """
        检查数据源是否可用

        Returns:
            True如果数据源可用，False否则
        """
        return self.pro is not None and TUSHARE_AVAILABLE and self.token is not None

    def get_source_name(self) -> str:
        """
        获取数据源名称

        Returns:
            数据源名称
        """
        return "tushare"
