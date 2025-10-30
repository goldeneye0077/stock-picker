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
        """
        获取实时行情数据

        Args:
            ts_codes: 股票代码列表，例如 ['000001.SZ', '600000.SH']
                     如果为 None，则获取所有股票

        Returns:
            实时行情 DataFrame，包含以下字段：
            - ts_code: 股票代码
            - name: 股票名称
            - pre_close: 昨收价
            - open: 开盘价
            - high: 最高价
            - low: 最低价
            - close: 最新价
            - vol: 成交量（股）
            - amount: 成交额（元）
            - num: 成交笔数
            - ask_volume1: 委托卖盘
            - bid_volume1: 委托买盘
        """
        if not self.pro:
            return None

        try:
            # Tushare 的实时行情接口
            # 注意：实际使用时可能需要不同的接口，这里以 daily 接口示例
            # 如果有专门的实时接口，请替换为相应的接口

            # 方案1：使用 pro_bar 获取最新数据
            # 方案2：使用 query 接口获取实时数据

            # 这里使用最新的日线数据模拟实时行情
            # 实际项目中应使用 Tushare 的实时行情接口

            # 尝试获取今天的数据，如果没有则使用最近的交易日
            today = datetime.now()
            df = None

            for i in range(5):  # 尝试最近5天
                check_date = (today - timedelta(days=i)).strftime('%Y%m%d')
                df = self.pro.daily(
                    trade_date=check_date,
                    fields='ts_code,open,high,low,close,pre_close,vol,amount'
                )

                if df is not None and not df.empty:
                    logger.info(f"Using trade date {check_date} for realtime quotes")
                    break

            if df is not None and not df.empty:
                # 计算涨跌幅和涨跌额
                df['change_percent'] = ((df['close'] - df['pre_close']) / df['pre_close'] * 100)
                df['change_amount'] = df['close'] - df['pre_close']

                # 添加模拟字段（实际应从实时接口获取）
                df['num'] = 0  # 成交笔数
                df['ask_volume1'] = 0  # 委托卖盘
                df['bid_volume1'] = 0  # 委托买盘

                logger.info(f"Retrieved realtime quotes for {len(df)} stocks")
            else:
                logger.warning(f"No realtime data available in the last 5 days")

            return df
        except Exception as e:
            logger.error(f"Error fetching realtime quotes: {e}")
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
        批量获取指定日期所有股票的每日指标数据

        每日指标包含：
        - 换手率 (turnover_rate, turnover_rate_f)
        - 量比 (volume_ratio)
        - 市盈率 (pe, pe_ttm)
        - 市净率 (pb)
        - 市销率 (ps, ps_ttm)
        - 市现率 (dv_ratio, dv_ttm)
        - 总市值/流通市值 (total_mv, circ_mv)

        Args:
            trade_date: 交易日期，格式 YYYYMMDD

        Returns:
            DataFrame 或 None
        """
        if not self.pro:
            logger.warning("Tushare Pro client not initialized")
            return None

        try:
            # 调用 daily_basic 接口
            df = self.pro.daily_basic(
                trade_date=trade_date,
                fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,'
                       'pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,total_share,float_share,'
                       'free_share,total_mv,circ_mv'
            )

            if not df.empty:
                df['trade_date'] = pd.to_datetime(df['trade_date'])
                logger.info(f"Retrieved {len(df)} daily_basic records for date {trade_date}")
            else:
                logger.warning(f"No daily_basic data for date {trade_date}")

            return df
        except Exception as e:
            logger.error(f"Error fetching daily_basic for date {trade_date}: {e}")
            return None