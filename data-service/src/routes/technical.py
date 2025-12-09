"""
技术分析API路由
提供技术指标、趋势分析、K线形态的API接口
"""

from fastapi import APIRouter, HTTPException, Query
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from loguru import logger

from ..analyzers.technical import IndicatorCalculator, TrendAnalyzer, PatternRecognizer
from ..utils.technical_db import TechnicalDB
from ..utils.database import get_database

router = APIRouter()

# 初始化分析器
indicator_calculator = IndicatorCalculator()
trend_analyzer = TrendAnalyzer()
pattern_recognizer = PatternRecognizer()


@router.get("/indicators/{stock_code}")
async def get_technical_indicators(
    stock_code: str,
    start_date: Optional[str] = Query(None, description="开始日期 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="结束日期 (YYYY-MM-DD)"),
    limit: int = Query(100, description="返回记录数限制")
):
    """
    获取股票的技术指标数据

    Args:
        stock_code: 股票代码
        start_date: 开始日期
        end_date: 结束日期
        limit: 返回记录数限制
    """
    try:
        # 从数据库获取技术指标数据
        indicators = await TechnicalDB.get_technical_indicators(
            stock_code, start_date, end_date, limit
        )

        if not indicators:
            return {
                "success": True,
                "message": "未找到技术指标数据",
                "data": []
            }

        return {
            "success": True,
            "data": indicators
        }

    except Exception as e:
        logger.error(f"获取技术指标失败: {stock_code}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"获取技术指标失败: {str(e)}")


@router.get("/trend/{stock_code}")
async def get_trend_analysis(
    stock_code: str,
    date: Optional[str] = Query(None, description="日期 (YYYY-MM-DD)，如果为None则获取最新数据")
):
    """
    获取股票的趋势分析数据

    Args:
        stock_code: 股票代码
        date: 日期
    """
    try:
        # 从数据库获取趋势分析数据
        trend_data = await TechnicalDB.get_trend_analysis(stock_code, date)

        if not trend_data:
            return {
                "success": True,
                "message": "未找到趋势分析数据",
                "data": {}
            }

        return {
            "success": True,
            "data": trend_data
        }

    except Exception as e:
        logger.error(f"获取趋势分析失败: {stock_code}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"获取趋势分析失败: {str(e)}")


@router.get("/patterns/{stock_code}")
async def get_pattern_signals(
    stock_code: str,
    date: Optional[str] = Query(None, description="日期 (YYYY-MM-DD)，如果为None则获取最新数据"),
    pattern_type: Optional[str] = Query(None, description="形态类型")
):
    """
    获取股票的K线形态信号

    Args:
        stock_code: 股票代码
        date: 日期
        pattern_type: 形态类型
    """
    try:
        # 从数据库获取K线形态信号
        patterns = await TechnicalDB.get_pattern_signals(stock_code, date, pattern_type)

        if not patterns:
            return {
                "success": True,
                "message": "未找到K线形态信号",
                "data": []
            }

        return {
            "success": True,
            "data": patterns
        }

    except Exception as e:
        logger.error(f"获取K线形态信号失败: {stock_code}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"获取K线形态信号失败: {str(e)}")


@router.post("/analyze/{stock_code}")
async def analyze_stock_technical(
    stock_code: str,
    recalculate: bool = Query(False, description="是否重新计算技术指标")
):
    """
    分析股票的技术指标、趋势和K线形态

    Args:
        stock_code: 股票代码
        recalculate: 是否重新计算技术指标
    """
    try:
        # 获取K线数据
        async with get_database() as db:
            cursor = await db.execute("""
                SELECT date, open, high, low, close, volume, amount
                FROM klines
                WHERE stock_code = ?
                ORDER BY date DESC
                LIMIT 200
            """, (stock_code,))

            kline_data = await cursor.fetchall()

            if not kline_data or len(kline_data) < 30:
                return {
                    "success": False,
                    "message": "K线数据不足，至少需要30个交易日数据"
                }

        # 转换为DataFrame
        import pandas as pd
        df = pd.DataFrame(kline_data, columns=['date', 'open', 'high', 'low', 'close', 'volume', 'amount'])
        df['date'] = pd.to_datetime(df['date'])
        df.set_index('date', inplace=True)
        df.sort_index(inplace=True)

        # 获取最新日期
        latest_date = df.index[-1].strftime('%Y-%m-%d')

        # 检查是否已有数据且不需要重新计算
        if not recalculate:
            existing_indicators = await TechnicalDB.get_technical_indicators(
                stock_code, latest_date, latest_date, 1
            )
            if existing_indicators:
                return {
                    "success": True,
                    "message": "技术指标已存在，如需重新计算请设置recalculate=true",
                    "data": {
                        "date": latest_date,
                        "indicators_exist": True,
                        "trend_exist": True,
                        "patterns_exist": True
                    }
                }

        # 计算技术指标
        indicators = await indicator_calculator.calculate_all_indicators(df)

        if not indicators:
            return {
                "success": False,
                "message": "技术指标计算失败"
            }

        # 获取指标信号
        indicator_signals = indicator_calculator.get_indicator_signals(indicators)

        # 合并指标和信号
        latest_indicators = {}
        for key, value in indicators.items():
            if isinstance(value, pd.Series) and not value.empty:
                latest_indicators[key] = float(value.iloc[-1])

        # 添加信号
        latest_indicators.update(indicator_signals)

        # 保存技术指标数据
        await TechnicalDB.save_technical_indicators(stock_code, latest_date, latest_indicators)

        # 计算趋势分析
        close_prices = df['close']

        # 多周期趋势分析
        trend_results = await trend_analyzer.analyze_trend(close_prices)

        # 趋势反转检测
        reversal_signal = await trend_analyzer.detect_trend_reversal(close_prices)

        # 趋势质量评估
        trend_quality = await trend_analyzer.calculate_trend_quality(close_prices)

        # 合并趋势结果
        trend_data = {
            **trend_results,
            'reversal_signal': reversal_signal,
            'trend_quality': trend_quality
        }

        # 保存趋势分析数据
        await TechnicalDB.save_trend_analysis(stock_code, latest_date, trend_data)

        # 检测K线形态
        patterns = await pattern_recognizer.detect_all_patterns(df)

        # 生成形态信号
        pattern_signals = await pattern_recognizer.get_pattern_signals(patterns)

        # 合并形态结果
        pattern_data = {
            **patterns,
            'pattern_signals': pattern_signals
        }

        # 保存K线形态信号
        await TechnicalDB.save_pattern_signals(stock_code, latest_date, pattern_data)

        return {
            "success": True,
            "message": "技术分析完成",
            "data": {
                "date": latest_date,
                "indicators": {k: v for k, v in latest_indicators.items() if not isinstance(v, str) or len(v) < 50},
                "trend_summary": {
                    "composite_trend": trend_results.get('composite_trend', {}).get('type', 'UNKNOWN'),
                    "composite_confidence": trend_results.get('composite_trend', {}).get('confidence', 0),
                    "reversal_signal": reversal_signal.get('signal', 'NO_CLEAR_SIGNAL'),
                    "reversal_confidence": reversal_signal.get('confidence', 0),
                    "trend_quality": trend_quality.get('quality', 'INSUFFICIENT_DATA'),
                    "trend_quality_score": trend_quality.get('score', 0)
                },
                "pattern_summary": {
                    "total_patterns": sum(len(p) for p in patterns.values()),
                    "pattern_signal": pattern_signals.get('PATTERN', 'NEUTRAL'),
                    "bullish_count": pattern_signals.get('BULLISH_COUNT', 0),
                    "bearish_count": pattern_signals.get('BEARISH_COUNT', 0)
                }
            }
        }

    except Exception as e:
        logger.error(f"技术分析失败: {stock_code}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"技术分析失败: {str(e)}")


@router.get("/signals/{signal_type}")
async def get_stocks_with_signals(
    signal_type: str,
    date: Optional[str] = Query(None, description="日期 (YYYY-MM-DD)，如果为None则获取最新数据"),
    min_confidence: float = Query(0.7, description="最小置信度", ge=0.0, le=1.0),
    limit: int = Query(50, description="返回记录数限制")
):
    """
    获取有特定技术信号的股票列表

    Args:
        signal_type: 信号类型 ('BULLISH', 'BEARISH', 'OVERBOUGHT', 'OVERSOLD'等)
        date: 日期
        min_confidence: 最小置信度
        limit: 返回记录数限制
    """
    try:
        # 验证信号类型
        valid_signals = ['BULLISH', 'BEARISH', 'OVERBOUGHT', 'OVERSOLD',
                        'GOLDEN_CROSS', 'DEATH_CROSS', 'STRONG_UPTREND', 'STRONG_DOWNTREND']

        if signal_type not in valid_signals:
            return {
                "success": False,
                "message": f"无效的信号类型，有效类型: {', '.join(valid_signals)}"
            }

        # 获取有信号的股票列表
        stocks = await TechnicalDB.get_stocks_with_signals(
            signal_type, date, min_confidence, limit
        )

        if not stocks:
            return {
                "success": True,
                "message": f"未找到有{signal_type}信号的股票",
                "data": []
            }

        return {
            "success": True,
            "data": stocks
        }

    except Exception as e:
        logger.error(f"获取信号股票列表失败: {signal_type}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"获取信号股票列表失败: {str(e)}")


@router.get("/comprehensive/{stock_code}")
async def get_comprehensive_analysis(stock_code: str):
    """
    获取股票的综合技术分析报告

    Args:
        stock_code: 股票代码
    """
    try:
        # 获取技术指标
        indicators = await TechnicalDB.get_technical_indicators(stock_code, limit=1)

        # 获取趋势分析
        trend = await TechnicalDB.get_trend_analysis(stock_code)

        # 获取K线形态
        patterns = await TechnicalDB.get_pattern_signals(stock_code)

        # 生成综合评分
        composite_score = 0
        score_factors = []

        # 技术指标评分 (权重40%)
        if indicators:
            latest = indicators[0]

            # MACD信号评分
            macd_score = 0
            if latest.get('macd_signal') == 'BULLISH':
                macd_score = 80
            elif latest.get('macd_signal') == 'BEARISH':
                macd_score = 20
            else:
                macd_score = 50

            # RSI信号评分
            rsi_score = 0
            rsi_signal = latest.get('rsi_signal')
            if rsi_signal == 'OVERSOLD':
                rsi_score = 90
            elif rsi_signal == 'OVERBOUGHT':
                rsi_score = 10
            else:
                rsi_score = 50

            # KDJ信号评分
            kdj_score = 0
            kdj_signal = latest.get('kdj_signal')
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
            ma_signal = latest.get('ma_trend_signal', '')
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

            # 技术指标综合评分
            tech_score = (macd_score * 0.3 + rsi_score * 0.25 + kdj_score * 0.25 + ma_score * 0.2)
            composite_score += tech_score * 0.4
            score_factors.append({
                "name": "技术指标",
                "score": tech_score,
                "weight": 40
            })

        # 趋势分析评分 (权重30%)
        if trend:
            trend_score = 0

            # 综合趋势评分
            trend_type = trend.get('composite_trend_type', 'UNKNOWN')
            trend_confidence = trend.get('composite_confidence', 0)

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
            quality_score = trend.get('trend_quality_score', 0) * 10  # 转换为百分制

            # 趋势分析综合评分
            trend_composite = (trend_score * 0.6 + quality_score * 0.4)
            composite_score += trend_composite * 0.3
            score_factors.append({
                "name": "趋势分析",
                "score": trend_composite,
                "weight": 30
            })

        # K线形态评分 (权重30%)
        if patterns:
            pattern_score = 0

            # 统计看涨和看跌形态
            bullish_count = 0
            bearish_count = 0

            for pattern in patterns:
                pattern_type = pattern.get('pattern_name', '')
                confidence = pattern.get('confidence', 0.5)

                bullish_patterns = ['HAMMER', 'INVERTED_HAMMER', 'BULLISH_ENGULFING',
                                  'MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_HARAMI']
                bearish_patterns = ['SHOOTING_STAR', 'HANGING_MAN', 'BEARISH_ENGULFING',
                                  'EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_HARAMI']

                if pattern_type in bullish_patterns:
                    bullish_count += 1
                    pattern_score += confidence * 100
                elif pattern_type in bearish_patterns:
                    bearish_count += 1
                    pattern_score += (1 - confidence) * 100

            # 计算平均形态评分
            total_patterns = len(patterns)
            if total_patterns > 0:
                pattern_avg_score = pattern_score / total_patterns
            else:
                pattern_avg_score = 50

            composite_score += pattern_avg_score * 0.3
            score_factors.append({
                "name": "K线形态",
                "score": pattern_avg_score,
                "weight": 30
            })

        # 生成综合建议
        recommendation = ""
        if composite_score >= 80:
            recommendation = "强烈买入"
        elif composite_score >= 60:
            recommendation = "买入"
        elif composite_score >= 40:
            recommendation = "观望"
        elif composite_score >= 20:
            recommendation = "卖出"
        else:
            recommendation = "强烈卖出"

        return {
            "success": True,
            "data": {
                "stock_code": stock_code,
                "composite_score": round(composite_score, 2),
                "recommendation": recommendation,
                "score_factors": score_factors,
                "indicators_summary": indicators[0] if indicators else {},
                "trend_summary": {
                    "composite_trend": trend.get('composite_trend_type', 'UNKNOWN'),
                    "composite_confidence": trend.get('composite_confidence', 0),
                    "reversal_signal": trend.get('reversal_signal', 'NO_CLEAR_SIGNAL'),
                    "trend_quality": trend.get('trend_quality', 'INSUFFICIENT_DATA')
                } if trend else {},
                "patterns_summary": {
                    "total_patterns": len(patterns),
                    "bullish_count": sum(1 for p in patterns if p.get('pattern_name') in
                                        ['HAMMER', 'INVERTED_HAMMER', 'BULLISH_ENGULFING',
                                         'MORNING_STAR', 'THREE_WHITE_SOLDIERS', 'BULLISH_HARAMI']),
                    "bearish_count": sum(1 for p in patterns if p.get('pattern_name') in
                                        ['SHOOTING_STAR', 'HANGING_MAN', 'BEARISH_ENGULFING',
                                         'EVENING_STAR', 'THREE_BLACK_CROWS', 'BEARISH_HARAMI'])
                } if patterns else {}
            }
        }

    except Exception as e:
        logger.error(f"获取综合技术分析失败: {stock_code}, 错误: {e}")
        raise HTTPException(status_code=500, detail=f"获取综合技术分析失败: {str(e)}")