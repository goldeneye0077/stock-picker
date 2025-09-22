import pandas as pd
from loguru import logger

class FundFlowAnalyzer:
    def __init__(self):
        self.main_fund_threshold = 1000000  # 100万元

    async def analyze_fund_flow(self, stock_code: str, flow_data: pd.DataFrame) -> dict:
        """Analyze fund flow patterns"""
        try:
            if flow_data.empty:
                return {"error": "No fund flow data available"}

            # Calculate net flows
            latest_data = flow_data.iloc[-1]

            # Calculate recent trends
            recent_7d = flow_data.tail(7)
            main_flow_7d = recent_7d['main_fund_flow'].sum()
            retail_flow_7d = recent_7d['retail_fund_flow'].sum()

            analysis_result = {
                "stock_code": stock_code,
                "latest_main_flow": float(latest_data['main_fund_flow']),
                "latest_retail_flow": float(latest_data['retail_fund_flow']),
                "main_flow_7d": float(main_flow_7d),
                "retail_flow_7d": float(retail_flow_7d),
                "is_main_inflow": main_flow_7d > 0,
                "flow_strength": self._calculate_flow_strength(main_flow_7d),
                "analysis_summary": self._generate_flow_summary(main_flow_7d, retail_flow_7d)
            }

            logger.info(f"Fund flow analysis completed for {stock_code}")
            return analysis_result

        except Exception as e:
            logger.error(f"Error analyzing fund flow for {stock_code}: {e}")
            return {"error": str(e)}

    def _calculate_flow_strength(self, main_flow_7d: float) -> str:
        """Calculate flow strength level"""
        abs_flow = abs(main_flow_7d)

        if abs_flow > 50000000:  # 5000万
            return "极强"
        elif abs_flow > 20000000:  # 2000万
            return "强"
        elif abs_flow > 5000000:  # 500万
            return "中等"
        elif abs_flow > 1000000:  # 100万
            return "弱"
        else:
            return "微弱"

    def _generate_flow_summary(self, main_flow_7d: float, retail_flow_7d: float) -> str:
        """Generate fund flow summary"""
        if main_flow_7d > 0:
            strength = self._calculate_flow_strength(main_flow_7d)
            return f"主力资金净流入，强度{strength}"
        elif main_flow_7d < 0:
            strength = self._calculate_flow_strength(main_flow_7d)
            return f"主力资金净流出，强度{strength}"
        else:
            return "主力资金流向平衡"