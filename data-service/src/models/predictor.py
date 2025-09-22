from loguru import logger

class BuySignalPredictor:
    def __init__(self):
        self.confidence_threshold = 0.7

    async def predict_buy_signal(self, stock_code: str, features: dict) -> dict:
        """Predict buy signal based on features"""
        try:
            # Placeholder implementation - to be replaced with actual ML model
            volume_score = self._score_volume(features.get('volume_ratio', 1.0))
            price_score = self._score_price_action(features.get('price_change', 0.0))
            fund_score = self._score_fund_flow(features.get('main_fund_flow', 0.0))

            # Simple weighted scoring
            total_score = (volume_score * 0.4 + price_score * 0.3 + fund_score * 0.3)
            confidence = min(total_score / 100.0, 1.0)

            signal_type = "观察"
            if confidence > 0.8:
                signal_type = "强烈买入"
            elif confidence > 0.6:
                signal_type = "买入"
            elif confidence > 0.4:
                signal_type = "关注"

            result = {
                "stock_code": stock_code,
                "signal_type": signal_type,
                "confidence": float(confidence),
                "volume_score": volume_score,
                "price_score": price_score,
                "fund_score": fund_score,
                "recommendation": self._generate_recommendation(signal_type, confidence)
            }

            logger.info(f"Buy signal prediction completed for {stock_code}: {signal_type}")
            return result

        except Exception as e:
            logger.error(f"Error predicting buy signal for {stock_code}: {e}")
            return {"error": str(e)}

    def _score_volume(self, volume_ratio: float) -> float:
        """Score volume activity (0-100)"""
        if volume_ratio > 3.0:
            return 90
        elif volume_ratio > 2.0:
            return 75
        elif volume_ratio > 1.5:
            return 60
        elif volume_ratio > 1.0:
            return 40
        else:
            return 20

    def _score_price_action(self, price_change: float) -> float:
        """Score price action (0-100)"""
        if price_change > 5:
            return 80
        elif price_change > 2:
            return 70
        elif price_change > 0:
            return 60
        elif price_change > -2:
            return 40
        else:
            return 20

    def _score_fund_flow(self, main_fund_flow: float) -> float:
        """Score fund flow (0-100)"""
        if main_fund_flow > 10000000:  # 1000万
            return 90
        elif main_fund_flow > 5000000:  # 500万
            return 75
        elif main_fund_flow > 1000000:  # 100万
            return 60
        elif main_fund_flow > 0:
            return 50
        else:
            return 30

    def _generate_recommendation(self, signal_type: str, confidence: float) -> str:
        """Generate recommendation text"""
        if signal_type == "强烈买入":
            return f"多项指标显示强烈买入信号，建议重点关注（置信度{confidence:.1%}）"
        elif signal_type == "买入":
            return f"技术指标显示买入机会，建议适量买入（置信度{confidence:.1%}）"
        elif signal_type == "关注":
            return f"存在一定机会，建议持续关注（置信度{confidence:.1%}）"
        else:
            return f"暂无明确信号，建议观察（置信度{confidence:.1%}）"