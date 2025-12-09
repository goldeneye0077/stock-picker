"""
K线形态识别器
识别常见的K线形态：锤子线、吞没形态、十字星、三只乌鸦等
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class PatternRecognizer:
    """K线形态识别器"""

    def __init__(self):
        self.patterns = {
            'HAMMER': self._detect_hammer,
            'INVERTED_HAMMER': self._detect_inverted_hammer,
            'BULLISH_ENGULFING': self._detect_bullish_engulfing,
            'BEARISH_ENGULFING': self._detect_bearish_engulfing,
            'DOJI': self._detect_doji,
            'SHOOTING_STAR': self._detect_shooting_star,
            'HANGING_MAN': self._detect_hanging_man,
            'MORNING_STAR': self._detect_morning_star,
            'EVENING_STAR': self._detect_evening_star,
            'THREE_WHITE_SOLDIERS': self._detect_three_white_soldiers,
            'THREE_BLACK_CROWS': self._detect_three_black_crows,
            'BULLISH_HARAMI': self._detect_bullish_harami,
            'BEARISH_HARAMI': self._detect_bearish_harami
        }

    async def detect_all_patterns(self, df: pd.DataFrame,
                                 lookback_period: int = 20) -> Dict[str, List[Dict]]:
        """
        检测所有K线形态

        Args:
            df: 包含 OHLC 数据的 DataFrame，必须有以下列：
                - 'open', 'high', 'low', 'close'
            lookback_period: 检测的回顾周期

        Returns:
            包含所有检测到的形态的字典
        """
        if df.empty or len(df) < 5:
            logger.warning(f"数据不足，至少需要5个交易日数据，当前只有{len(df)}个")
            return {}

        results = {}
        recent_data = df.iloc[-lookback_period:].copy()

        for pattern_name, detector_func in self.patterns.items():
            pattern_results = detector_func(recent_data)
            if pattern_results:
                results[pattern_name] = pattern_results

        return results

    def _detect_hammer(self, df: pd.DataFrame) -> List[Dict]:
        """检测锤子线（看涨反转形态）"""
        patterns = []

        for i in range(1, len(df)):
            open_price = df['open'].iloc[i]
            close_price = df['close'].iloc[i]
            high_price = df['high'].iloc[i]
            low_price = df['low'].iloc[i]

            # 计算实体大小
            body_size = abs(close_price - open_price)
            total_range = high_price - low_price

            # 锤子线条件：
            # 1. 下影线至少是实体的2倍
            # 2. 上影线很小或没有
            # 3. 实体较小
            # 4. 出现在下跌趋势中
            lower_shadow = min(open_price, close_price) - low_price
            upper_shadow = high_price - max(open_price, close_price)

            if (total_range > 0 and
                lower_shadow >= 2 * body_size and
                upper_shadow <= body_size * 0.3 and
                body_size <= total_range * 0.3):

                # 检查是否在下跌趋势中
                if i >= 3:
                    prev_trend = self._check_downtrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'HAMMER',
                            'confidence': 0.7,
                            'price': float(close_price),
                            'body_size': float(body_size),
                            'lower_shadow': float(lower_shadow),
                            'upper_shadow': float(upper_shadow)
                        })

        return patterns

    def _detect_inverted_hammer(self, df: pd.DataFrame) -> List[Dict]:
        """检测倒锤子线（看涨反转形态）"""
        patterns = []

        for i in range(1, len(df)):
            open_price = df['open'].iloc[i]
            close_price = df['close'].iloc[i]
            high_price = df['high'].iloc[i]
            low_price = df['low'].iloc[i]

            body_size = abs(close_price - open_price)
            total_range = high_price - low_price

            # 倒锤子线条件：
            # 1. 上影线至少是实体的2倍
            # 2. 下影线很小或没有
            # 3. 实体较小
            # 4. 出现在下跌趋势中
            upper_shadow = high_price - max(open_price, close_price)
            lower_shadow = min(open_price, close_price) - low_price

            if (total_range > 0 and
                upper_shadow >= 2 * body_size and
                lower_shadow <= body_size * 0.3 and
                body_size <= total_range * 0.3):

                if i >= 3:
                    prev_trend = self._check_downtrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'INVERTED_HAMMER',
                            'confidence': 0.6,
                            'price': float(close_price),
                            'body_size': float(body_size),
                            'upper_shadow': float(upper_shadow),
                            'lower_shadow': float(lower_shadow)
                        })

        return patterns

    def _detect_bullish_engulfing(self, df: pd.DataFrame) -> List[Dict]:
        """检测看涨吞没形态"""
        patterns = []

        for i in range(1, len(df)):
            prev_open = df['open'].iloc[i-1]
            prev_close = df['close'].iloc[i-1]
            curr_open = df['open'].iloc[i]
            curr_close = df['close'].iloc[i]

            # 看涨吞没条件：
            # 1. 前一根是阴线
            # 2. 当前是阳线
            # 3. 当前实体完全吞没前一根实体
            if (prev_close < prev_open and  # 前一根阴线
                curr_close > curr_open and  # 当前阳线
                curr_open < prev_close and  # 当前开盘低于前收盘
                curr_close > prev_open):    # 当前收盘高于前开盘

                # 检查是否在下跌趋势中
                if i >= 3:
                    prev_trend = self._check_downtrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'BULLISH_ENGULFING',
                            'confidence': 0.8,
                            'price': float(curr_close),
                            'prev_body': float(abs(prev_close - prev_open)),
                            'curr_body': float(abs(curr_close - curr_open))
                        })

        return patterns

    def _detect_bearish_engulfing(self, df: pd.DataFrame) -> List[Dict]:
        """检测看跌吞没形态"""
        patterns = []

        for i in range(1, len(df)):
            prev_open = df['open'].iloc[i-1]
            prev_close = df['close'].iloc[i-1]
            curr_open = df['open'].iloc[i]
            curr_close = df['close'].iloc[i]

            # 看跌吞没条件：
            # 1. 前一根是阳线
            # 2. 当前是阴线
            # 3. 当前实体完全吞没前一根实体
            if (prev_close > prev_open and  # 前一根阳线
                curr_close < curr_open and  # 当前阴线
                curr_open > prev_close and  # 当前开盘高于前收盘
                curr_close < prev_open):    # 当前收盘低于前开盘

                # 检查是否在上涨趋势中
                if i >= 3:
                    prev_trend = self._check_uptrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'BEARISH_ENGULFING',
                            'confidence': 0.8,
                            'price': float(curr_close),
                            'prev_body': float(abs(prev_close - prev_open)),
                            'curr_body': float(abs(curr_close - curr_open))
                        })

        return patterns

    def _detect_doji(self, df: pd.DataFrame) -> List[Dict]:
        """检测十字星"""
        patterns = []

        for i in range(len(df)):
            open_price = df['open'].iloc[i]
            close_price = df['close'].iloc[i]
            high_price = df['high'].iloc[i]
            low_price = df['low'].iloc[i]

            # 十字星条件：
            # 1. 开盘价和收盘价非常接近
            # 2. 有较长的上下影线
            body_size = abs(close_price - open_price)
            total_range = high_price - low_price

            if total_range > 0 and body_size <= total_range * 0.1:
                patterns.append({
                    'date': df.index[i],
                    'type': 'DOJI',
                    'confidence': 0.5,
                    'price': float(close_price),
                    'body_size': float(body_size),
                    'total_range': float(total_range)
                })

        return patterns

    def _detect_shooting_star(self, df: pd.DataFrame) -> List[Dict]:
        """检测射击之星（看跌反转形态）"""
        patterns = []

        for i in range(1, len(df)):
            open_price = df['open'].iloc[i]
            close_price = df['close'].iloc[i]
            high_price = df['high'].iloc[i]
            low_price = df['low'].iloc[i]

            body_size = abs(close_price - open_price)
            total_range = high_price - low_price

            # 射击之星条件：
            # 1. 上影线至少是实体的2倍
            # 2. 下影线很小或没有
            # 3. 出现在上涨趋势中
            upper_shadow = high_price - max(open_price, close_price)
            lower_shadow = min(open_price, close_price) - low_price

            if (total_range > 0 and
                upper_shadow >= 2 * body_size and
                lower_shadow <= body_size * 0.3):

                if i >= 3:
                    prev_trend = self._check_uptrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'SHOOTING_STAR',
                            'confidence': 0.7,
                            'price': float(close_price),
                            'body_size': float(body_size),
                            'upper_shadow': float(upper_shadow),
                            'lower_shadow': float(lower_shadow)
                        })

        return patterns

    def _detect_hanging_man(self, df: pd.DataFrame) -> List[Dict]:
        """检测上吊线（看跌反转形态）"""
        patterns = []

        for i in range(1, len(df)):
            open_price = df['open'].iloc[i]
            close_price = df['close'].iloc[i]
            high_price = df['high'].iloc[i]
            low_price = df['low'].iloc[i]

            body_size = abs(close_price - open_price)
            total_range = high_price - low_price

            # 上吊线条件：
            # 1. 下影线至少是实体的2倍
            # 2. 上影线很小或没有
            # 3. 出现在上涨趋势中
            lower_shadow = min(open_price, close_price) - low_price
            upper_shadow = high_price - max(open_price, close_price)

            if (total_range > 0 and
                lower_shadow >= 2 * body_size and
                upper_shadow <= body_size * 0.3):

                if i >= 3:
                    prev_trend = self._check_uptrend(df.iloc[i-3:i+1])
                    if prev_trend:
                        patterns.append({
                            'date': df.index[i],
                            'type': 'HANGING_MAN',
                            'confidence': 0.7,
                            'price': float(close_price),
                            'body_size': float(body_size),
                            'lower_shadow': float(lower_shadow),
                            'upper_shadow': float(upper_shadow)
                        })

        return patterns

    def _detect_morning_star(self, df: pd.DataFrame) -> List[Dict]:
        """检测早晨之星（看涨反转形态）"""
        patterns = []

        for i in range(2, len(df)):
            day1_close = df['close'].iloc[i-2]
            day1_open = df['open'].iloc[i-2]

            day2_close = df['close'].iloc[i-1]
            day2_open = df['open'].iloc[i-1]
            day2_body = abs(day2_close - day2_open)

            day3_close = df['close'].iloc[i]
            day3_open = df['open'].iloc[i]

            # 早晨之星条件：
            # 1. 第一天是长阴线
            # 2. 第二天是十字星或小实体
            # 3. 第三天是长阳线
            # 4. 第三天的收盘价超过第一天的实体中点
            day1_body = abs(day1_close - day1_open)
            day3_body = abs(day3_close - day3_open)

            if (day1_close < day1_open and  # 第一天阴线
                day3_close > day3_open and  # 第三天阳线
                day2_body <= max(day1_body, day3_body) * 0.3 and  # 第二天小实体
                day3_close > (day1_open + day1_close) / 2):  # 超过第一天中点

                patterns.append({
                    'date': df.index[i],
                    'type': 'MORNING_STAR',
                    'confidence': 0.85,
                    'price': float(day3_close),
                    'day1_body': float(day1_body),
                    'day2_body': float(day2_body),
                    'day3_body': float(day3_body)
                })

        return patterns

    def _detect_evening_star(self, df: pd.DataFrame) -> List[Dict]:
        """检测黄昏之星（看跌反转形态）"""
        patterns = []

        for i in range(2, len(df)):
            day1_close = df['close'].iloc[i-2]
            day1_open = df['open'].iloc[i-2]

            day2_close = df['close'].iloc[i-1]
            day2_open = df['open'].iloc[i-1]
            day2_body = abs(day2_close - day2_open)

            day3_close = df['close'].iloc[i]
            day3_open = df['open'].iloc[i]

            # 黄昏之星条件：
            # 1. 第一天是长阳线
            # 2. 第二天是十字星或小实体
            # 3. 第三天是长阴线
            # 4. 第三天的收盘价低于第一天的实体中点
            day1_body = abs(day1_close - day1_open)
            day3_body = abs(day3_close - day3_open)

            if (day1_close > day1_open and  # 第一天阳线
                day3_close < day3_open and  # 第三天阴线
                day2_body <= max(day1_body, day3_body) * 0.3 and  # 第二天小实体
                day3_close < (day1_open + day1_close) / 2):  # 低于第一天中点

                patterns.append({
                    'date': df.index[i],
                    'type': 'EVENING_STAR',
                    'confidence': 0.85,
                    'price': float(day3_close),
                    'day1_body': float(day1_body),
                    'day2_body': float(day2_body),
                    'day3_body': float(day3_body)
                })

        return patterns

    def _detect_three_white_soldiers(self, df: pd.DataFrame) -> List[Dict]:
        """检测三只白兵（看涨形态）"""
        patterns = []

        for i in range(3, len(df)):
            # 检查连续三根阳线
            days = []
            for j in range(3):
                idx = i - j
                open_price = df['open'].iloc[idx]
                close_price = df['close'].iloc[idx]

                if close_price <= open_price:  # 不是阳线
                    break

                days.append({
                    'open': open_price,
                    'close': close_price,
                    'body': close_price - open_price
                })
            else:
                # 三只白兵条件：
                # 1. 连续三根阳线
                # 2. 每根阳线的收盘价都高于前一根
                # 3. 每根阳线的开盘价都在前一根实体范围内
                if (len(days) == 3 and
                    days[0]['close'] > days[1]['close'] > days[2]['close'] and
                    days[0]['open'] > days[1]['close'] and
                    days[1]['open'] > days[2]['close']):

                    patterns.append({
                        'date': df.index[i],
                        'type': 'THREE_WHITE_SOLDIERS',
                        'confidence': 0.9,
                        'price': float(days[0]['close']),
                        'day1_body': float(days[0]['body']),
                        'day2_body': float(days[1]['body']),
                        'day3_body': float(days[2]['body'])
                    })

        return patterns

    def _detect_three_black_crows(self, df: pd.DataFrame) -> List[Dict]:
        """检测三只乌鸦（看跌形态）"""
        patterns = []

        for i in range(3, len(df)):
            # 检查连续三根阴线
            days = []
            for j in range(3):
                idx = i - j
                open_price = df['open'].iloc[idx]
                close_price = df['close'].iloc[idx]

                if close_price >= open_price:  # 不是阴线
                    break

                days.append({
                    'open': open_price,
                    'close': close_price,
                    'body': open_price - close_price
                })
            else:
                # 三只乌鸦条件：
                # 1. 连续三根阴线
                # 2. 每根阴线的收盘价都低于前一根
                # 3. 每根阴线的开盘价都在前一根实体范围内
                if (len(days) == 3 and
                    days[0]['close'] < days[1]['close'] < days[2]['close'] and
                    days[0]['open'] < days[1]['close'] and
                    days[1]['open'] < days[2]['close']):

                    patterns.append({
                        'date': df.index[i],
                        'type': 'THREE_BLACK_CROWS',
                        'confidence': 0.9,
                        'price': float(days[0]['close']),
                        'day1_body': float(days[0]['body']),
                        'day2_body': float(days[1]['body']),
                        'day3_body': float(days[2]['body'])
                    })

        return patterns

    def _detect_bullish_harami(self, df: pd.DataFrame) -> List[Dict]:
        """检测看涨孕线"""
        patterns = []

        for i in range(1, len(df)):
            prev_open = df['open'].iloc[i-1]
            prev_close = df['close'].iloc[i-1]
            curr_open = df['open'].iloc[i]
            curr_close = df['close'].iloc[i]

            # 看涨孕线条件：
            # 1. 前一根是长阴线
            # 2. 当前是小阳线
            # 3. 当前实体完全在前一根实体内
            prev_body = abs(prev_close - prev_open)
            curr_body = abs(curr_close - curr_open)

            if (prev_close < prev_open and  # 前一根阴线
                curr_close > curr_open and  # 当前阳线
                curr_body < prev_body * 0.5 and  # 当前实体较小
                curr_open > prev_close and  # 当前开盘高于前收盘
                curr_close < prev_open):    # 当前收盘低于前开盘

                patterns.append({
                    'date': df.index[i],
                    'type': 'BULLISH_HARAMI',
                    'confidence': 0.6,
                    'price': float(curr_close),
                    'prev_body': float(prev_body),
                    'curr_body': float(curr_body)
                })

        return patterns

    def _detect_bearish_harami(self, df: pd.DataFrame) -> List[Dict]:
        """检测看跌孕线"""
        patterns = []

        for i in range(1, len(df)):
            prev_open = df['open'].iloc[i-1]
            prev_close = df['close'].iloc[i-1]
            curr_open = df['open'].iloc[i]
            curr_close = df['close'].iloc[i]

            prev_body = abs(prev_close - prev_open)
            curr_body = abs(curr_close - curr_open)

            # 看跌孕线条件：
            # 1. 前一根是长阳线
            # 2. 当前是小阴线
            # 3. 当前实体完全在前一根实体内
            if (prev_close > prev_open and  # 前一根阳线
                curr_close < curr_open and  # 当前阴线
                curr_body < prev_body * 0.5 and  # 当前实体较小
                curr_open < prev_close and  # 当前开盘低于前收盘
                curr_close > prev_open):    # 当前收盘高于前开盘

                patterns.append({
                    'date': df.index[i],
                    'type': 'BEARISH_HARAMI',
                    'confidence': 0.6,
                    'price': float(curr_close),
                    'prev_body': float(prev_body),
                    'curr_body': float(curr_body)
                })

        return patterns

    def _check_uptrend(self, df: pd.DataFrame) -> bool:
        """检查是否为上涨趋势"""
        if len(df) < 3:
            return False

        # 简单判断：价格是否在上涨
        prices = df['close'].values
        slope = np.polyfit(range(len(prices)), prices, 1)[0]

        return slope > 0

    def _check_downtrend(self, df: pd.DataFrame) -> bool:
        """检查是否为下跌趋势"""
        if len(df) < 3:
            return False

        prices = df['close'].values
        slope = np.polyfit(range(len(prices)), prices, 1)[0]

        return slope < 0

    async def get_pattern_signals(self, patterns: Dict[str, List[Dict]]) -> Dict[str, str]:
        """
        根据K线形态生成交易信号

        Args:
            patterns: K线形态检测结果

        Returns:
            信号字典
        """
        signals = {}

        bullish_patterns = ['HAMMER', 'INVERTED_HAMMER', 'BULLISH_ENGULFING',
                          'MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_HARAMI']
        bearish_patterns = ['SHOOTING_STAR', 'HANGING_MAN', 'BEARISH_ENGULFING',
                          'EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_HARAMI']

        # 统计看涨和看跌形态数量
        bullish_count = 0
        bearish_count = 0

        for pattern_name, pattern_list in patterns.items():
            if pattern_list:  # 有检测到该形态
                if pattern_name in bullish_patterns:
                    bullish_count += 1
                elif pattern_name in bearish_patterns:
                    bearish_count += 1

        # 生成综合信号
        if bullish_count > bearish_count:
            signals['PATTERN'] = 'BULLISH'
            signals['BULLISH_COUNT'] = str(bullish_count)
            signals['BEARISH_COUNT'] = str(bearish_count)
        elif bearish_count > bullish_count:
            signals['PATTERN'] = 'BEARISH'
            signals['BULLISH_COUNT'] = str(bullish_count)
            signals['BEARISH_COUNT'] = str(bearish_count)
        else:
            signals['PATTERN'] = 'NEUTRAL'
            signals['BULLISH_COUNT'] = str(bullish_count)
            signals['BEARISH_COUNT'] = str(bearish_count)

        return signals