import pandas as pd
from loguru import logger

class VolumeAnalyzer:
    def __init__(self):
        self.threshold_ratio = 2.0  # Default volume surge threshold

    async def analyze_volume(self, stock_code: str, kline_data: pd.DataFrame) -> dict:
        """Analyze volume patterns for a stock"""
        try:
            if kline_data.empty or len(kline_data) < 20:
                return {"error": "Insufficient data for analysis"}

            # Calculate 20-day average volume
            kline_data['avg_volume_20'] = kline_data['volume'].rolling(window=20).mean()

            # Calculate volume ratio
            kline_data['volume_ratio'] = kline_data['volume'] / kline_data['avg_volume_20']

            # Identify volume surges
            kline_data['is_volume_surge'] = kline_data['volume_ratio'] > self.threshold_ratio

            latest_data = kline_data.iloc[-1]

            analysis_result = {
                "stock_code": stock_code,
                "latest_volume": int(latest_data['volume']),
                "avg_volume_20": int(latest_data['avg_volume_20']) if not pd.isna(latest_data['avg_volume_20']) else 0,
                "volume_ratio": float(latest_data['volume_ratio']) if not pd.isna(latest_data['volume_ratio']) else 0,
                "is_volume_surge": bool(latest_data['is_volume_surge']) if not pd.isna(latest_data['is_volume_surge']) else False,
                "surge_count_7d": int(kline_data.tail(7)['is_volume_surge'].sum()),
                "analysis_summary": self._generate_summary(latest_data)
            }

            logger.info(f"Volume analysis completed for {stock_code}")
            return analysis_result

        except Exception as e:
            logger.error(f"Error analyzing volume for {stock_code}: {e}")
            return {"error": str(e)}

    def _generate_summary(self, latest_data) -> str:
        """Generate analysis summary text"""
        if pd.isna(latest_data['volume_ratio']):
            return "数据不足，无法分析"

        volume_ratio = latest_data['volume_ratio']

        if volume_ratio > 3.0:
            return f"放量{volume_ratio:.1f}倍，异常活跃"
        elif volume_ratio > 2.0:
            return f"放量{volume_ratio:.1f}倍，明显放量"
        elif volume_ratio > 1.5:
            return f"温和放量{volume_ratio:.1f}倍"
        elif volume_ratio < 0.5:
            return f"缩量{volume_ratio:.1f}倍，成交清淡"
        else:
            return f"成交正常，量比{volume_ratio:.1f}倍"