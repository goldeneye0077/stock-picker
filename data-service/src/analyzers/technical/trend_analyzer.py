"""
趋势分析器
识别和分析股票价格趋势
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class TrendAnalyzer:
    """趋势分析器"""

    def __init__(self):
        self.trend_types = {
            'STRONG_UPTREND': {'min_slope': 0.01, 'min_r2': 0.7},
            'UPTREND': {'min_slope': 0.005, 'min_r2': 0.5},
            'SIDEWAYS': {'max_slope': 0.005, 'max_r2': 0.3},
            'DOWNTREND': {'max_slope': -0.005, 'min_r2': 0.5},
            'STRONG_DOWNTREND': {'max_slope': -0.01, 'min_r2': 0.7}
        }

    async def analyze_trend(self, close_prices: pd.Series,
                          lookback_periods: List[int] = [5, 10, 20, 30, 60]) -> Dict:
        """
        分析多个时间周期的趋势

        Args:
            close_prices: 收盘价序列
            lookback_periods: 要分析的时间周期列表

        Returns:
            趋势分析结果
        """
        if len(close_prices) < max(lookback_periods):
            logger.warning(f"数据不足，需要至少{max(lookback_periods)}个数据点")
            return {}

        results = {}

        for period in lookback_periods:
            if len(close_prices) >= period:
                period_data = close_prices.iloc[-period:]
                trend_result = self._analyze_single_period(period_data)
                results[f'trend_{period}d'] = trend_result

        # 综合趋势判断
        results['composite_trend'] = self._get_composite_trend(results)

        return results

    def _analyze_single_period(self, prices: pd.Series) -> Dict:
        """分析单个时间周期的趋势"""
        if len(prices) < 5:
            return {'type': 'INSUFFICIENT_DATA', 'slope': 0, 'r2': 0}

        # 线性回归计算趋势
        x = np.arange(len(prices))
        y = prices.values

        # 计算斜率和截距
        slope, intercept = np.polyfit(x, y, 1)

        # 计算 R²
        y_pred = slope * x + intercept
        ss_res = np.sum((y - y_pred) ** 2)
        ss_tot = np.sum((y - np.mean(y)) ** 2)
        r2 = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0

        # 判断趋势类型
        trend_type = self._classify_trend(slope, r2)

        # 计算趋势强度
        strength = self._calculate_trend_strength(slope, r2)

        # 计算支撑和阻力位
        support, resistance = self._calculate_support_resistance(prices)

        return {
            'type': trend_type,
            'slope': float(slope),
            'intercept': float(intercept),
            'r2': float(r2),
            'strength': strength,
            'support': float(support),
            'resistance': float(resistance),
            'current_price': float(prices.iloc[-1]),
            'period_high': float(prices.max()),
            'period_low': float(prices.min()),
            'period_return': float((prices.iloc[-1] - prices.iloc[0]) / prices.iloc[0])
        }

    def _classify_trend(self, slope: float, r2: float) -> str:
        """根据斜率和R²分类趋势"""
        if r2 < 0.3:
            return 'SIDEWAYS'

        if slope > 0.01 and r2 > 0.7:
            return 'STRONG_UPTREND'
        elif slope > 0.005 and r2 > 0.5:
            return 'UPTREND'
        elif slope < -0.01 and r2 > 0.7:
            return 'STRONG_DOWNTREND'
        elif slope < -0.005 and r2 > 0.5:
            return 'DOWNTREND'
        else:
            return 'SIDEWAYS'

    def _calculate_trend_strength(self, slope: float, r2: float) -> str:
        """计算趋势强度"""
        if r2 < 0.3:
            return 'VERY_WEAK'
        elif r2 < 0.5:
            return 'WEAK'
        elif r2 < 0.7:
            return 'MODERATE'
        elif r2 < 0.85:
            return 'STRONG'
        else:
            return 'VERY_STRONG'

    def _calculate_support_resistance(self, prices: pd.Series) -> Tuple[float, float]:
        """计算支撑位和阻力位"""
        if len(prices) < 20:
            return float(prices.min()), float(prices.max())

        # 使用最近20个交易日的价格
        recent_prices = prices.iloc[-20:]

        # 支撑位：最近20日最低价
        support = recent_prices.min()

        # 阻力位：最近20日最高价
        resistance = recent_prices.max()

        return float(support), float(resistance)

    def _get_composite_trend(self, trend_results: Dict) -> Dict:
        """综合多个周期的趋势判断"""
        if not trend_results:
            return {'type': 'UNKNOWN', 'confidence': 0}

        # 统计各趋势类型的数量
        trend_counts = {}
        for key, result in trend_results.items():
            if key.startswith('trend_'):
                trend_type = result['type']
                trend_counts[trend_type] = trend_counts.get(trend_type, 0) + 1

        if not trend_counts:
            return {'type': 'UNKNOWN', 'confidence': 0}

        # 找到最多的趋势类型
        main_trend = max(trend_counts.items(), key=lambda x: x[1])[0]
        confidence = trend_counts[main_trend] / len([k for k in trend_results if k.startswith('trend_')])

        # 计算平均斜度和强度
        slopes = []
        strengths = []
        for key, result in trend_results.items():
            if key.startswith('trend_'):
                slopes.append(result['slope'])
                strengths.append(self._strength_to_numeric(result['strength']))

        avg_slope = np.mean(slopes) if slopes else 0
        avg_strength = np.mean(strengths) if strengths else 0

        return {
            'type': main_trend,
            'confidence': float(confidence),
            'avg_slope': float(avg_slope),
            'avg_strength': float(avg_strength),
            'trend_counts': trend_counts
        }

    def _strength_to_numeric(self, strength: str) -> float:
        """将趋势强度转换为数值"""
        strength_map = {
            'VERY_WEAK': 0.2,
            'WEAK': 0.4,
            'MODERATE': 0.6,
            'STRONG': 0.8,
            'VERY_STRONG': 1.0
        }
        return strength_map.get(strength, 0.5)

    async def detect_trend_reversal(self, close_prices: pd.Series,
                                  short_period: int = 5,
                                  long_period: int = 20) -> Dict:
        """
        检测趋势反转信号

        Args:
            close_prices: 收盘价序列
            short_period: 短期移动平均周期
            long_period: 长期移动平均周期

        Returns:
            反转信号分析结果
        """
        if len(close_prices) < long_period:
            return {'signal': 'INSUFFICIENT_DATA', 'confidence': 0}

        # 计算移动平均线
        ma_short = close_prices.rolling(window=short_period).mean()
        ma_long = close_prices.rolling(window=long_period).mean()

        # 检测金叉和死叉
        golden_cross = (ma_short.iloc[-2] <= ma_long.iloc[-2] and
                       ma_short.iloc[-1] > ma_long.iloc[-1])
        death_cross = (ma_short.iloc[-2] >= ma_long.iloc[-2] and
                      ma_short.iloc[-1] < ma_long.iloc[-1])

        # 计算价格与均线的距离
        price = close_prices.iloc[-1]
        distance_to_short = (price - ma_short.iloc[-1]) / ma_short.iloc[-1]
        distance_to_long = (price - ma_long.iloc[-1]) / ma_long.iloc[-1]

        # 判断信号
        if golden_cross:
            signal = 'GOLDEN_CROSS'
            confidence = min(0.7 + abs(distance_to_long) * 10, 0.95)
        elif death_cross:
            signal = 'DEATH_CROSS'
            confidence = min(0.7 + abs(distance_to_long) * 10, 0.95)
        elif distance_to_short > 0.05 and distance_to_long > 0.1:
            signal = 'STRONG_UPTREND'
            confidence = 0.8
        elif distance_to_short < -0.05 and distance_to_long < -0.1:
            signal = 'STRONG_DOWNTREND'
            confidence = 0.8
        else:
            signal = 'NO_CLEAR_SIGNAL'
            confidence = 0.3

        return {
            'signal': signal,
            'confidence': float(confidence),
            'price': float(price),
            'ma_short': float(ma_short.iloc[-1]),
            'ma_long': float(ma_long.iloc[-1]),
            'distance_to_short': float(distance_to_short),
            'distance_to_long': float(distance_to_long),
            'golden_cross': golden_cross,
            'death_cross': death_cross
        }

    async def calculate_trend_quality(self, close_prices: pd.Series) -> Dict:
        """计算趋势质量指标"""
        if len(close_prices) < 30:
            return {'quality': 'INSUFFICIENT_DATA', 'score': 0}

        # 计算多个质量指标
        volatility = close_prices.pct_change().std() * np.sqrt(252)  # 年化波动率
        sharpe_ratio = close_prices.pct_change().mean() / close_prices.pct_change().std() * np.sqrt(252) if close_prices.pct_change().std() > 0 else 0

        # 计算趋势连续性
        returns = close_prices.pct_change().dropna()
        positive_days = (returns > 0).sum()
        negative_days = (returns < 0).sum()
        continuity = abs(positive_days - negative_days) / len(returns)

        # 计算最大回撤
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        max_drawdown = drawdown.min()

        # 综合评分
        score = self._calculate_trend_quality_score(
            abs(sharpe_ratio), continuity, abs(max_drawdown)
        )

        quality_level = self._classify_quality_level(score)

        return {
            'quality': quality_level,
            'score': float(score),
            'volatility': float(volatility),
            'sharpe_ratio': float(sharpe_ratio),
            'continuity': float(continuity),
            'max_drawdown': float(max_drawdown),
            'positive_days': int(positive_days),
            'negative_days': int(negative_days),
            'total_days': len(returns)
        }

    def _calculate_trend_quality_score(self, sharpe: float, continuity: float, max_dd: float) -> float:
        """计算趋势质量综合评分"""
        # 标准化各项指标
        sharpe_score = min(sharpe * 10, 10)  # 夏普比率贡献
        continuity_score = continuity * 10  # 连续性贡献
        dd_score = max(0, 10 - max_dd * 100)  # 最大回撤贡献（回撤越小越好）

        # 加权平均
        total_score = (sharpe_score * 0.4 + continuity_score * 0.3 + dd_score * 0.3)

        return min(total_score, 10)

    def _classify_quality_level(self, score: float) -> str:
        """根据评分分类趋势质量"""
        if score >= 8:
            return 'EXCELLENT'
        elif score >= 6:
            return 'GOOD'
        elif score >= 4:
            return 'FAIR'
        elif score >= 2:
            return 'POOR'
        else:
            return 'VERY_POOR'