"""
技术指标数据库操作工具
提供技术指标、趋势分析、K线形态的数据库操作功能
"""

import aiosqlite
from datetime import datetime
from typing import Dict, List, Optional, Any
from pathlib import Path
from loguru import logger

from ..utils.database import get_database


class TechnicalDB:
    """技术指标数据库操作类"""

    @staticmethod
    async def save_technical_indicators(stock_code: str, date: str,
                                       indicators: Dict[str, Any]) -> bool:
        """
        保存技术指标数据

        Args:
            stock_code: 股票代码
            date: 日期 (YYYY-MM-DD)
            indicators: 技术指标字典

        Returns:
            是否保存成功
        """
        try:
            async with get_database() as db:
                # 检查是否已存在
                cursor = await db.execute(
                    "SELECT id FROM technical_indicators WHERE stock_code = ? AND date = ?",
                    (stock_code, date)
                )
                existing = await cursor.fetchone()

                if existing:
                    # 更新现有记录
                    await db.execute("""
                        UPDATE technical_indicators SET
                            ma5 = ?, ma10 = ?, ma20 = ?, ma30 = ?, ma60 = ?,
                            macd = ?, macd_signal = ?, macd_hist = ?,
                            rsi6 = ?, rsi12 = ?, rsi24 = ?,
                            kdj_k = ?, kdj_d = ?, kdj_j = ?,
                            boll_upper = ?, boll_middle = ?, boll_lower = ?,
                            atr = ?, cci = ?, obv = ?, volume_ratio = ?,
                            macd_signal = ?, rsi_signal = ?, kdj_signal = ?,
                            boll_signal = ?, ma_trend_signal = ?,
                            created_at = CURRENT_TIMESTAMP
                        WHERE stock_code = ? AND date = ?
                    """, (
                        indicators.get('MA5'),
                        indicators.get('MA10'),
                        indicators.get('MA20'),
                        indicators.get('MA30'),
                        indicators.get('MA60'),
                        indicators.get('MACD'),
                        indicators.get('MACD_SIGNAL'),
                        indicators.get('MACD_HIST'),
                        indicators.get('RSI6'),
                        indicators.get('RSI12'),
                        indicators.get('RSI24'),
                        indicators.get('KDJ_K'),
                        indicators.get('KDJ_D'),
                        indicators.get('KDJ_J'),
                        indicators.get('BOLL_UPPER'),
                        indicators.get('BOLL_MIDDLE'),
                        indicators.get('BOLL_LOWER'),
                        indicators.get('ATR'),
                        indicators.get('CCI'),
                        indicators.get('OBV'),
                        indicators.get('VOLUME_RATIO'),
                        indicators.get('macd_signal'),
                        indicators.get('rsi_signal'),
                        indicators.get('kdj_signal'),
                        indicators.get('boll_signal'),
                        indicators.get('ma_trend_signal'),
                        stock_code, date
                    ))
                else:
                    # 插入新记录
                    await db.execute("""
                        INSERT INTO technical_indicators (
                            stock_code, date,
                            ma5, ma10, ma20, ma30, ma60,
                            macd, macd_signal, macd_hist,
                            rsi6, rsi12, rsi24,
                            kdj_k, kdj_d, kdj_j,
                            boll_upper, boll_middle, boll_lower,
                            atr, cci, obv, volume_ratio,
                            macd_signal, rsi_signal, kdj_signal,
                            boll_signal, ma_trend_signal
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        stock_code, date,
                        indicators.get('MA5'),
                        indicators.get('MA10'),
                        indicators.get('MA20'),
                        indicators.get('MA30'),
                        indicators.get('MA60'),
                        indicators.get('MACD'),
                        indicators.get('MACD_SIGNAL'),
                        indicators.get('MACD_HIST'),
                        indicators.get('RSI6'),
                        indicators.get('RSI12'),
                        indicators.get('RSI24'),
                        indicators.get('KDJ_K'),
                        indicators.get('KDJ_D'),
                        indicators.get('KDJ_J'),
                        indicators.get('BOLL_UPPER'),
                        indicators.get('BOLL_MIDDLE'),
                        indicators.get('BOLL_LOWER'),
                        indicators.get('ATR'),
                        indicators.get('CCI'),
                        indicators.get('OBV'),
                        indicators.get('VOLUME_RATIO'),
                        indicators.get('macd_signal'),
                        indicators.get('rsi_signal'),
                        indicators.get('kdj_signal'),
                        indicators.get('boll_signal'),
                        indicators.get('ma_trend_signal')
                    ))

                await db.commit()
                logger.info(f"技术指标数据保存成功: {stock_code} {date}")
                return True

        except Exception as e:
            logger.error(f"保存技术指标数据失败: {stock_code} {date}, 错误: {e}")
            return False

    @staticmethod
    async def save_trend_analysis(stock_code: str, date: str,
                                 trend_results: Dict[str, Any]) -> bool:
        """
        保存趋势分析数据

        Args:
            stock_code: 股票代码
            date: 日期 (YYYY-MM-DD)
            trend_results: 趋势分析结果字典

        Returns:
            是否保存成功
        """
        try:
            async with get_database() as db:
                # 检查是否已存在
                cursor = await db.execute(
                    "SELECT id FROM trend_analysis WHERE stock_code = ? AND date = ?",
                    (stock_code, date)
                )
                existing = await cursor.fetchone()

                # 提取趋势数据
                trend_5d = trend_results.get('trend_5d', {})
                trend_10d = trend_results.get('trend_10d', {})
                trend_20d = trend_results.get('trend_20d', {})
                trend_30d = trend_results.get('trend_30d', {})
                trend_60d = trend_results.get('trend_60d', {})
                composite = trend_results.get('composite_trend', {})
                reversal = trend_results.get('reversal_signal', {})
                quality = trend_results.get('trend_quality', {})

                if existing:
                    # 更新现有记录
                    await db.execute("""
                        UPDATE trend_analysis SET
                            -- 5日趋势
                            trend_5d_type = ?, trend_5d_slope = ?, trend_5d_r2 = ?, trend_5d_strength = ?,
                            -- 10日趋势
                            trend_10d_type = ?, trend_10d_slope = ?, trend_10d_r2 = ?, trend_10d_strength = ?,
                            -- 20日趋势
                            trend_20d_type = ?, trend_20d_slope = ?, trend_20d_r2 = ?, trend_20d_strength = ?,
                            -- 30日趋势
                            trend_30d_type = ?, trend_30d_slope = ?, trend_30d_r2 = ?, trend_30d_strength = ?,
                            -- 60日趋势
                            trend_60d_type = ?, trend_60d_slope = ?, trend_60d_r2 = ?, trend_60d_strength = ?,
                            -- 综合趋势
                            composite_trend_type = ?, composite_confidence = ?, composite_avg_slope = ?, composite_avg_strength = ?,
                            -- 趋势反转
                            reversal_signal = ?, reversal_confidence = ?, ma_short = ?, ma_long = ?,
                            distance_to_short = ?, distance_to_long = ?, golden_cross = ?, death_cross = ?,
                            -- 趋势质量
                            trend_quality = ?, trend_quality_score = ?, volatility = ?, sharpe_ratio = ?,
                            continuity = ?, max_drawdown = ?, positive_days = ?, negative_days = ?, total_days = ?,
                            created_at = CURRENT_TIMESTAMP
                        WHERE stock_code = ? AND date = ?
                    """, (
                        # 5日趋势
                        trend_5d.get('type'),
                        trend_5d.get('slope'),
                        trend_5d.get('r2'),
                        trend_5d.get('strength'),
                        # 10日趋势
                        trend_10d.get('type'),
                        trend_10d.get('slope'),
                        trend_10d.get('r2'),
                        trend_10d.get('strength'),
                        # 20日趋势
                        trend_20d.get('type'),
                        trend_20d.get('slope'),
                        trend_20d.get('r2'),
                        trend_20d.get('strength'),
                        # 30日趋势
                        trend_30d.get('type'),
                        trend_30d.get('slope'),
                        trend_30d.get('r2'),
                        trend_30d.get('strength'),
                        # 60日趋势
                        trend_60d.get('type'),
                        trend_60d.get('slope'),
                        trend_60d.get('r2'),
                        trend_60d.get('strength'),
                        # 综合趋势
                        composite.get('type'),
                        composite.get('confidence'),
                        composite.get('avg_slope'),
                        composite.get('avg_strength'),
                        # 趋势反转
                        reversal.get('signal'),
                        reversal.get('confidence'),
                        reversal.get('ma_short'),
                        reversal.get('ma_long'),
                        reversal.get('distance_to_short'),
                        reversal.get('distance_to_long'),
                        reversal.get('golden_cross'),
                        reversal.get('death_cross'),
                        # 趋势质量
                        quality.get('quality'),
                        quality.get('score'),
                        quality.get('volatility'),
                        quality.get('sharpe_ratio'),
                        quality.get('continuity'),
                        quality.get('max_drawdown'),
                        quality.get('positive_days'),
                        quality.get('negative_days'),
                        quality.get('total_days'),
                        stock_code, date
                    ))
                else:
                    # 插入新记录
                    await db.execute("""
                        INSERT INTO trend_analysis (
                            stock_code, date,
                            trend_5d_type, trend_5d_slope, trend_5d_r2, trend_5d_strength,
                            trend_10d_type, trend_10d_slope, trend_10d_r2, trend_10d_strength,
                            trend_20d_type, trend_20d_slope, trend_20d_r2, trend_20d_strength,
                            trend_30d_type, trend_30d_slope, trend_30d_r2, trend_30d_strength,
                            trend_60d_type, trend_60d_slope, trend_60d_r2, trend_60d_strength,
                            composite_trend_type, composite_confidence, composite_avg_slope, composite_avg_strength,
                            reversal_signal, reversal_confidence, ma_short, ma_long,
                            distance_to_short, distance_to_long, golden_cross, death_cross,
                            trend_quality, trend_quality_score, volatility, sharpe_ratio,
                            continuity, max_drawdown, positive_days, negative_days, total_days
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        stock_code, date,
                        # 5日趋势
                        trend_5d.get('type'),
                        trend_5d.get('slope'),
                        trend_5d.get('r2'),
                        trend_5d.get('strength'),
                        # 10日趋势
                        trend_10d.get('type'),
                        trend_10d.get('slope'),
                        trend_10d.get('r2'),
                        trend_10d.get('strength'),
                        # 20日趋势
                        trend_20d.get('type'),
                        trend_20d.get('slope'),
                        trend_20d.get('r2'),
                        trend_20d.get('strength'),
                        # 30日趋势
                        trend_30d.get('type'),
                        trend_30d.get('slope'),
                        trend_30d.get('r2'),
                        trend_30d.get('strength'),
                        # 60日趋势
                        trend_60d.get('type'),
                        trend_60d.get('slope'),
                        trend_60d.get('r2'),
                        trend_60d.get('strength'),
                        # 综合趋势
                        composite.get('type'),
                        composite.get('confidence'),
                        composite.get('avg_slope'),
                        composite.get('avg_strength'),
                        # 趋势反转
                        reversal.get('signal'),
                        reversal.get('confidence'),
                        reversal.get('ma_short'),
                        reversal.get('ma_long'),
                        reversal.get('distance_to_short'),
                        reversal.get('distance_to_long'),
                        reversal.get('golden_cross'),
                        reversal.get('death_cross'),
                        # 趋势质量
                        quality.get('quality'),
                        quality.get('score'),
                        quality.get('volatility'),
                        quality.get('sharpe_ratio'),
                        quality.get('continuity'),
                        quality.get('max_drawdown'),
                        quality.get('positive_days'),
                        quality.get('negative_days'),
                        quality.get('total_days')
                    ))

                await db.commit()
                logger.info(f"趋势分析数据保存成功: {stock_code} {date}")
                return True

        except Exception as e:
            logger.error(f"保存趋势分析数据失败: {stock_code} {date}, 错误: {e}")
            return False

    @staticmethod
    async def save_pattern_signals(stock_code: str, date: str,
                                  patterns: Dict[str, List[Dict]]) -> bool:
        """
        保存K线形态信号数据

        Args:
            stock_code: 股票代码
            date: 日期 (YYYY-MM-DD)
            patterns: K线形态检测结果字典

        Returns:
            是否保存成功
        """
        try:
            async with get_database() as db:
                # 先删除该日期已有的形态信号
                await db.execute(
                    "DELETE FROM pattern_signals WHERE stock_code = ? AND date = ?",
                    (stock_code, date)
                )

                # 保存每个检测到的形态
                for pattern_type, pattern_list in patterns.items():
                    for pattern in pattern_list:
                        await db.execute("""
                            INSERT INTO pattern_signals (
                                stock_code, date, pattern_type, pattern_name,
                                confidence, price, body_size, upper_shadow, lower_shadow,
                                prev_body, curr_body, day1_body, day2_body, day3_body
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """, (
                            stock_code, date,
                            pattern_type,
                            pattern.get('type', pattern_type),
                            pattern.get('confidence', 0.5),
                            pattern.get('price'),
                            pattern.get('body_size'),
                            pattern.get('upper_shadow'),
                            pattern.get('lower_shadow'),
                            pattern.get('prev_body'),
                            pattern.get('curr_body'),
                            pattern.get('day1_body'),
                            pattern.get('day2_body'),
                            pattern.get('day3_body')
                        ))

                # 保存综合信号
                pattern_signals = patterns.get('pattern_signals', {})
                if pattern_signals:
                    await db.execute("""
                        UPDATE pattern_signals SET
                            pattern_signal = ?, bullish_count = ?, bearish_count = ?
                        WHERE stock_code = ? AND date = ?
                    """, (
                        pattern_signals.get('PATTERN'),
                        pattern_signals.get('BULLISH_COUNT'),
                        pattern_signals.get('BEARISH_COUNT'),
                        stock_code, date
                    ))

                await db.commit()
                logger.info(f"K线形态信号保存成功: {stock_code} {date}, 共{len(patterns)}个形态")
                return True

        except Exception as e:
            logger.error(f"保存K线形态信号失败: {stock_code} {date}, 错误: {e}")
            return False

    @staticmethod
    async def get_technical_indicators(stock_code: str, start_date: str = None,
                                      end_date: str = None, limit: int = 100) -> List[Dict]:
        """
        获取技术指标数据

        Args:
            stock_code: 股票代码
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            limit: 返回记录数限制

        Returns:
            技术指标数据列表
        """
        try:
            async with get_database() as db:
                query = "SELECT * FROM technical_indicators WHERE stock_code = ?"
                params = [stock_code]

                if start_date:
                    query += " AND date >= ?"
                    params.append(start_date)
                if end_date:
                    query += " AND date <= ?"
                    params.append(end_date)

                query += " ORDER BY date DESC LIMIT ?"
                params.append(limit)

                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]

                result = []
                for row in rows:
                    item = dict(zip(columns, row))
                    result.append(item)

                return result

        except Exception as e:
            logger.error(f"获取技术指标数据失败: {stock_code}, 错误: {e}")
            return []

    @staticmethod
    async def get_trend_analysis(stock_code: str, date: str = None) -> Dict:
        """
        获取趋势分析数据

        Args:
            stock_code: 股票代码
            date: 日期 (YYYY-MM-DD)，如果为None则获取最新数据

        Returns:
            趋势分析数据字典
        """
        try:
            async with get_database() as db:
                if date:
                    cursor = await db.execute(
                        "SELECT * FROM trend_analysis WHERE stock_code = ? AND date = ?",
                        (stock_code, date)
                    )
                else:
                    cursor = await db.execute(
                        "SELECT * FROM trend_analysis WHERE stock_code = ? ORDER BY date DESC LIMIT 1",
                        (stock_code,)
                    )

                row = await cursor.fetchone()
                if row:
                    columns = [description[0] for description in cursor.description]
                    return dict(zip(columns, row))
                else:
                    return {}

        except Exception as e:
            logger.error(f"获取趋势分析数据失败: {stock_code}, 错误: {e}")
            return {}

    @staticmethod
    async def get_pattern_signals(stock_code: str, date: str = None,
                                 pattern_type: str = None) -> List[Dict]:
        """
        获取K线形态信号数据

        Args:
            stock_code: 股票代码
            date: 日期 (YYYY-MM-DD)，如果为None则获取最新数据
            pattern_type: 形态类型，如果为None则获取所有形态

        Returns:
            K线形态信号数据列表
        """
        try:
            async with get_database() as db:
                query = "SELECT * FROM pattern_signals WHERE stock_code = ?"
                params = [stock_code]

                if date:
                    query += " AND date = ?"
                    params.append(date)
                if pattern_type:
                    query += " AND pattern_type = ?"
                    params.append(pattern_type)

                query += " ORDER BY confidence DESC"

                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]

                result = []
                for row in rows:
                    item = dict(zip(columns, row))
                    result.append(item)

                return result

        except Exception as e:
            logger.error(f"获取K线形态信号失败: {stock_code}, 错误: {e}")
            return []

    @staticmethod
    async def get_stocks_with_signals(signal_type: str, date: str = None,
                                     min_confidence: float = 0.7,
                                     limit: int = 50) -> List[Dict]:
        """
        获取有特定信号的股票列表

        Args:
            signal_type: 信号类型 ('BULLISH', 'BEARISH', 'OVERBOUGHT', 'OVERSOLD'等)
            date: 日期 (YYYY-MM-DD)，如果为None则获取最新数据
            min_confidence: 最小置信度
            limit: 返回记录数限制

        Returns:
            股票信号数据列表
        """
        try:
            async with get_database() as db:
                # 获取最新日期的数据
                if not date:
                    cursor = await db.execute(
                        "SELECT MAX(date) FROM technical_indicators"
                    )
                    date_result = await cursor.fetchone()
                    date = date_result[0] if date_result else None

                if not date:
                    return []

                # 根据信号类型查询
                if signal_type in ['BULLISH', 'BEARISH']:
                    # 从技术指标表查询
                    query = """
                        SELECT ti.*, s.name, s.industry
                        FROM technical_indicators ti
                        JOIN stocks s ON ti.stock_code = s.code
                        WHERE ti.date = ? AND (
                            (ti.macd_signal = ?) OR
                            (ti.rsi_signal = ?) OR
                            (ti.kdj_signal = ?) OR
                            (ti.ma_trend_signal LIKE ?)
                        )
                        ORDER BY ti.created_at DESC
                        LIMIT ?
                    """
                    params = [date, signal_type, signal_type, signal_type, f'%{signal_type}%', limit]

                elif signal_type in ['OVERBOUGHT', 'OVERSOLD']:
                    # 查询超买超卖信号
                    query = """
                        SELECT ti.*, s.name, s.industry
                        FROM technical_indicators ti
                        JOIN stocks s ON ti.stock_code = s.code
                        WHERE ti.date = ? AND (
                            (ti.rsi_signal = ?) OR
                            (ti.kdj_signal = ?) OR
                            (ti.boll_signal = ?)
                        )
                        ORDER BY ti.created_at DESC
                        LIMIT ?
                    """
                    params = [date, signal_type, signal_type, signal_type, limit]

                else:
                    # 其他信号类型
                    query = """
                        SELECT ti.*, s.name, s.industry
                        FROM technical_indicators ti
                        JOIN stocks s ON ti.stock_code = s.code
                        WHERE ti.date = ? AND (
                            ti.macd_signal = ? OR
                            ti.rsi_signal = ? OR
                            ti.kdj_signal = ? OR
                            ti.boll_signal = ? OR
                            ti.ma_trend_signal LIKE ?
                        )
                        ORDER BY ti.created_at DESC
                        LIMIT ?
                    """
                    params = [date, signal_type, signal_type, signal_type, signal_type, f'%{signal_type}%', limit]

                cursor = await db.execute(query, params)
                rows = await cursor.fetchall()
                columns = [description[0] for description in cursor.description]

                result = []
                for row in rows:
                    item = dict(zip(columns, row))
                    result.append(item)

                return result

        except Exception as e:
            logger.error(f"获取信号股票列表失败: {signal_type}, 错误: {e}")
            return []