#!/usr/bin/env python3
"""
AKShare数据源客户端
备用数据源：免费、开源的中国金融市场数据接口
"""

try:
    import akshare as ak
    AKSHARE_AVAILABLE = True
except ImportError:
    AKSHARE_AVAILABLE = False
    ak = None

import pandas as pd
import numpy as np
from typing import Optional, List, Dict, Any
from loguru import logger
import asyncio
from datetime import datetime, timedelta

from .base import DataSource, DataSourceError, DataFormatError, DataSourceUnavailableError


class AKShareClient(DataSource):
    """AKShare数据源客户端"""

    def __init__(self):
        self.available = AKSHARE_AVAILABLE
        if not self.available:
            logger.warning("AKShare module not available. Install with: pip install akshare")
        else:
            logger.info("AKShare client initialized successfully")

    async def get_realtime_quotes(self, ts_codes: Optional[List[str]] = None) -> Optional[pd.DataFrame]:
        if not self.available or ak is None:
            return None

        try:
            df = ak.stock_zh_a_spot_em()
            if df is None or df.empty:
                logger.warning("AKShare返回空实时行情数据")
                return None

            df = df.copy()
            df["代码"] = df["代码"].astype(str).str.strip()

            if ts_codes:
                code_set = set()
                for ts_code in ts_codes:
                    if not ts_code:
                        continue
                    parts = str(ts_code).split(".")
                    if parts and parts[0]:
                        code_set.add(parts[0])
                if code_set:
                    df = df[df["代码"].isin(code_set)]
                    if df.empty:
                        logger.warning("AKShare未匹配到指定股票的实时行情数据")
                        return None

            rows: list[dict[str, Any]] = []

            for _, row in df.iterrows():
                code = str(row.get("代码", "")).strip()
                if len(code) != 6:
                    continue

                if code.startswith("6"):
                    exchange = "SH"
                elif code.startswith("0") or code.startswith("3"):
                    exchange = "SZ"
                else:
                    continue

                ts_code = f"{code}.{exchange}"

                try:
                    latest = float(row.get("最新价", 0) or 0)
                    high = float(row.get("最高", 0) or 0)
                    low = float(row.get("最低", 0) or 0)
                    open_price = float(row.get("今开", 0) or 0)
                    pre_close = float(row.get("昨收", 0) or 0)
                    vol = float(row.get("成交量", 0) or 0)
                    amount_raw = float(row.get("成交额", 0) or 0)
                    amount = amount_raw * 10000.0
                    change_amount = float(row.get("涨跌额", 0) or 0)
                    change_percent = float(row.get("涨跌幅", 0) or 0)
                except Exception as e:
                    logger.debug(f"AKShare解析实时行情数据失败 {code}: {e}")
                    continue

                rows.append(
                    {
                        "ts_code": ts_code,
                        "name": str(row.get("名称", "")),
                        "pre_close": pre_close,
                        "open": open_price,
                        "high": high,
                        "low": low,
                        "close": latest,
                        "vol": vol,
                        "amount": amount,
                        "num": 0,
                        "ask_volume1": 0,
                        "bid_volume1": 0,
                        "change_percent": change_percent,
                        "change_amount": change_amount,
                    }
                )

            if not rows:
                logger.warning("AKShare未解析到有效的实时行情数据")
                return None

            result_df = pd.DataFrame(rows)
            logger.info(f"从AKShare获取 {len(result_df)} 条实时行情数据")
            return result_df
        except Exception as e:
            logger.error(f"AKShare获取实时行情数据失败: {e}")
            return None

    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """
        获取股票基本信息

        Returns:
            DataFrame包含股票基本信息
        """
        if not self.available:
            return None

        try:
            # AKShare获取A股股票列表
            df = ak.stock_info_a_code_name()

            if df is None or df.empty:
                logger.warning("AKShare返回空股票列表")
                return None

            # 转换为标准格式
            result_df = pd.DataFrame()

            # 解析代码和交易所
            codes = []
            exchanges = []
            names = []

            for _, row in df.iterrows():
                code = str(row['code']).strip()
                name = str(row['name']).strip()

                if len(code) == 6:
                    # 判断交易所
                    if code.startswith('6'):
                        exchange = 'SH'
                        ts_code = f"{code}.SH"
                    elif code.startswith('0') or code.startswith('3'):
                        exchange = 'SZ'
                        ts_code = f"{code}.SZ"
                    else:
                        # 跳过其他代码（如8开头的北交所）
                        continue

                    codes.append(code)
                    exchanges.append(exchange)
                    names.append(name)

            if not codes:
                logger.warning("未找到有效的A股股票代码")
                return None

            result_df['ts_code'] = [f"{code}.{ex}" for code, ex in zip(codes, exchanges)]
            result_df['symbol'] = codes
            result_df['name'] = names
            result_df['exchange'] = exchanges
            result_df['market'] = '主板'  # AKShare不提供市场信息
            result_df['list_date'] = ''  # AKShare不提供上市日期
            result_df['area'] = ''  # AKShare不提供地区信息
            result_df['industry'] = ''  # AKShare不提供行业信息

            logger.info(f"从AKShare获取 {len(result_df)} 只股票基本信息")
            return result_df

        except Exception as e:
            logger.error(f"AKShare获取股票基本信息失败: {e}")
            return None

    async def get_daily_data(self, ts_code: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
        """
        获取日线数据

        Args:
            ts_code: 股票代码 (如 '000001.SZ')
            start_date: 开始日期 (格式 'YYYYMMDD')
            end_date: 结束日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含日线数据
        """
        if not self.available:
            return None

        try:
            # 解析股票代码
            code, exchange = ts_code.split('.')

            # 转换日期格式
            start_date_fmt = f"{start_date[:4]}-{start_date[4:6]}-{start_date[6:8]}"
            end_date_fmt = f"{end_date[:4]}-{end_date[4:6]}-{end_date[6:8]}"

            if exchange == 'SZ':
                # 深交所股票
                df = ak.stock_zh_a_hist(
                    symbol=code,
                    period="daily",
                    start_date=start_date_fmt,
                    end_date=end_date_fmt,
                    adjust="qfq"  # 前复权
                )
            elif exchange == 'SH':
                # 上交所股票
                df = ak.stock_zh_a_hist(
                    symbol=code,
                    period="daily",
                    start_date=start_date_fmt,
                    end_date=end_date_fmt,
                    adjust="qfq"
                )
            else:
                logger.warning(f"不支持的交易所: {exchange}")
                return None

            if df is None or df.empty:
                logger.warning(f"AKShare返回空日线数据: {ts_code}")
                return None

            # 转换为标准格式
            result_df = pd.DataFrame()
            result_df['ts_code'] = ts_code
            result_df['trade_date'] = pd.to_datetime(df['日期'])
            result_df['open'] = df['开盘'].astype(float)
            result_df['high'] = df['最高'].astype(float)
            result_df['low'] = df['最低'].astype(float)
            result_df['close'] = df['收盘'].astype(float)
            result_df['pre_close'] = df['前收盘'].astype(float) if '前收盘' in df.columns else df['收盘'].shift(1)
            result_df['change'] = df['涨跌额'].astype(float) if '涨跌额' in df.columns else df['收盘'] - df['收盘'].shift(1)
            result_df['pct_chg'] = df['涨跌幅'].astype(float) if '涨跌幅' in df.columns else ((df['收盘'] - df['收盘'].shift(1)) / df['收盘'].shift(1) * 100)
            result_df['vol'] = (df['成交量'].astype(float) * 100).astype(int)  # 手 -> 股
            result_df['amount'] = df['成交额'].astype(float) * 1000  # 千元 -> 元

            logger.info(f"从AKShare获取 {len(result_df)} 条日线数据: {ts_code}")
            return result_df

        except Exception as e:
            logger.error(f"AKShare获取日线数据失败 {ts_code}: {e}")
            return None

    async def get_daily_data_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        按日期获取日线数据（批量接口）

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含所有股票的日线数据
        """
        if not self.available:
            return None

        try:
            # AKShare没有直接的按日期批量接口
            # 需要先获取股票列表，然后逐个获取
            logger.warning("AKShare没有批量按日期接口，使用逐个获取方式（性能较低）")

            # 获取股票列表
            stock_df = await self.get_stock_basic()
            if stock_df is None or stock_df.empty:
                return None

            # 转换日期格式
            trade_date_fmt = f"{trade_date[:4]}-{trade_date[4:6]}-{trade_date[6:8]}"

            all_data = []
            success_count = 0

            # 限制获取数量，避免性能问题
            max_stocks = 100  # 每次最多获取100只股票
            stocks_to_fetch = stock_df.head(max_stocks)

            for _, row in stocks_to_fetch.iterrows():
                ts_code = row['ts_code']
                code, exchange = ts_code.split('.')

                try:
                    if exchange == 'SZ':
                        df = ak.stock_zh_a_hist(
                            symbol=code,
                            period="daily",
                            start_date=trade_date_fmt,
                            end_date=trade_date_fmt,
                            adjust="qfq"
                        )
                    elif exchange == 'SH':
                        df = ak.stock_zh_a_hist(
                            symbol=code,
                            period="daily",
                            start_date=trade_date_fmt,
                            end_date=trade_date_fmt,
                            adjust="qfq"
                        )
                    else:
                        continue

                    if df is not None and not df.empty:
                        # 转换为标准格式
                        result_row = {
                            'ts_code': ts_code,
                            'trade_date': pd.to_datetime(trade_date_fmt),
                            'open': float(df.iloc[0]['开盘']),
                            'high': float(df.iloc[0]['最高']),
                            'low': float(df.iloc[0]['最低']),
                            'close': float(df.iloc[0]['收盘']),
                            'pre_close': float(df.iloc[0]['前收盘']) if '前收盘' in df.columns else float(df.iloc[0]['收盘']),
                            'vol': int(float(df.iloc[0]['成交量']) * 100),
                            'amount': float(df.iloc[0]['成交额']) * 1000
                        }
                        all_data.append(result_row)
                        success_count += 1

                    # 避免请求过快
                    await asyncio.sleep(0.1)

                except Exception as e:
                    logger.debug(f"AKShare获取单只股票日线数据失败 {ts_code}: {e}")
                    continue

            if not all_data:
                logger.warning(f"AKShare未获取到任何日线数据: {trade_date}")
                return None

            result_df = pd.DataFrame(all_data)
            logger.info(f"从AKShare获取 {success_count}/{len(stocks_to_fetch)} 只股票的日线数据: {trade_date}")
            return result_df

        except Exception as e:
            logger.error(f"AKShare批量获取日线数据失败 {trade_date}: {e}")
            return None

    async def get_moneyflow_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        获取资金流向数据

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含资金流向数据
        """
        if not self.available:
            return None

        try:
            # AKShare的资金流向接口
            # 注意：AKShare的资金流向数据可能不如Tushare全面
            df = ak.stock_individual_fund_flow(
                stock="",  # 空字符串表示获取所有股票
                market="CN",
                date=trade_date
            )

            if df is None or df.empty:
                logger.warning(f"AKShare返回空资金流向数据: {trade_date}")
                return None

            # 转换为标准格式
            result_df = pd.DataFrame()

            for _, row in df.iterrows():
                code = str(row['代码']).strip()
                if len(code) == 6:
                    # 判断交易所
                    if code.startswith('6'):
                        ts_code = f"{code}.SH"
                    elif code.startswith('0') or code.startswith('3'):
                        ts_code = f"{code}.SZ"
                    else:
                        continue

                    result_row = {
                        'ts_code': ts_code,
                        'trade_date': pd.to_datetime(trade_date),
                        'buy_sm_amount': float(row.get('小单买入', 0)) * 10000,  # 万元 -> 元
                        'sell_sm_amount': float(row.get('小单卖出', 0)) * 10000,
                        'buy_md_amount': float(row.get('中单买入', 0)) * 10000,
                        'sell_md_amount': float(row.get('中单卖出', 0)) * 10000,
                        'buy_lg_amount': float(row.get('大单买入', 0)) * 10000,
                        'sell_lg_amount': float(row.get('大单卖出', 0)) * 10000,
                        'buy_elg_amount': float(row.get('超大单买入', 0)) * 10000,
                        'sell_elg_amount': float(row.get('超大单卖出', 0)) * 10000,
                        'net_mf_amount': float(row.get('主力净流入', 0)) * 10000
                    }

                    # 计算主力资金流向（大单+超大单）
                    main_fund_flow = result_row['buy_lg_amount'] + result_row['buy_elg_amount'] - \
                                   result_row['sell_lg_amount'] - result_row['sell_elg_amount']
                    result_row['main_fund_flow'] = main_fund_flow

                    # 计算散户资金流向（小单+中单）
                    retail_fund_flow = result_row['buy_sm_amount'] + result_row['buy_md_amount'] - \
                                     result_row['sell_sm_amount'] - result_row['sell_md_amount']
                    result_row['retail_fund_flow'] = retail_fund_flow

                    result_df = pd.concat([result_df, pd.DataFrame([result_row])], ignore_index=True)

            if result_df.empty:
                logger.warning(f"AKShare未解析到有效的资金流向数据: {trade_date}")
                return None

            logger.info(f"从AKShare获取 {len(result_df)} 条资金流向数据: {trade_date}")
            return result_df

        except Exception as e:
            logger.error(f"AKShare获取资金流向数据失败 {trade_date}: {e}")
            return None

    async def get_daily_basic_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        获取每日技术指标

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含每日技术指标
        """
        if not self.available:
            return None

        try:
            # AKShare的估值指标接口
            df = ak.stock_a_pe(
                symbol="",  # 空字符串表示获取所有股票
                start_date=trade_date,
                end_date=trade_date
            )

            if df is None or df.empty:
                logger.warning(f"AKShare返回空估值数据: {trade_date}")
                return None

            # 转换为标准格式
            result_df = pd.DataFrame()

            for _, row in df.iterrows():
                code = str(row['代码']).strip()
                if len(code) == 6:
                    # 判断交易所
                    if code.startswith('6'):
                        ts_code = f"{code}.SH"
                    elif code.startswith('0') or code.startswith('3'):
                        ts_code = f"{code}.SZ"
                    else:
                        continue

                    result_row = {
                        'ts_code': ts_code,
                        'trade_date': pd.to_datetime(trade_date),
                        'pe': float(row.get('市盈率', 0)),
                        'pe_ttm': float(row.get('市盈率TTM', 0)),
                        'pb': float(row.get('市净率', 0)),
                        'ps': float(row.get('市销率', 0)),
                        'ps_ttm': float(row.get('市销率TTM', 0)),
                        'dv_ratio': float(row.get('股息率', 0)),
                        'total_share': float(row.get('总股本', 0)) * 10000,  # 亿股 -> 股
                        'float_share': float(row.get('流通股本', 0)) * 10000,
                        'total_mv': float(row.get('总市值', 0)) * 10000,  # 亿元 -> 元
                        'circ_mv': float(row.get('流通市值', 0)) * 10000
                    }

                    # 设置默认值
                    result_row['close'] = 0.0
                    result_row['turnover_rate'] = 0.0
                    result_row['turnover_rate_f'] = 0.0
                    result_row['volume_ratio'] = 0.0
                    result_row['dv_ttm'] = result_row['dv_ratio']
                    result_row['free_share'] = result_row['float_share']

                    result_df = pd.concat([result_df, pd.DataFrame([result_row])], ignore_index=True)

            if result_df.empty:
                logger.warning(f"AKShare未解析到有效的估值数据: {trade_date}")
                return None

            logger.info(f"从AKShare获取 {len(result_df)} 条估值数据: {trade_date}")
            return result_df

        except Exception as e:
            logger.error(f"AKShare获取估值数据失败 {trade_date}: {e}")
            return None

    def is_available(self) -> bool:
        """
        检查数据源是否可用

        Returns:
            True如果数据源可用，False否则
        """
        return self.available

    def get_source_name(self) -> str:
        """
        获取数据源名称

        Returns:
            数据源名称
        """
        return "akshare"

    def get_health_status(self) -> Dict[str, Any]:
        """
        获取数据源健康状态

        Returns:
            健康状态字典
        """
        status = super().get_health_status()

        # 添加AKShare特定信息
        if self.available:
            try:
                # 测试基本功能
                test_df = ak.stock_info_a_code_name()
                if test_df is not None and not test_df.empty:
                    status["test_stock_count"] = len(test_df)
                    status["test_success"] = True
                else:
                    status["test_success"] = False
                    status["test_error"] = "返回空数据"
            except Exception as e:
                status["test_success"] = False
                status["test_error"] = str(e)
        else:
            status["test_success"] = False
            status["test_error"] = "AKShare模块未安装"

        return status


# 测试函数
async def test_akshare_client():
    """测试AKShare客户端"""
    print("测试AKShare客户端...")

    client = AKShareClient()

    if not client.is_available():
        print("AKShare不可用，请安装: pip install akshare")
        return

    try:
        # 测试股票基本信息
        print("\n1. 测试股票基本信息:")
        stock_df = await client.get_stock_basic()
        if stock_df is not None:
            print(f"   获取到 {len(stock_df)} 只股票")
            print(f"   示例: {stock_df.iloc[0]['ts_code']} - {stock_df.iloc[0]['name']}")
        else:
            print("   获取失败")

        # 测试日线数据
        print("\n2. 测试日线数据:")
        # 使用最近一天的日期
        test_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')
        daily_df = await client.get_daily_data_by_date(test_date)
        if daily_df is not None:
            print(f"   获取到 {len(daily_df)} 条日线数据")
            if len(daily_df) > 0:
                print(f"   示例: {daily_df.iloc[0]['ts_code']} - 收盘价: {daily_df.iloc[0]['close']}")
        else:
            print("   获取失败")

        # 测试资金流向
        print("\n3. 测试资金流向数据:")
        flow_df = await client.get_moneyflow_by_date(test_date)
        if flow_df is not None:
            print(f"   获取到 {len(flow_df)} 条资金流向数据")
        else:
            print("   获取失败")

        # 测试估值数据
        print("\n4. 测试估值数据:")
        basic_df = await client.get_daily_basic_by_date(test_date)
        if basic_df is not None:
            print(f"   获取到 {len(basic_df)} 条估值数据")
        else:
            print("   获取失败")

        print("\n测试完成!")

    except Exception as e:
        print(f"测试失败: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_akshare_client())
