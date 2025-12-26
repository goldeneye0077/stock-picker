#!/usr/bin/env python3
"""
数据源抽象基类
定义统一的数据源接口
"""

from abc import ABC, abstractmethod
from typing import Optional, List, Dict, Any
import pandas as pd
from loguru import logger


class DataSource(ABC):
    """数据源抽象基类"""

    @abstractmethod
    async def get_stock_basic(self) -> Optional[pd.DataFrame]:
        """
        获取股票基本信息

        Returns:
            DataFrame包含以下列:
            - ts_code: 股票代码 (如 '000001.SZ')
            - symbol: 股票代码简写
            - name: 股票名称
            - area: 地区
            - industry: 行业
            - market: 市场类型
            - exchange: 交易所
            - list_date: 上市日期
        """
        pass

    @abstractmethod
    async def get_daily_data(self, ts_code: str, start_date: str, end_date: str) -> Optional[pd.DataFrame]:
        """
        获取日线数据

        Args:
            ts_code: 股票代码 (如 '000001.SZ')
            start_date: 开始日期 (格式 'YYYYMMDD')
            end_date: 结束日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含以下列:
            - ts_code: 股票代码
            - trade_date: 交易日期
            - open: 开盘价
            - high: 最高价
            - low: 最低价
            - close: 收盘价
            - pre_close: 前收盘价
            - change: 涨跌额
            - pct_chg: 涨跌幅
            - vol: 成交量 (手)
            - amount: 成交额 (千元)
        """
        pass

    @abstractmethod
    async def get_daily_data_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        按日期获取日线数据（批量接口）

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含以下列（同get_daily_data）
        """
        pass

    @abstractmethod
    async def get_moneyflow_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        获取资金流向数据

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含以下列:
            - ts_code: 股票代码
            - trade_date: 交易日期
            - buy_sm_vol: 小单买入量 (手)
            - buy_sm_amount: 小单买入金额 (万元)
            - sell_sm_vol: 小单卖出量 (手)
            - sell_sm_amount: 小单卖出金额 (万元)
            - buy_md_vol: 中单买入量 (手)
            - buy_md_amount: 中单买入金额 (万元)
            - sell_md_vol: 中单卖出量 (手)
            - sell_md_amount: 中单卖出金额 (万元)
            - buy_lg_vol: 大单买入量 (手)
            - buy_lg_amount: 大单买入金额 (万元)
            - sell_lg_vol: 大单卖出量 (手)
            - sell_lg_amount: 大单卖出金额 (万元)
            - buy_elg_vol: 特大单买入量 (手)
            - buy_elg_amount: 特大单买入金额 (万元)
            - sell_elg_vol: 特大单卖出量 (手)
            - sell_elg_amount: 特大单卖出金额 (万元)
            - net_mf_vol: 净流入量 (手)
            - net_mf_amount: 净流入金额 (万元)
        """
        pass

    @abstractmethod
    async def get_daily_basic_by_date(self, trade_date: str) -> Optional[pd.DataFrame]:
        """
        获取每日技术指标

        Args:
            trade_date: 交易日期 (格式 'YYYYMMDD')

        Returns:
            DataFrame包含以下列:
            - ts_code: 股票代码
            - trade_date: 交易日期
            - close: 收盘价
            - turnover_rate: 换手率
            - turnover_rate_f: 换手率(自由流通股本)
            - volume_ratio: 量比
            - pe: 市盈率
            - pe_ttm: 市盈率TTM
            - pb: 市净率
            - ps: 市销率
            - ps_ttm: 市销率TTM
            - dv_ratio: 股息率
            - dv_ttm: 股息率TTM
            - total_share: 总股本
            - float_share: 流通股本
            - free_share: 自由流通股本
            - total_mv: 总市值
            - circ_mv: 流通市值
        """
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """
        检查数据源是否可用

        Returns:
            True如果数据源可用，False否则
        """
        pass

    @abstractmethod
    def get_source_name(self) -> str:
        """
        获取数据源名称

        Returns:
            数据源名称，如 'tushare', 'akshare', 'baostock'
        """
        pass

    def get_health_status(self) -> Dict[str, Any]:
        """
        获取数据源健康状态

        Returns:
            健康状态字典
        """
        return {
            "source_name": self.get_source_name(),
            "available": self.is_available(),
            "status": "healthy" if self.is_available() else "unavailable"
        }


class DataSourceError(Exception):
    """数据源异常基类"""
    pass


class DataFormatError(DataSourceError):
    """数据格式错误"""
    pass


class DataSourceUnavailableError(DataSourceError):
    """数据源不可用错误"""
    pass


class DataSourceRateLimitError(DataSourceError):
    """数据源频率限制错误"""
    pass