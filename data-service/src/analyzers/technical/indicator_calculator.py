"""
技术指标计算器
计算各种技术指标：MACD、RSI、KDJ、布林带、移动平均线等
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class IndicatorCalculator:
    """技术指标计算器"""

    def __init__(self):
        self.indicators = {
            'MA': self.calculate_ma,
            'MACD': self.calculate_macd,
            'RSI': self.calculate_rsi,
            'KDJ': self.calculate_kdj,
            'BOLL': self.calculate_boll,
            'ATR': self.calculate_atr,
            'CCI': self.calculate_cci,
            'OBV': self.calculate_obv,
            'VOLUME_RATIO': self.calculate_volume_ratio
        }

    async def calculate_all_indicators(self, df: pd.DataFrame) -> Dict[str, pd.Series]:
        """
        计算所有技术指标

        Args:
            df: 包含 OHLCV 数据的 DataFrame，必须有以下列：
                - 'open', 'high', 'low', 'close', 'volume'

        Returns:
            包含所有技术指标的字典
        """
        if df.empty or len(df) < 30:
            logger.warning(f"数据不足，至少需要30个交易日数据，当前只有{len(df)}个")
            return {}

        results = {}

        # 计算移动平均线
        results['MA5'] = self.calculate_ma(df['close'], 5)
        results['MA10'] = self.calculate_ma(df['close'], 10)
        results['MA20'] = self.calculate_ma(df['close'], 20)
        results['MA30'] = self.calculate_ma(df['close'], 30)
        results['MA60'] = self.calculate_ma(df['close'], 60)

        # 计算 MACD
        macd, signal, hist = self.calculate_macd(df['close'])
        results['MACD'] = macd
        results['MACD_SIGNAL'] = signal
        results['MACD_HIST'] = hist

        # 计算 RSI
        results['RSI6'] = self.calculate_rsi(df['close'], 6)
        results['RSI12'] = self.calculate_rsi(df['close'], 12)
        results['RSI24'] = self.calculate_rsi(df['close'], 24)

        # 计算 KDJ
        k, d, j = self.calculate_kdj(df['high'], df['low'], df['close'])
        results['KDJ_K'] = k
        results['KDJ_D'] = d
        results['KDJ_J'] = j

        # 计算布林带
        upper, middle, lower = self.calculate_boll(df['close'])
        results['BOLL_UPPER'] = upper
        results['BOLL_MIDDLE'] = middle
        results['BOLL_LOWER'] = lower

        # 计算 ATR
        results['ATR'] = self.calculate_atr(df['high'], df['low'], df['close'])

        # 计算 CCI
        results['CCI'] = self.calculate_cci(df['high'], df['low'], df['close'])

        # 计算 OBV
        results['OBV'] = self.calculate_obv(df['close'], df['volume'])

        # 计算量比
        results['VOLUME_RATIO'] = self.calculate_volume_ratio(df['volume'])

        return results

    def calculate_ma(self, series: pd.Series, period: int) -> pd.Series:
        """计算移动平均线"""
        return series.rolling(window=period).mean()

    def calculate_macd(self, close: pd.Series,
                      fast_period: int = 12,
                      slow_period: int = 26,
                      signal_period: int = 9) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        计算 MACD 指标

        Returns:
            (macd, signal, hist)
        """
        # 计算 EMA
        ema_fast = close.ewm(span=fast_period, adjust=False).mean()
        ema_slow = close.ewm(span=slow_period, adjust=False).mean()

        # 计算 MACD 线
        macd = ema_fast - ema_slow

        # 计算信号线
        signal = macd.ewm(span=signal_period, adjust=False).mean()

        # 计算柱状图
        hist = macd - signal

        return macd, signal, hist

    def calculate_rsi(self, close: pd.Series, period: int = 14) -> pd.Series:
        """计算 RSI 指标"""
        delta = close.diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()

        rs = gain / loss
        rsi = 100 - (100 / (1 + rs))

        return rsi

    def calculate_kdj(self, high: pd.Series, low: pd.Series, close: pd.Series,
                     n: int = 9, m1: int = 3, m2: int = 3) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        计算 KDJ 指标

        Returns:
            (K, D, J)
        """
        # 计算 RSV
        low_n = low.rolling(window=n).min()
        high_n = high.rolling(window=n).max()
        rsv = 100 * (close - low_n) / (high_n - low_n)

        # 计算 K 值
        k = rsv.ewm(alpha=1/m1, adjust=False).mean()

        # 计算 D 值
        d = k.ewm(alpha=1/m2, adjust=False).mean()

        # 计算 J 值
        j = 3 * k - 2 * d

        return k, d, j

    def calculate_boll(self, close: pd.Series, period: int = 20,
                      num_std: float = 2) -> Tuple[pd.Series, pd.Series, pd.Series]:
        """
        计算布林带

        Returns:
            (upper, middle, lower)
        """
        middle = close.rolling(window=period).mean()
        std = close.rolling(window=period).std()

        upper = middle + num_std * std
        lower = middle - num_std * std

        return upper, middle, lower

    def calculate_atr(self, high: pd.Series, low: pd.Series, close: pd.Series,
                     period: int = 14) -> pd.Series:
        """计算平均真实波幅 (ATR)"""
        # 计算真实波幅
        tr1 = high - low
        tr2 = abs(high - close.shift())
        tr3 = abs(low - close.shift())

        tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)

        # 计算 ATR
        atr = tr.rolling(window=period).mean()

        return atr

    def calculate_cci(self, high: pd.Series, low: pd.Series, close: pd.Series,
                     period: int = 20) -> pd.Series:
        """计算商品通道指数 (CCI)"""
        tp = (high + low + close) / 3  # 典型价格
        sma_tp = tp.rolling(window=period).mean()
        mad = tp.rolling(window=period).apply(lambda x: np.mean(np.abs(x - np.mean(x))))

        cci = (tp - sma_tp) / (0.015 * mad)

        return cci

    def calculate_obv(self, close: pd.Series, volume: pd.Series) -> pd.Series:
        """计算能量潮 (OBV)"""
        obv = pd.Series(index=close.index, dtype=float)
        obv.iloc[0] = volume.iloc[0]

        for i in range(1, len(close)):
            if close.iloc[i] > close.iloc[i-1]:
                obv.iloc[i] = obv.iloc[i-1] + volume.iloc[i]
            elif close.iloc[i] < close.iloc[i-1]:
                obv.iloc[i] = obv.iloc[i-1] - volume.iloc[i]
            else:
                obv.iloc[i] = obv.iloc[i-1]

        return obv

    def calculate_volume_ratio(self, volume: pd.Series, period: int = 20) -> pd.Series:
        """计算量比"""
        avg_volume = volume.rolling(window=period).mean()
        volume_ratio = volume / avg_volume

        return volume_ratio

    def get_indicator_signals(self, indicators: Dict[str, pd.Series]) -> Dict[str, str]:
        """
        根据技术指标生成交易信号

        Args:
            indicators: 技术指标字典

        Returns:
            信号字典
        """
        signals = {}

        # MACD 信号
        if 'MACD' in indicators and 'MACD_SIGNAL' in indicators:
            macd = indicators['MACD'].iloc[-1]
            signal = indicators['MACD_SIGNAL'].iloc[-1]
            hist = indicators['MACD_HIST'].iloc[-1]

            if macd > signal and hist > 0:
                signals['MACD'] = 'BULLISH'
            elif macd < signal and hist < 0:
                signals['MACD'] = 'BEARISH'
            else:
                signals['MACD'] = 'NEUTRAL'

        # RSI 信号
        if 'RSI14' in indicators:
            rsi = indicators['RSI14'].iloc[-1]
            if rsi > 70:
                signals['RSI'] = 'OVERBOUGHT'
            elif rsi < 30:
                signals['RSI'] = 'OVERSOLD'
            else:
                signals['RSI'] = 'NEUTRAL'

        # KDJ 信号
        if 'KDJ_K' in indicators and 'KDJ_D' in indicators:
            k = indicators['KDJ_K'].iloc[-1]
            d = indicators['KDJ_D'].iloc[-1]

            if k > 80 and d > 80:
                signals['KDJ'] = 'OVERBOUGHT'
            elif k < 20 and d < 20:
                signals['KDJ'] = 'OVERSOLD'
            elif k > d:
                signals['KDJ'] = 'BULLISH'
            elif k < d:
                signals['KDJ'] = 'BEARISH'
            else:
                signals['KDJ'] = 'NEUTRAL'

        # 布林带信号
        if 'BOLL_UPPER' in indicators and 'BOLL_LOWER' in indicators and 'close' in indicators:
            close = indicators['close'].iloc[-1]
            upper = indicators['BOLL_UPPER'].iloc[-1]
            lower = indicators['BOLL_LOWER'].iloc[-1]

            if close > upper:
                signals['BOLL'] = 'OVERBOUGHT'
            elif close < lower:
                signals['BOLL'] = 'OVERSOLD'
            else:
                signals['BOLL'] = 'WITHIN_BANDS'

        # 移动平均线信号
        if 'MA5' in indicators and 'MA20' in indicators and 'close' in indicators:
            close = indicators['close'].iloc[-1]
            ma5 = indicators['MA5'].iloc[-1]
            ma20 = indicators['MA20'].iloc[-1]

            if close > ma5 > ma20:
                signals['MA_TREND'] = 'STRONG_UPTREND'
            elif ma5 > close > ma20:
                signals['MA_TREND'] = 'WEAK_UPTREND'
            elif close < ma5 < ma20:
                signals['MA_TREND'] = 'STRONG_DOWNTREND'
            elif ma5 < close < ma20:
                signals['MA_TREND'] = 'WEAK_DOWNTREND'
            else:
                signals['MA_TREND'] = 'CONSOLIDATION'

        return signals