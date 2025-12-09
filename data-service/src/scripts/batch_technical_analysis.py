"""
批量技术分析脚本
批量计算所有股票的技术指标、趋势分析和K线形态
"""

import asyncio
import pandas as pd
from datetime import datetime, timedelta
from loguru import logger
import sys
import os

# 添加项目根目录到Python路径
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))

from src.utils.database import get_database
from src.analyzers.technical import IndicatorCalculator, TrendAnalyzer, PatternRecognizer
from src.utils.technical_db import TechnicalDB


class BatchTechnicalAnalyzer:
    """批量技术分析器"""

    def __init__(self, batch_size: int = 10):
        self.batch_size = batch_size
        self.indicator_calculator = IndicatorCalculator()
        self.trend_analyzer = TrendAnalyzer()
        self.pattern_recognizer = PatternRecognizer()

    async def get_all_stocks(self) -> list:
        """获取所有股票列表"""
        try:
            async with get_database() as db:
                cursor = await db.execute("""
                    SELECT code, name FROM stocks
                    ORDER BY code
                """)
                stocks = await cursor.fetchall()
                return [{"code": row[0], "name": row[1]} for row in stocks]
        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

    async def get_stock_kline_data(self, stock_code: str, days: int = 200) -> pd.DataFrame:
        """获取股票K线数据"""
        try:
            async with get_database() as db:
                cursor = await db.execute("""
                    SELECT date, open, high, low, close, volume, amount
                    FROM klines
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT ?
                """, (stock_code, days))

                kline_data = await cursor.fetchall()

                if not kline_data:
                    return pd.DataFrame()

                df = pd.DataFrame(kline_data, columns=['date', 'open', 'high', 'low', 'close', 'volume', 'amount'])
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
                df.sort_index(inplace=True)

                return df

        except Exception as e:
            logger.error(f"获取K线数据失败: {stock_code}, 错误: {e}")
            return pd.DataFrame()

    async def analyze_single_stock(self, stock_code: str, stock_name: str) -> dict:
        """分析单只股票的技术指标"""
        try:
            logger.info(f"开始分析: {stock_code} {stock_name}")

            # 获取K线数据
            df = await self.get_stock_kline_data(stock_code)

            if df.empty or len(df) < 30:
                logger.warning(f"数据不足: {stock_code}, 跳过")
                return {"stock_code": stock_code, "status": "INSUFFICIENT_DATA"}

            # 获取最新日期
            latest_date = df.index[-1].strftime('%Y-%m-%d')

            # 检查是否已有数据
            existing_indicators = await TechnicalDB.get_technical_indicators(
                stock_code, latest_date, latest_date, 1
            )

            if existing_indicators:
                logger.info(f"技术指标已存在: {stock_code} {latest_date}, 跳过")
                return {"stock_code": stock_code, "status": "ALREADY_EXISTS", "date": latest_date}

            # 计算技术指标
            indicators = await self.indicator_calculator.calculate_all_indicators(df)

            if not indicators:
                logger.warning(f"技术指标计算失败: {stock_code}")
                return {"stock_code": stock_code, "status": "INDICATOR_FAILED"}

            # 获取指标信号
            indicator_signals = self.indicator_calculator.get_indicator_signals(indicators)

            # 合并指标和信号
            latest_indicators = {}
            for key, value in indicators.items():
                if isinstance(value, pd.Series) and not value.empty:
                    latest_indicators[key] = float(value.iloc[-1])

            # 添加信号
            latest_indicators.update(indicator_signals)

            # 保存技术指标数据
            indicator_success = await TechnicalDB.save_technical_indicators(
                stock_code, latest_date, latest_indicators
            )

            # 计算趋势分析
            close_prices = df['close']

            # 多周期趋势分析
            trend_results = await self.trend_analyzer.analyze_trend(close_prices)

            # 趋势反转检测
            reversal_signal = await self.trend_analyzer.detect_trend_reversal(close_prices)

            # 趋势质量评估
            trend_quality = await self.trend_analyzer.calculate_trend_quality(close_prices)

            # 合并趋势结果
            trend_data = {
                **trend_results,
                'reversal_signal': reversal_signal,
                'trend_quality': trend_quality
            }

            # 保存趋势分析数据
            trend_success = await TechnicalDB.save_trend_analysis(stock_code, latest_date, trend_data)

            # 检测K线形态
            patterns = await self.pattern_recognizer.detect_all_patterns(df)

            # 生成形态信号
            pattern_signals = await self.pattern_recognizer.get_pattern_signals(patterns)

            # 合并形态结果
            pattern_data = {
                **patterns,
                'pattern_signals': pattern_signals
            }

            # 保存K线形态信号
            pattern_success = await TechnicalDB.save_pattern_signals(stock_code, latest_date, pattern_data)

            # 生成综合评分
            composite_score = await self._calculate_composite_score(
                latest_indicators, trend_data, pattern_data
            )

            logger.info(f"分析完成: {stock_code}, 综合评分: {composite_score:.2f}")

            return {
                "stock_code": stock_code,
                "status": "SUCCESS",
                "date": latest_date,
                "composite_score": composite_score,
                "indicators_saved": indicator_success,
                "trend_saved": trend_success,
                "patterns_saved": pattern_success
            }

        except Exception as e:
            logger.error(f"分析股票失败: {stock_code}, 错误: {e}")
            return {"stock_code": stock_code, "status": "ERROR", "error": str(e)}

    async def _calculate_composite_score(self, indicators: dict, trend_data: dict, pattern_data: dict) -> float:
        """计算综合技术评分"""
        composite_score = 0

        # 技术指标评分 (权重40%)
        tech_score = 0
        if indicators:
            # MACD信号评分
            macd_score = 0
            if indicators.get('macd_signal') == 'BULLISH':
                macd_score = 80
            elif indicators.get('macd_signal') == 'BEARISH':
                macd_score = 20
            else:
                macd_score = 50

            # RSI信号评分
            rsi_score = 0
            rsi_signal = indicators.get('rsi_signal')
            if rsi_signal == 'OVERSOLD':
                rsi_score = 90
            elif rsi_signal == 'OVERBOUGHT':
                rsi_score = 10
            else:
                rsi_score = 50

            # KDJ信号评分
            kdj_score = 0
            kdj_signal = indicators.get('kdj_signal')
            if kdj_signal == 'OVERSOLD':
                kdj_score = 90
            elif kdj_signal == 'OVERBOUGHT':
                kdj_score = 10
            elif kdj_signal == 'BULLISH':
                kdj_score = 70
            elif kdj_signal == 'BEARISH':
                kdj_score = 30
            else:
                kdj_score = 50

            # 移动平均线趋势评分
            ma_score = 0
            ma_signal = indicators.get('ma_trend_signal', '')
            if 'STRONG_UPTREND' in ma_signal:
                ma_score = 90
            elif 'UPTREND' in ma_signal:
                ma_score = 70
            elif 'DOWNTREND' in ma_signal:
                ma_score = 30
            elif 'STRONG_DOWNTREND' in ma_signal:
                ma_score = 10
            else:
                ma_score = 50

            tech_score = (macd_score * 0.3 + rsi_score * 0.25 + kdj_score * 0.25 + ma_score * 0.2)

        # 趋势分析评分 (权重30%)
        trend_score = 0
        if trend_data:
            composite_trend = trend_data.get('composite_trend', {})
            trend_type = composite_trend.get('type', 'UNKNOWN')
            trend_confidence = composite_trend.get('confidence', 0)

            if trend_type == 'STRONG_UPTREND':
                trend_score = 90 * trend_confidence
            elif trend_type == 'UPTREND':
                trend_score = 70 * trend_confidence
            elif trend_type == 'DOWNTREND':
                trend_score = 30 * trend_confidence
            elif trend_type == 'STRONG_DOWNTREND':
                trend_score = 10 * trend_confidence
            else:
                trend_score = 50 * trend_confidence

            # 趋势质量评分
            quality = trend_data.get('trend_quality', {})
            quality_score = quality.get('score', 0) * 10  # 转换为百分制

            trend_composite = (trend_score * 0.6 + quality_score * 0.4)

        # K线形态评分 (权重30%)
        pattern_score = 0
        if pattern_data:
            patterns = pattern_data
            pattern_signal = pattern_data.get('pattern_signals', {}).get('PATTERN', 'NEUTRAL')

            if pattern_signal == 'BULLISH':
                pattern_score = 80
            elif pattern_signal == 'BEARISH':
                pattern_score = 20
            else:
                pattern_score = 50

        # 综合评分
        composite_score = (tech_score * 0.4 + trend_composite * 0.3 + pattern_score * 0.3)

        return composite_score

    async def analyze_batch(self, stocks: list, start_idx: int = 0) -> dict:
        """批量分析股票"""
        total = len(stocks)
        success_count = 0
        skip_count = 0
        error_count = 0
        results = []

        logger.info(f"开始批量分析，共{total}只股票，批次大小: {self.batch_size}")

        for i in range(start_idx, total, self.batch_size):
            batch = stocks[i:i + self.batch_size]
            batch_tasks = []

            for stock in batch:
                task = self.analyze_single_stock(stock['code'], stock['name'])
                batch_tasks.append(task)

            # 并行执行批次任务
            batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

            for j, result in enumerate(batch_results):
                stock_idx = i + j
                if isinstance(result, Exception):
                    logger.error(f"股票分析异常: {batch[j]['code']}, 错误: {result}")
                    error_count += 1
                    results.append({
                        "index": stock_idx,
                        "stock_code": batch[j]['code'],
                        "status": "EXCEPTION",
                        "error": str(result)
                    })
                else:
                    status = result.get('status', 'UNKNOWN')
                    if status == 'SUCCESS':
                        success_count += 1
                    elif status == 'ALREADY_EXISTS':
                        skip_count += 1
                    elif status == 'INSUFFICIENT_DATA':
                        skip_count += 1
                    else:
                        error_count += 1

                    results.append({
                        "index": stock_idx,
                        **result
                    })

            # 输出进度
            processed = min(i + self.batch_size, total)
            progress = processed / total * 100
            logger.info(f"进度: {processed}/{total} ({progress:.1f}%) - "
                       f"成功: {success_count}, 跳过: {skip_count}, 失败: {error_count}")

            # 小延迟避免过载
            await asyncio.sleep(0.5)

        return {
            "total": total,
            "success": success_count,
            "skip": skip_count,
            "error": error_count,
            "results": results
        }

    async def generate_summary_report(self, analysis_results: dict) -> str:
        """生成分析总结报告"""
        total = analysis_results['total']
        success = analysis_results['success']
        skip = analysis_results['skip']
        error = analysis_results['error']

        # 计算平均综合评分
        scores = []
        for result in analysis_results['results']:
            if result.get('composite_score'):
                scores.append(result['composite_score'])

        avg_score = sum(scores) / len(scores) if scores else 0

        # 统计信号分布
        signal_counts = {'BULLISH': 0, 'BEARISH': 0, 'NEUTRAL': 0}
        trend_counts = {'STRONG_UPTREND': 0, 'UPTREND': 0, 'SIDEWAYS': 0, 'DOWNTREND': 0, 'STRONG_DOWNTREND': 0}

        # 这里可以添加从数据库查询信号分布的代码
        # 暂时使用占位符

        report = f"""
批量技术分析报告
================

分析时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
分析股票总数: {total}

分析结果统计:
- 成功分析: {success} ({success/total*100:.1f}%)
- 跳过(数据不足/已存在): {skip} ({skip/total*100:.1f}%)
- 分析失败: {error} ({error/total*100:.1f}%)

综合评分统计:
- 平均综合评分: {avg_score:.2f}/100
- 最高评分: {max(scores) if scores else 0:.2f}
- 最低评分: {min(scores) if scores else 0:.2f}

信号分布统计:
- 看涨信号: {signal_counts['BULLISH']}
- 看跌信号: {signal_counts['BEARISH']}
- 中性信号: {signal_counts['NEUTRAL']}

趋势分布统计:
- 强势上涨: {trend_counts['STRONG_UPTREND']}
- 上涨趋势: {trend_counts['UPTREND']}
- 横盘整理: {trend_counts['SIDEWAYS']}
- 下跌趋势: {trend_counts['DOWNTREND']}
- 强势下跌: {trend_counts['STRONG_DOWNTREND']}

建议:
1. 综合评分 > 80 的股票建议重点关注
2. 有看涨信号且趋势向上的股票可作为买入候选
3. 有看跌信号且趋势向下的股票建议回避
4. 数据不足的股票建议补充数据后重新分析
"""

        return report


async def main():
    """主函数"""
    logger.info("开始批量技术分析")

    # 创建分析器
    analyzer = BatchTechnicalAnalyzer(batch_size=5)

    # 获取所有股票
    stocks = await analyzer.get_all_stocks()

    if not stocks:
        logger.error("未找到股票数据")
        return

    logger.info(f"找到 {len(stocks)} 只股票")

    # 批量分析
    results = await analyzer.analyze_batch(stocks)

    # 生成报告
    report = await analyzer.generate_summary_report(results)

    # 保存报告
    report_file = f"technical_analysis_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)

    logger.info(f"分析完成，报告已保存到: {report_file}")
    print(report)


if __name__ == "__main__":
    asyncio.run(main())