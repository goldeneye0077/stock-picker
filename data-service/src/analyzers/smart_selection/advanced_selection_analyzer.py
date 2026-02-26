"""
高级智能选股分析器
基于多因子动量模型的选股算法
参考幻方量化等优秀量化算法设计
"""

import asyncio
import logging
import os
from typing import Dict, List, Optional, Any, Tuple, Callable
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import aiosqlite
from pathlib import Path

logger = logging.getLogger(__name__)

try:
    from ...utils.database import DATABASE_PATH
except ImportError:
    from utils.database import DATABASE_PATH


class AdvancedSelectionAnalyzer:
    """高级智能选股分析器"""

    def __init__(self, db_path: str = None):
        """
        初始化高级智能选股分析器

        Args:
            db_path: 数据库路径，如果为None则使用默认路径
        """
        if db_path is None:
            self.db_path = DATABASE_PATH
        else:
            self.db_path = Path(db_path)

    async def _get_stock_list(self) -> List[Dict[str, Any]]:
        """
        获取股票列表（包含更多筛选条件）

        Returns:
            股票列表
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("SELECT MAX(date) FROM klines")
                row = await cursor.fetchone()
                max_date = row[0] if row else None
                if not max_date:
                    return []
                cursor = await db.execute("SELECT COUNT(DISTINCT date) FROM klines")
                row = await cursor.fetchone()
                available_days = int(row[0] or 0) if row else 0
                if available_days <= 0:
                    return []
                if available_days >= 20:
                    required_days = 20
                elif available_days >= 6:
                    required_days = max(5, int(round(available_days * 0.8)))
                else:
                    # Sparse dataset fallback: keep analyzer usable in fresh environments.
                    required_days = max(3, int(round(available_days * 0.75)))
                required_days = min(required_days, available_days)
                try:
                    cutoff_date = (datetime.fromisoformat(str(max_date)) - timedelta(days=120)).strftime('%Y-%m-%d')
                except Exception:
                    cutoff_date = str(max_date)

                # 获取有足够交易数据的股票
                # 放宽行业数据限制：优先选择有行业数据的股票，但也允许没有行业数据的股票
                cursor = await db.execute("""
                    SELECT s.code, s.name, s.exchange, s.industry
                    FROM stocks s
                    WHERE EXISTS (
                        SELECT 1 FROM klines k
                        WHERE k.stock_code = s.code
                        AND k.date >= ?
                        GROUP BY k.stock_code
                        HAVING COUNT(*) >= ?
                    )
                    ORDER BY
                        CASE
                            WHEN s.industry IS NOT NULL AND s.industry != '' THEN 0  -- 有行业数据的优先
                            ELSE 1  -- 没有行业数据的在后
                        END,
                        s.code
                    LIMIT 6000  -- 扩大限制，全量扫描
                """, (cutoff_date, required_days))

                rows = await cursor.fetchall()

                stocks = []
                for row in rows:
                    code = row[0]
                    exchange = row[2]
                    # 构建完整的股票代码格式：代码.交易所
                    if exchange == 'SZ':
                        stock_code = f"{code}.SZ"
                    elif exchange == 'SH':
                        stock_code = f"{code}.SH"
                    else:
                        stock_code = code

                    stocks.append({
                        'stock_code': stock_code,
                        'stock_name': row[1],
                        'exchange': exchange,
                        'industry': row[3],
                        'raw_code': code  # 保存原始代码用于数据库查询
                    })

                logger.info(f"从数据库获取到 {len(stocks)} 只股票（有足够交易数据）")
                return stocks

        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            return []

    async def _get_price_data(self, stock_code: str, days: int = 60) -> Optional[pd.DataFrame]:
        """
        获取价格数据

        Args:
            stock_code: 股票代码
            days: 需要多少天的数据

        Returns:
            价格数据DataFrame
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT date, open, high, low, close, volume
                    FROM klines
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT ?
                """, (stock_code, days))

                rows = await cursor.fetchall()

                if not rows or len(rows) < 3:
                    return None

                # 转换为DataFrame
                df = pd.DataFrame(rows, columns=['date', 'open', 'high', 'low', 'close', 'volume'])
                df['date'] = pd.to_datetime(df['date'])
                df.set_index('date', inplace=True)
                df.sort_index(inplace=True)  # 按日期升序排列

                return df

        except Exception as e:
            logger.error(f"获取价格数据失败 {stock_code}: {e}")
            return None

    def _calculate_technical_factors(self, df: pd.DataFrame) -> Dict[str, float]:
        """
        计算技术因子

        Args:
            df: 价格数据DataFrame

        Returns:
            技术因子字典
        """
        factors = {}

        try:
            if len(df) < 3:
                return factors

            closes = df['close'].values
            volumes = df['volume'].values
            close_series = pd.Series(closes)

            # 1. 动量因子
            # 20日收益率（中期动量）
            if len(closes) >= 20:
                ret_20d = (closes[-1] - closes[-20]) / closes[-20]
                factors['momentum_20d'] = ret_20d * 100  # 转换为百分比

            # 60日收益率（长期动量）
            if len(closes) >= 60:
                ret_60d = (closes[-1] - closes[-60]) / closes[-60]
                factors['momentum_60d'] = ret_60d * 100

            # 2. RSI动量
            if len(closes) >= 14:
                delta = close_series.diff()
                gain = delta.where(delta > 0, 0.0)
                loss = (-delta).where(delta < 0, 0.0)

                avg_gain = gain.rolling(window=14).mean()
                avg_loss = loss.rolling(window=14).mean()

                rs = avg_gain / avg_loss.replace(0.0, np.nan)
                rsi_series = 100 - (100 / (1 + rs))
                rsi_last = rsi_series.iloc[-1]
                rsi_prev = rsi_series.iloc[-2] if len(rsi_series) >= 2 else np.nan

                if pd.isna(rsi_last):
                    rsi_last = 50.0
                if pd.isna(rsi_prev):
                    rsi_prev = rsi_last

                factors['rsi'] = float(rsi_last)
                factors['rsi_prev'] = float(rsi_prev)

            # 3. MACD因子
            if len(closes) >= 26:
                ema12_series = close_series.ewm(span=12).mean()
                ema26_series = close_series.ewm(span=26).mean()
                ema12 = ema12_series.iloc[-1]
                ema26 = ema26_series.iloc[-1]
                macd = ema12 - ema26

                macd_series = ema12_series - ema26_series
                signal_series = macd_series.ewm(span=9).mean()
                signal = signal_series.iloc[-1]
                histogram_series = macd_series - signal_series
                histogram = histogram_series.iloc[-1]
                histogram_prev = histogram_series.iloc[-2] if len(histogram_series) >= 2 else np.nan

                factors['macd'] = macd
                factors['macd_signal'] = signal
                if pd.isna(histogram):
                    histogram = macd - signal
                if pd.isna(histogram_prev):
                    histogram_prev = histogram
                factors['macd_histogram'] = float(histogram)
                factors['macd_histogram_prev'] = float(histogram_prev)

            # 4. 波动率因子
            if len(closes) >= 20:
                returns = np.diff(closes) / closes[:-1]
                volatility = np.std(returns) * np.sqrt(252)  # 年化波动率
                factors['volatility'] = volatility * 100  # 百分比

            # 5. 量价关系
            if len(volumes) >= 20:
                # 量比（当日成交量/20日均量）
                volume_today = volumes[-1]
                volume_avg_20d = np.mean(volumes[-20:])
                volume_ratio = volume_today / volume_avg_20d if volume_avg_20d > 0 else 1.0
                factors['volume_ratio'] = volume_ratio

            # 6. 趋势斜率（20日线性回归）
            trend_window = min(20, len(closes))
            if trend_window >= 3:
                x = np.arange(trend_window)
                y = closes[-trend_window:]
                slope, _ = np.polyfit(x, y, 1)
                factors['trend_slope'] = slope / closes[-trend_window] * 100  # 百分比斜率

            # 7. 趋势R²（趋势稳定性）
            if trend_window >= 3:
                x = np.arange(trend_window)
                y = closes[-trend_window:]
                slope, intercept = np.polyfit(x, y, 1)
                y_pred = slope * x + intercept
                ss_res = np.sum((y - y_pred) ** 2)
                ss_tot = np.sum((y - np.mean(y)) ** 2)
                r2 = 1 - (ss_res / ss_tot) if ss_tot != 0 else 0
                factors['trend_r2'] = r2

            # 8. 夏普比率（风险调整收益）
            if len(closes) >= 60:
                returns = np.diff(closes) / closes[:-1]
                if len(returns) > 0 and np.std(returns) > 0:
                    sharpe = np.mean(returns) / np.std(returns) * np.sqrt(252)
                    factors['sharpe_ratio'] = sharpe
                else:
                    factors['sharpe_ratio'] = 0

            # 9. 最大回撤
            if len(closes) >= 60:
                cumulative = np.cumprod(1 + returns)
                running_max = np.maximum.accumulate(cumulative)
                drawdown = (cumulative - running_max) / running_max
                max_drawdown = np.min(drawdown)
                factors['max_drawdown'] = max_drawdown * 100  # 百分比

            # 10. 价格位置（相对于20日高低点）
            if trend_window >= 3:
                high_window = np.max(closes[-trend_window:])
                low_window = np.min(closes[-trend_window:])
                price_position = (closes[-1] - low_window) / (high_window - low_window) if (high_window - low_window) > 0 else 0.5
                factors['price_position'] = price_position
                
                # 11. 突破信号 (硬性指标)
                # 价格突破：当前价格 >= 过去20天最高价 * 0.98
                factors['is_price_breakout'] = 1.0 if closes[-1] >= high_window * 0.95 else 0.0
                
            # 12. 成交量突破
            if len(volumes) >= 3:
                # 过去5日均量 (不含今日)
                lookback = min(5, len(volumes) - 1)
                vol_avg_5d = np.mean(volumes[-(lookback + 1):-1])
                # 今日成交量 > 过去5日均量 * 1.5
                factors['is_volume_breakout'] = 1.0 if (vol_avg_5d > 0 and volumes[-1] > vol_avg_5d * 1.2) else 0.0
                factors['vol_avg_5d'] = vol_avg_5d  # 保存5日均量用于展示
            else:
                factors['is_volume_breakout'] = 0.0
                factors['vol_avg_5d'] = 0.0
            
            # 13. 移动平均线 (MA)
            if len(closes) >= 5:
                factors['ma5'] = float(np.mean(closes[-5:]))
            if len(closes) >= 10:
                factors['ma10'] = float(np.mean(closes[-10:]))
            if len(closes) >= 20:
                factors['ma20'] = float(np.mean(closes[-20:]))

        except Exception as e:
            logger.error(f"计算技术因子失败: {e}")

        return factors

    async def _get_sector_data(self, industry: str) -> Dict[str, float]:
        """
        获取板块数据

        Args:
            industry: 行业名称

        Returns:
            板块数据字典
        """
        # 如果行业为空，返回合理的默认值
        if not industry or industry.strip() == '':
            logger.debug(f"行业数据为空，使用默认板块数据")
            return {
                'sector_change_5d': 0.0,
                'sector_main_flow': 0.0,
                'sector_heat': 50.0  # 给中等热度，避免因为行业数据缺失而完全排除股票
            }

        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取板块内所有股票最近5日的平均涨跌幅
                cursor = await db.execute("""
                    SELECT AVG((k.close - k_prev.close) / k_prev.close * 100) as avg_change_5d
                    FROM klines k
                    JOIN (
                        SELECT stock_code, MAX(date) as max_date
                        FROM klines
                        GROUP BY stock_code
                    ) latest ON k.stock_code = latest.stock_code AND k.date = latest.max_date
                    JOIN klines k_prev ON k.stock_code = k_prev.stock_code
                        AND k_prev.date = (
                            SELECT MAX(date)
                            FROM klines
                            WHERE stock_code = k.stock_code
                            AND date < k.date
                            AND date >= date(k.date, '-5 days')
                        )
                    JOIN stocks s ON k.stock_code = s.code
                    WHERE s.industry = ?
                    AND k_prev.close > 0
                """, (industry,))

                row = await cursor.fetchone()
                avg_change_5d = row[0] if row and row[0] is not None else 0.0

                # 获取板块资金流入（如果有资金流向数据）
                cursor = await db.execute("""
                    SELECT SUM(main_fund_flow) as total_main_flow
                    FROM fund_flow ff
                    JOIN stocks s ON ff.stock_code = s.code
                    WHERE s.industry = ?
                    AND ff.date = (SELECT MAX(date) FROM fund_flow WHERE stock_code = ff.stock_code)
                """, (industry,))

                row = await cursor.fetchone()
                total_main_flow = row[0] if row and row[0] is not None else 0.0

                return {
                    'sector_change_5d': float(avg_change_5d),
                    'sector_main_flow': float(total_main_flow),
                    'sector_heat': self._calculate_sector_heat(float(avg_change_5d), float(total_main_flow))
                }

        except Exception as e:
            logger.error(f"获取板块数据失败 {industry}: {e}")
            return {
                'sector_change_5d': 0.0,
                'sector_main_flow': 0.0,
                'sector_heat': 50.0  # 错误时也给中等热度
            }

    def _calculate_sector_heat(self, change_5d: float, main_flow: float) -> float:
        """
        计算板块热度

        Args:
            change_5d: 板块5日涨跌幅
            main_flow: 板块主力资金流入

        Returns:
            板块热度评分 (0-100)
        """
        heat = 0.0

        # 1. 涨跌幅贡献 (50分) - 调整标准以适应当前市场环境
        if change_5d > 8.0:      # 原10.0
            heat += 50
        elif change_5d > 4.0:    # 原5.0
            heat += 40
        elif change_5d > 1.5:    # 原2.0
            heat += 30
        elif change_5d > 0:
            heat += 25           # 原20，提高基础分
        elif change_5d > -1.0:   # 原-2.0
            heat += 15           # 原10，提高基础分
        elif change_5d > -3.0:
            heat += 5            # 增加中间档

        # 2. 资金流入贡献 (50分) - 调整标准
        if main_flow > 50000000:   # 原1亿，降低到5000万
            heat += 50
        elif main_flow > 20000000: # 原5000万，降低到2000万
            heat += 40
        elif main_flow > 5000000:  # 原1000万，降低到500万
            heat += 30
        elif main_flow > 0:
            heat += 25             # 原20，提高基础分
        elif main_flow > -5000000: # 允许小幅流出
            heat += 10             # 增加基础分

        # 3. 确保最低热度（避免0分）
        if heat < 20:
            heat = 20  # 最低20分，避免完全冷门

        return min(heat, 100)

    async def _get_fundamental_factors(self, stock_code: str) -> Dict[str, float]:
        """
        获取基本面因子

        Args:
            stock_code: 股票代码

        Returns:
            基本面因子字典
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT pe, pe_ttm, pb, total_mv, trade_date
                    FROM daily_basic
                    WHERE stock_code = ?
                    ORDER BY trade_date DESC
                    LIMIT 1
                """, (stock_code,))

                row = await cursor.fetchone()

                if row:
                    pe = row[0]
                    pe_ttm_raw = row[1]
                    pb = row[2]
                    total_mv = row[3]
                    trade_date = row[4]

                    logger.info(f"股票 {stock_code} 原始估值数据: pe={pe}, pe_ttm={pe_ttm_raw}, pb={pb}, total_mv={total_mv}")

                    cursor = await db.execute("""
                        SELECT industry FROM stocks WHERE code = ?
                    """, (stock_code,))
                    industry_row = await cursor.fetchone()
                    industry = industry_row[0] if industry_row else "未知"

                    logger.info(f"股票 {stock_code} 行业: {industry}")

                    if pb is None:
                        pb = 0.0
                        logger.info(f"股票 {stock_code} PB为NULL，设置为0")
                    else:
                        pb = float(pb)

                    if total_mv is None:
                        total_mv = 0.0

                    pe_value = None
                    if pe_ttm_raw is not None:
                        try:
                            pe_value = float(pe_ttm_raw)
                        except Exception:
                            pe_value = None
                    elif pe is not None:
                        try:
                            pe_value = float(pe)
                        except Exception:
                            pe_value = None

                    industry_pe = {
                        "银行": 6.5, "白酒": 28.0, "新能源": 35.0, "医药": 25.0,
                        "科技": 30.0, "房地产": 8.0, "制造业": 15.0, "化工": 12.0,
                        "化工原料": 12.0, "林业": 15.0,
                        "有色金属": 10.0, "机械设备": 14.0, "电子": 25.0,
                        "计算机": 30.0, "通信": 20.0, "建筑装饰": 8.0,
                        "交通运输": 10.0, "公用事业": 12.0, "农林牧渔": 15.0,
                        "商业贸易": 10.0, "休闲服务": 20.0, "纺织服装": 12.0
                    }

                    pe_for_score = pe_value
                    if pe_for_score is None or pe_for_score == 0:
                        pe_for_score = industry_pe.get(industry, 15.0)
                        logger.info(f"股票 {stock_code} 估值数据缺失，使用行业平均PE进行评分: {pe_for_score}")

                    roe = None
                    try:
                        fin_cursor = await db.execute("""
                            SELECT roe
                            FROM financial_indicators
                            WHERE stock_code = ?
                            ORDER BY end_date DESC
                            LIMIT 1
                        """, (stock_code,))
                        fin_row = await fin_cursor.fetchone()
                        if fin_row and fin_row[0] is not None:
                            roe = float(fin_row[0])
                            logger.info(f"股票 {stock_code} 使用财务指标ROE: {roe}")
                    except Exception as e:
                        logger.error(f"获取股票 {stock_code} 财务指标ROE失败: {e}")

                    if roe is None:
                        if pe_for_score and pe_for_score > 0 and pb > 0:
                            roe = (pb / pe_for_score) * 100
                            logger.info(f"股票 {stock_code} 使用PB/PE估算ROE: {roe}")
                        else:
                            roe = 0.0

                    industry_growth = {
                        "银行": 8.0, "白酒": 15.0, "新能源": 25.0, "医药": 18.0,
                        "科技": 20.0, "房地产": 5.0, "制造业": 12.0, "化工": 10.0,
                        "化工原料": 10.0, "林业": 8.0,  # 添加缺失的行业
                        "有色金属": 12.0, "机械设备": 10.0, "电子": 18.0,
                        "计算机": 20.0, "通信": 15.0, "建筑装饰": 8.0,
                        "交通运输": 8.0, "公用事业": 6.0, "农林牧渔": 10.0,
                        "商业贸易": 8.0, "休闲服务": 15.0, "纺织服装": 8.0
                    }
                    revenue_growth = industry_growth.get(industry, 10.0)
                    profit_growth = revenue_growth * 0.8  # 利润增长率通常低于营收增长率

                    logger.info(f"股票 {stock_code} 营收增长率: {revenue_growth}, 利润增长率: {profit_growth}")

                    pe_percentile = self._calculate_pe_percentile(pe_for_score)

                    fundamental_score = self._calculate_fundamental_score(
                        float(roe), float(pe_for_score), float(revenue_growth)
                    )

                    logger.info(f"股票 {stock_code} 基本面计算: ROE={roe:.2f}%, PE={pe_for_score:.2f}, 营收增长={revenue_growth:.1f}%, 基本面评分={fundamental_score:.1f}")

                    return {
                        'pe_ttm': float(pe_value) if pe_value is not None else 0.0,
                        'pb': float(pb),
                        'roe': float(roe),
                        'revenue_growth': float(revenue_growth),
                        'profit_growth': float(profit_growth),
                        'market_cap': float(total_mv),
                        'pe_percentile': float(pe_percentile),
                        'industry': industry,
                        'fundamental_score': fundamental_score
                    }

        except Exception as e:
            logger.error(f"获取基本面因子失败 {stock_code}: {e}")

        # 返回默认值
        return {
            'pe_ttm': 15.0,
            'pb': 2.0,
            'roe': 10.0,
            'revenue_growth': 10.0,
            'profit_growth': 8.0,
            'market_cap': 100.0,
            'pe_percentile': 0.5,
            'industry': '未知',
            'fundamental_score': 50.0
        }

    def _calculate_pe_percentile(self, pe: float) -> float:
        """
        计算PE分位数（简化版）
        实际应该基于同行业股票计算

        Args:
            pe: PE值

        Returns:
            PE分位数 (0-1)
        """
        # 简化处理：PE越低越好
        if pe <= 0:
            return 0.0
        elif pe < 10:
            return 0.9  # 很低
        elif pe < 15:
            return 0.7  # 较低
        elif pe < 20:
            return 0.5  # 中等
        elif pe < 30:
            return 0.3  # 较高
        elif pe < 50:
            return 0.1  # 很高
        else:
            return 0.0  # 极高

    def _calculate_fundamental_score(self, roe: float, pe: float, revenue_growth: float) -> float:
        """
        计算基本面综合评分

        Args:
            roe: 净资产收益率
            pe: 市盈率
            revenue_growth: 营收增长率

        Returns:
            基本面评分 (0-100)
        """
        score = 0.0

        # 1. 盈利能力 (40分)
        if roe > 25.0:
            score += 40
        elif roe > 20.0:
            score += 30
        elif roe > 15.0:
            score += 20
        elif roe > 10.0:
            score += 10
        elif roe > 5.0:
            score += 5
        elif roe > 0:
            score += 2  # 正ROE但较低，给基础分
        elif roe == 0:
            score += 0  # 零ROE，不给分
        else:
            score -= 10  # 负ROE扣分

        # 2. 估值水平 (30分)
        if pe > 0:
            if pe < 8.0:
                score += 30
            elif pe < 12.0:
                score += 20
            elif pe < 15.0:
                score += 10
            elif pe < 20.0:
                score += 5
            elif pe > 40.0:
                score -= 10  # 过高估值扣分
        elif pe == 0:
            # PE为0（亏损或数据缺失），给基础分
            score += 5
        else:
            # 负PE（亏损），给基础分
            score += 5

        # 3. 成长性 (30分)
        if revenue_growth > 30.0:
            score += 30
        elif revenue_growth > 20.0:
            score += 20
        elif revenue_growth > 15.0:
            score += 10
        elif revenue_growth > 10.0:
            score += 5
        elif revenue_growth > 5.0:
            score += 2  # 较低增长给基础分
        elif revenue_growth > 0:
            score += 1  # 正增长但很低
        elif revenue_growth < 0:
            score -= 10  # 负增长扣分

        return max(0, min(100, score))

    def _calculate_composite_score(self, factors: Dict[str, Any]) -> Dict[str, float]:
        """
        计算综合评分（多因子模型）

        Args:
            factors: 包含所有因子的字典

        Returns:
            各维度评分和综合评分
        """
        scores = {
            'technical_score': 0.0,
            'momentum_score': 0.0,
            'trend_quality_score': 0.0,
            'sector_score': 0.0,
            'fundamental_score': 0.0,
            'composite_score': 0.0,
            'valuation_score': 0.0,
            'quality_score': 0.0,
            'growth_score': 0.0,
            'volume_score': 0.0,
            'sentiment_score': 0.0,
            'risk_score': 0.0
        }

        try:
            # 1. 技术动量评分 (50%) - 核心权重
            momentum_score = 0.0

            # 20日动量
            momentum_20d = factors.get('momentum_20d', 0)
            if momentum_20d > 20.0:
                momentum_score += 15
            elif momentum_20d > 10.0:
                momentum_score += 10
            elif momentum_20d > 5.0:
                momentum_score += 5
            elif momentum_20d > 0:
                momentum_score += 2

            # RSI动量
            rsi = factors.get('rsi', 50)
            if 40 < rsi < 70:  # RSI在40-70之间为健康区间
                momentum_score += 10
            elif 30 < rsi < 80:
                momentum_score += 5

            # MACD金叉
            macd_hist = factors.get('macd_histogram', 0)
            if macd_hist > 0:
                momentum_score += 5  # 略微降低MACD权重

            # 突破信号 (新加权重)
            if factors.get('is_price_breakout', 0) > 0:
                momentum_score += 10
            if factors.get('is_volume_breakout', 0) > 0:
                momentum_score += 10

            scores['momentum_score'] = min(momentum_score, 50)

            # 2. 趋势质量评分 (15%) - 辅助权重
            trend_quality_score = 0.0

            # 趋势斜率
            trend_slope = factors.get('trend_slope', 0)
            if trend_slope > 1.0:
                trend_quality_score += 8
            elif trend_slope > 0.5:
                trend_quality_score += 5
            elif trend_slope > 0:
                trend_quality_score += 2

            # 趋势R²
            trend_r2 = factors.get('trend_r2', 0)
            if trend_r2 > 0.7:
                trend_quality_score += 5
            elif trend_r2 > 0.5:
                trend_quality_score += 3
            elif trend_r2 > 0.3:
                trend_quality_score += 1

            # 夏普比率
            sharpe = factors.get('sharpe_ratio', 0)
            if sharpe > 1.0:
                trend_quality_score += 2
            elif sharpe > 0.5:
                trend_quality_score += 1

            scores['trend_quality_score'] = min(trend_quality_score, 15)

            # 3. 板块热度评分 (25%) - 重要权重
            sector_heat = factors.get('sector_heat', 0)
            scores['sector_score'] = sector_heat * 0.25
            
            # 4. 基本面评分 (20%) - 提高权重
            raw_fundamental_score = factors.get('fundamental_score', 50)
            scores['fundamental_score'] = raw_fundamental_score

            pe_ttm = factors.get('pe_ttm', 0)
            pe_percentile = factors.get('pe_percentile', 0.5)
            roe = factors.get('roe', 0)
            revenue_growth = factors.get('revenue_growth', 0)
            profit_growth = factors.get('profit_growth', 0)

            valuation_score = 0.0
            if pe_ttm > 0:
                if pe_ttm < 10.0:
                    valuation_score += 35
                elif pe_ttm < 15.0:
                    valuation_score += 25
                elif pe_ttm < 20.0:
                    valuation_score += 15
                elif pe_ttm < 30.0:
                    valuation_score += 5
                else:
                    valuation_score += 0
            else:
                valuation_score += 10
            valuation_score += max(0.0, min(1.0, pe_percentile)) * 20.0
            scores['valuation_score'] = max(0.0, min(100.0, valuation_score))

            quality_score = 0.0
            if roe > 25.0:
                quality_score += 50
            elif roe > 20.0:
                quality_score += 40
            elif roe > 15.0:
                quality_score += 30
            elif roe > 10.0:
                quality_score += 20
            elif roe > 5.0:
                quality_score += 10
            elif roe > 0:
                quality_score += 5
            if profit_growth > 30.0:
                quality_score += 20
            elif profit_growth > 15.0:
                quality_score += 10
            elif profit_growth > 5.0:
                quality_score += 5
            scores['quality_score'] = max(0.0, min(100.0, quality_score))

            growth_score = 0.0
            if revenue_growth > 30.0:
                growth_score += 50
            elif revenue_growth > 20.0:
                growth_score += 35
            elif revenue_growth > 15.0:
                growth_score += 25
            elif revenue_growth > 10.0:
                growth_score += 15
            elif revenue_growth > 5.0:
                growth_score += 8
            elif revenue_growth > 0.0:
                growth_score += 4
            scores['growth_score'] = max(0.0, min(100.0, growth_score))

            volume_score = 0.0
            volume_ratio = factors.get('volume_ratio', 1.0)
            if volume_ratio > 3.0:
                volume_score += 40
            elif volume_ratio > 2.0:
                volume_score += 30
            elif volume_ratio > 1.5:
                volume_score += 20
            elif volume_ratio > 1.0:
                volume_score += 10
            if factors.get('is_volume_breakout', 0) > 0:
                volume_score += 20
            scores['volume_score'] = max(0.0, min(100.0, volume_score))

            sentiment_score = 50.0
            sector_main_flow = factors.get('sector_main_flow', 0.0)
            if sector_main_flow > 50000000:
                sentiment_score = 90.0
            elif sector_main_flow > 20000000:
                sentiment_score = 80.0
            elif sector_main_flow > 5000000:
                sentiment_score = 70.0
            elif sector_main_flow > 0:
                sentiment_score = 60.0
            elif sector_main_flow > -5000000:
                sentiment_score = 50.0
            else:
                sentiment_score = 40.0
            scores['sentiment_score'] = sentiment_score

            risk_score = 50.0
            volatility = factors.get('volatility', 0.0)
            max_drawdown = factors.get('max_drawdown', 0.0)
            if volatility < 20.0 and max_drawdown > -15.0:
                risk_score = 80.0
            elif volatility < 30.0 and max_drawdown > -25.0:
                risk_score = 65.0
            elif volatility < 40.0 and max_drawdown > -35.0:
                risk_score = 55.0
            else:
                risk_score = 45.0
            scores['risk_score'] = risk_score

            fundamental_contribution = raw_fundamental_score * 0.2

            # 5. 技术面总分（动量+趋势质量）
            scores['technical_score'] = scores['momentum_score'] + scores['trend_quality_score']

            # 6. 综合评分
            scores['composite_score'] = (
                scores['technical_score'] +
                scores['sector_score'] +
                fundamental_contribution
            )

            # 确保分数在0-100之间
            for key in scores:
                scores[key] = max(0, min(100, scores[key]))

        except Exception as e:
            logger.error(f"计算综合评分失败: {e}")

        return scores

    async def analyze_stock(self, stock_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        分析单只股票

        Args:
            stock_info: 股票信息

        Returns:
            分析结果
        """
        try:
            stock_code = stock_info.get('stock_code', '')
            raw_code = stock_info.get('raw_code', stock_code)
            industry = stock_info.get('industry', '未知')

            # 减少日志输出，只在调试时显示
            # logger.info(f"开始分析股票: {stock_code}")

            # 1. 获取价格数据
            price_data = await self._get_price_data(raw_code, days=60)
            if price_data is None or len(price_data) < 3:
                logger.warning(f"股票 {stock_code} 数据不足，跳过分析")
                return None

            # 2. 计算技术因子
            technical_factors = self._calculate_technical_factors(price_data)
            if not technical_factors:
                return None

            # 3. 获取板块数据
            sector_data = await self._get_sector_data(industry)

            # 4. 获取基本面因子
            fundamental_factors = await self._get_fundamental_factors(raw_code)

            # 5. 合并所有因子
            all_factors = {
                **technical_factors,
                **sector_data,
                **fundamental_factors,
                'stock_code': stock_code,
                'stock_name': stock_info.get('stock_name', ''),
                'industry': industry
            }

            # 6. 计算综合评分
            scores = self._calculate_composite_score(all_factors)

            # 7. 生成分析结果
            composite_score = round(scores['composite_score'], 2)
            current_price = float(price_data['close'].iloc[-1])

            # 计算风险等级、持有期、目标价和止损价
            risk_level = self._determine_risk_level(composite_score, all_factors.get('volatility', 0))
            holding_period = self._determine_holding_period(scores['technical_score'], scores['fundamental_score'])
            target_price = self._calculate_target_price(current_price, composite_score)
            stop_loss_price = self._calculate_stop_loss_price(current_price, risk_level)
            
            # 计算建议买入点和高抛点
            ma5 = float(all_factors.get('ma5', current_price))
            ma10 = float(all_factors.get('ma10', current_price))
            ma20 = float(all_factors.get('ma20', current_price))
            
            # 买入点策略：
            # 强势股 (评分>80)：回调至MA5附近即可买入
            # 中势股 (评分>60)：回调至MA10附近买入
            # 弱势/稳健股：回调至MA20附近买入
            if composite_score >= 80:
                buy_point = ma5
            elif composite_score >= 60:
                buy_point = ma10
            else:
                buy_point = ma20
            
            # 确保买入点不超过当前价格 (如果是追涨，则为当前价)
            if buy_point > current_price:
                buy_point = current_price
            
            # 高抛点策略：
            # 短线：目标价
            # 超短线/高抛：目标价 * 0.95 (留有余地)
            sell_point = target_price

            result = {
                'stock_code': stock_code,
                'stock_name': stock_info.get('stock_name', ''),
                'industry': industry,
                'composite_score': composite_score,
                'technical_score': round(scores['technical_score'], 2),
                'momentum_score': round(scores['momentum_score'], 2),
                'trend_quality_score': round(scores['trend_quality_score'], 2),
                'sector_score': round(scores['sector_score'], 2),
                'fundamental_score': round(scores['fundamental_score'], 2),
                'valuation_score': round(scores.get('valuation_score', 0.0), 2),
                'quality_score': round(scores.get('quality_score', 0.0), 2),
                'growth_score': round(scores.get('growth_score', 0.0), 2),
                'volume_score': round(scores.get('volume_score', 0.0), 2),
                'sentiment_score': round(scores.get('sentiment_score', 0.0), 2),
                'risk_score': round(scores.get('risk_score', 0.0), 2),
                'current_price': current_price,
                'price_change_20d': all_factors.get('momentum_20d', 0),
                'price_change_60d': all_factors.get('momentum_60d', 0),
                'volume_ratio': all_factors.get('volume_ratio', 1.0),
                'rsi': all_factors.get('rsi', 50),
                'rsi_prev': all_factors.get('rsi_prev', all_factors.get('rsi', 50)),
                'price_position': all_factors.get('price_position', 0.5),
                'macd_histogram': all_factors.get('macd_histogram', 0),
                'macd_histogram_prev': all_factors.get('macd_histogram_prev', all_factors.get('macd_histogram', 0)),
                'macd_signal': all_factors.get('macd_histogram', 0),
                'trend_slope': all_factors.get('trend_slope', 0),
                'trend_r2': all_factors.get('trend_r2', 0),
                'sharpe_ratio': all_factors.get('sharpe_ratio', 0),
                'volatility': all_factors.get('volatility', 0),
                'max_drawdown': all_factors.get('max_drawdown', 0),
                'sector_heat': all_factors.get('sector_heat', 0),
                'roe': all_factors.get('roe', 0),
                'pe_ttm': all_factors.get('pe_ttm', 0),
                'revenue_growth': all_factors.get('revenue_growth', 0),
                'analysis_date': datetime.now().strftime('%Y-%m-%d'),
                'selection_reason': self._generate_selection_reason(all_factors, scores),
                # 添加缺失的字段以保持与基础算法的一致性
                'risk_level': risk_level,
                'target_price': target_price,
                'stop_loss_price': stop_loss_price,
                'holding_period': holding_period,
                'is_price_breakout': all_factors.get('is_price_breakout', 0),
                'is_volume_breakout': all_factors.get('is_volume_breakout', 0),
                'buy_point': round(buy_point, 2),
                'sell_point': round(sell_point, 2)
            }

            return result

        except Exception as e:
            logger.error(f"分析股票 {stock_code} 失败: {e}")
            return None

    def _generate_selection_reason(self, factors: Dict[str, Any], scores: Dict[str, float]) -> str:
        reasons = []

        if factors.get('is_price_breakout', 0) > 0:
            reasons.append('价格突破(创20日新高)')
        
        if factors.get('is_volume_breakout', 0) > 0:
            vol_ratio = factors.get('volume_ratio', 1.0)
            reasons.append(f'放量突破(量比{vol_ratio:.1f})')

        # 2. 动量理由
        momentum_20d = factors.get('momentum_20d', 0)
        if momentum_20d > 20.0:
            reasons.append(f'超强动量(+{momentum_20d:.1f}%)')
        elif momentum_20d > 10.0:
            reasons.append(f'强势上涨(+{momentum_20d:.1f}%)')
        elif momentum_20d > 5.0:
            reasons.append(f'温和上涨(+{momentum_20d:.1f}%)')

        # 3. 技术面理由
        rsi = factors.get('rsi', 50)
        if 70 < rsi < 85:
            reasons.append(f'RSI强势({rsi:.0f})')
        elif 40 < rsi <= 70:
            reasons.append('技术指标健康')

        macd_hist = factors.get('macd_histogram', 0)
        if macd_hist > 0:
            reasons.append('MACD金叉')

        # 4. 趋势质量理由
        trend_r2 = factors.get('trend_r2', 0)
        trend_slope = factors.get('trend_slope', 0)
        if trend_r2 > 0.8:
            reasons.append('趋势极稳')
        elif trend_r2 > 0.6 and trend_slope > 0.5:
            reasons.append('上升通道')

        # 5. 板块理由
        sector_heat = factors.get('sector_heat', 0)
        industry = factors.get('industry', '未知')
        if sector_heat > 70:
            reasons.append(f'热门板块({industry})')
        elif sector_heat > 50:
            reasons.append(f'板块活跃({industry})')

        # 6. 基本面理由
        roe = factors.get('roe', 0)
        pe_ttm = factors.get('pe_ttm', 0)
        
        if roe > 20.0 and pe_ttm < 30:
            reasons.append(f'绩优低估(ROE{roe:.0f}%)')
        elif roe > 15.0:
            reasons.append('盈利良好')
        elif 0 < pe_ttm < 15:
            reasons.append(f'估值低(PE{pe_ttm:.1f})')

        if not reasons:
            reasons.append('综合评分达标')

        return '、'.join(reasons[:4])

    def _enhance_value_strategy_reason(self, result: Dict[str, Any]) -> None:
        base_reason = str(result.get('selection_reason') or '')
        try:
            roe = float(result.get('roe') or 0)
        except Exception:
            roe = 0.0
        try:
            pe_ttm = float(result.get('pe_ttm') or 0)
        except Exception:
            pe_ttm = 0.0
        try:
            revenue_growth = float(result.get('revenue_growth') or 0)
        except Exception:
            revenue_growth = 0.0

        parts: List[str] = []

        if roe > 15.0:
            parts.append(f'ROE{roe:.1f}%')
        if 0 < pe_ttm < 40.0:
            parts.append(f'PE{pe_ttm:.1f}')
        if revenue_growth > 10.0:
            parts.append(f'营收增长{revenue_growth:.1f}%')

        if not parts:
            return

        if base_reason:
            parts.extend(base_reason.split('、'))

        combined: List[str] = []
        for p in parts:
            if p and p not in combined:
                combined.append(p)
            if len(combined) >= 4:
                break

        result['selection_reason'] = '、'.join(combined)

    def _apply_strategy_weights(self, result: Dict[str, Any], strategy_id: int) -> None:
        momentum_raw = float(result.get('momentum_score') or 0.0)
        momentum_score = max(0.0, min(100.0, momentum_raw * 2.0))
        trend_raw = float(result.get('trend_quality_score') or 0.0)
        trend_score = max(0.0, min(100.0, (trend_raw / 15.0) * 100.0 if trend_raw > 0.0 else 0.0))
        fundamental_score = float(result.get('fundamental_score') or 0.0)

        factor_scores = {
            'momentum': momentum_score,
            'trend': trend_score,
            'fundamental': fundamental_score,
            'valuation': float(result.get('valuation_score') or 0.0),
            'quality': float(result.get('quality_score') or 0.0),
            'growth': float(result.get('growth_score') or 0.0),
            'volume': float(result.get('volume_score') or 0.0),
            'sentiment': float(result.get('sentiment_score') or 0.0),
            'risk': float(result.get('risk_score') or 0.0),
        }

        if strategy_id == 1:
            weights = {
                'momentum': 0.40,
                'volume': 0.25,
                'sentiment': 0.20,
                'trend': 0.10,
                'quality': 0.05,
                'valuation': 0.0,
                'growth': 0.0,
                'risk': 0.0,
            }
        elif strategy_id == 2:
            weights = {
                'trend': 0.35,
                'momentum': 0.25,
                'quality': 0.20,
                'valuation': 0.15,
                'volume': 0.05,
                'growth': 0.0,
                'sentiment': 0.0,
                'risk': 0.0,
            }
        elif strategy_id == 3:
            weights = {
                'fundamental': 0.80,
                'valuation': 0.20,
                'quality': 0.0,
                'growth': 0.0,
                'momentum': 0.0,
                'sentiment': 0.0,
                'risk': 0.0,
            }
        elif strategy_id == 4:
            weights = {
                'momentum': 0.5,
                'volume': 0.3,
                'sentiment': 0.1,
                'trend': 0.1,
                'quality': 0.0,
                'valuation': 0.0,
                'growth': 0.0,
                'risk': 0.0,
            }
        elif strategy_id == 5:
            weights = {
                'valuation': 0.32,
                'risk': 0.22,
                'volume': 0.18,
                'quality': 0.13,
                'momentum': 0.10,
                'sentiment': 0.05,
                'trend': 0.0,
                'growth': 0.0,
            }
        else:
            return

        composite = 0.0
        for name, weight in weights.items():
            if weight <= 0.0:
                continue
            score = max(0.0, min(100.0, factor_scores.get(name, 0.0)))
            composite += score * weight

        composite = max(0.0, min(100.0, composite))

        if strategy_id == 5:
            bonus = 0.0

            try:
                price_position = float(result.get('price_position') or 0.5)
            except Exception:
                price_position = 0.5
            try:
                rsi = float(result.get('rsi') or 50.0)
            except Exception:
                rsi = 50.0
            try:
                rsi_prev = float(result.get('rsi_prev') or rsi)
            except Exception:
                rsi_prev = rsi
            try:
                macd_hist = float(result.get('macd_histogram') or 0.0)
            except Exception:
                macd_hist = 0.0
            try:
                macd_hist_prev = float(result.get('macd_histogram_prev') or macd_hist)
            except Exception:
                macd_hist_prev = macd_hist
            try:
                volume_ratio = float(result.get('volume_ratio') or 1.0)
            except Exception:
                volume_ratio = 1.0
            try:
                momentum_20d = float(result.get('price_change_20d') or 0.0)
            except Exception:
                momentum_20d = 0.0
            try:
                pe_ttm = float(result.get('pe_ttm') or 0.0)
            except Exception:
                pe_ttm = 0.0

            if price_position < 0.20:
                bonus += 6.0
            elif price_position < 0.35:
                bonus += 3.0

            if rsi < 30.0:
                bonus += 6.0
            elif rsi < 40.0:
                bonus += 3.0

            if rsi > rsi_prev:
                bonus += 3.0

            if macd_hist > 0.0:
                bonus += 6.0
            elif macd_hist > macd_hist_prev:
                bonus += 3.0

            if volume_ratio > 1.5:
                bonus += 4.0
            elif volume_ratio > 1.2:
                bonus += 2.0

            if -20.0 <= momentum_20d <= 5.0:
                bonus += 3.0

            if 0 < pe_ttm <= 25.0:
                bonus += 2.0

            composite = min(100.0, composite + bonus)

            base_reason = str(result.get('selection_reason') or '')
            parts: List[str] = []
            if price_position < 0.35:
                parts.append('底部区间')
            if rsi < 40.0:
                parts.append(f'RSI{rsi:.0f}')
            if rsi > rsi_prev:
                parts.append('RSI回升')
            if macd_hist > 0.0:
                parts.append('MACD转强')
            elif macd_hist > macd_hist_prev:
                parts.append('MACD回升')
            if volume_ratio > 1.2:
                parts.append(f'量比{volume_ratio:.1f}')
            if 0 < pe_ttm < 20.0:
                parts.append(f'低估(PE{pe_ttm:.1f})')
            if base_reason:
                parts.extend(base_reason.split('、'))

            combined: List[str] = []
            for p in parts:
                if p and p not in combined:
                    combined.append(p)
                if len(combined) >= 4:
                    break
            if combined:
                result['selection_reason'] = '、'.join(combined)

        result['composite_score'] = round(composite, 2)

        if strategy_id == 3:
            self._enhance_value_strategy_reason(result)

    async def run_advanced_selection(self,
                                   min_score: float = 60.0,
                                   max_results: int = 20,
                                   require_uptrend: bool = True,
                                   require_hot_sector: bool = True,
                                   require_breakout: bool = False,
                                   strategy_id: Optional[int] = None,
                                   progress_callback: Optional[Callable[[int, int, int], None]] = None) -> List[Dict[str, Any]]:
        try:
            effective_min_score = 0.0 if strategy_id == 1 else min_score
            logger.info(
                f"开始高级选股，最低评分: {min_score} (effective={effective_min_score}), 最大结果: {max_results}, "
                f"突破要求: {require_breakout}, 策略ID: {strategy_id}"
            )

            stocks = await self._get_stock_list()
            if not stocks:
                logger.warning("未找到符合条件的股票")
                return []

            logger.info(f"将对 {len(stocks)} 只股票进行全量分析")

            all_shanghai = []
            all_shenzhen = []
            all_other = []

            concurrency_env = os.getenv("ADVANCED_SELECTION_CONCURRENCY")
            batch_size_env = os.getenv("ADVANCED_SELECTION_BATCH_SIZE")

            cpu_count = os.cpu_count() or 4
            default_concurrency = min(32, max(4, cpu_count * 2))

            try:
                concurrency = int(concurrency_env) if concurrency_env is not None else default_concurrency
            except ValueError:
                concurrency = default_concurrency
            if concurrency < 1:
                concurrency = 1

            try:
                batch_size = int(batch_size_env) if batch_size_env is not None else 256
            except ValueError:
                batch_size = 256
            if batch_size < 1:
                batch_size = 1

            logger.info(f"高级选股并发配置: concurrency={concurrency}, batch_size={batch_size}, cpu_count={cpu_count}")
            sem = asyncio.Semaphore(concurrency)

            async def process_stock(stock: Dict[str, Any]) -> Optional[Dict[str, Any]]:
                if not stock.get('stock_code'):
                    return None
                async with sem:
                    result = await self.analyze_stock(stock)
                if not result:
                    return None
                if strategy_id is not None:
                    self._apply_strategy_weights(result, strategy_id)

                    if strategy_id == 1:
                        momentum_score = float(result.get('momentum_score') or 0)
                        if momentum_score < 30.0:
                            return None
                        rsi = float(result.get('rsi') or 50)
                        if rsi > 85.0:
                            return None
                        volatility = float(result.get('volatility') or 0)
                        if volatility > 80.0:
                            return None
                    elif strategy_id == 2:
                        trend_slope = float(result.get('trend_slope') or 0)
                        if trend_slope < 0.25:
                            return None
                        trend_r2 = float(result.get('trend_r2') or 0)
                        if trend_r2 < 0.45:
                            return None
                        max_drawdown = float(result.get('max_drawdown') or 0)
                        if max_drawdown < -15.0:
                            return None
                    elif strategy_id == 3:
                        roe_value = result.get('roe')
                        pe_value = result.get('pe_ttm')
                        revenue_growth_value = result.get('revenue_growth')
                        has_fundamentals = any(
                            v not in (None, 0, 0.0, '')
                            for v in (roe_value, pe_value, revenue_growth_value)
                        )
                        if has_fundamentals:
                            roe = float(roe_value or 0)
                            if roe > 0 and roe < 10.0:
                                return None
                            pe_ttm = float(pe_value or 0)
                            if pe_ttm > 0 and pe_ttm > 50.0:
                                return None
                            revenue_growth = float(revenue_growth_value or 0)
                            if revenue_growth > 0 and revenue_growth < 5.0:
                                return None
                    elif strategy_id == 4:
                        momentum_score = float(result.get('momentum_score') or 0)
                        if momentum_score < 35.0:
                            return None
                        price_change_20d = float(result.get('price_change_20d') or 0)
                        price_change_60d = float(result.get('price_change_60d') or 0)
                        if price_change_20d < 20.0 and price_change_60d < 50.0:
                            return None
                        volume_ratio = float(result.get('volume_ratio') or 1.0)
                        if volume_ratio < 1.5:
                            return None
                        rsi = float(result.get('rsi') or 50)
                        if rsi < 50.0:
                            return None
                        volatility = float(result.get('volatility') or 0)
                        if volatility > 80.0:
                            return None
                    elif strategy_id == 5:
                        rsi = float(result.get('rsi') or 50)
                        if rsi > 45.0:
                            return None
                        if rsi < 18.0:
                            return None
                        rsi_prev = float(result.get('rsi_prev') or rsi)
                        if rsi <= rsi_prev:
                            return None

                        price_position = float(result.get('price_position') or 0.5)
                        if price_position > 0.45:
                            return None

                        momentum_20d = float(result.get('price_change_20d') or 0)
                        if momentum_20d > 10.0:
                            return None
                        if momentum_20d < -30.0:
                            return None

                        macd_hist = float(result.get('macd_histogram') or 0)
                        macd_hist_prev = float(result.get('macd_histogram_prev') or macd_hist)
                        if macd_hist <= macd_hist_prev and macd_hist <= 0.0:
                            return None

                        volume_ratio = float(result.get('volume_ratio') or 1.0)
                        if volume_ratio < 1.05:
                            return None

                        pe_ttm = float(result.get('pe_ttm') or 0)
                        if pe_ttm > 0 and pe_ttm > 35.0:
                            return None
                        volatility = float(result.get('volatility') or 0)
                        if volatility > 85.0:
                            return None

                if result['composite_score'] < effective_min_score:
                    return None
                if require_uptrend and result['trend_slope'] < 0.2:
                    return None
                if require_hot_sector and result['sector_heat'] < 30:
                    return None
                if require_breakout:
                    is_price_bk = result.get('is_price_breakout', 0) > 0
                    is_volume_bk = result.get('is_volume_breakout', 0) > 0
                    if strategy_id == 1:
                        if not is_price_bk:
                            return None
                    else:
                        if not (is_price_bk or is_volume_bk):
                            return None
                return result

            total = len(stocks)
            processed = 0

            for i in range(0, total, batch_size):
                batch = stocks[i:i + batch_size]
                tasks = [process_stock(stock) for stock in batch]
                batch_results = await asyncio.gather(*tasks, return_exceptions=True)

                for idx, res in enumerate(batch_results):
                    if isinstance(res, Exception):
                        stock = batch[idx]
                        logger.error(f"分析股票 {stock.get('stock_code')} 异常: {res}")
                        continue
                    if not res:
                        continue

                    stock_code = res['stock_code']
                    if stock_code.startswith('60'):
                        all_shanghai.append(res)
                    elif stock_code.startswith('00') or stock_code.startswith('30'):
                        all_shenzhen.append(res)
                    else:
                        all_other.append(res)

                processed += len(batch)
                if progress_callback is not None:
                    try:
                        progress_callback(
                            processed,
                            total,
                            len(all_shanghai) + len(all_shenzhen) + len(all_other),
                        )
                    except Exception as callback_error:
                        logger.error(f"更新高级选股进度失败: {callback_error}")
                if processed % 200 == 0 or processed == total:
                    logger.info(f"已分析 {processed}/{total} 只股票，上证: {len(all_shanghai)}, 深证: {len(all_shenzhen)}, 其他: {len(all_other)}")

            all_shanghai.sort(key=lambda x: x['composite_score'], reverse=True)
            all_shenzhen.sort(key=lambda x: x['composite_score'], reverse=True)
            all_other.sort(key=lambda x: x['composite_score'], reverse=True)

            results = []

            market_quota = max_results // 3

            shanghai_selected = all_shanghai[:market_quota]
            results.extend(shanghai_selected)

            shenzhen_selected = all_shenzhen[:market_quota]
            results.extend(shenzhen_selected)

            other_selected = all_other[:market_quota]
            results.extend(other_selected)

            remaining_slots = max_results - len(results)
            if remaining_slots > 0:
                remaining_candidates = []
                if len(all_shanghai) > market_quota:
                    remaining_candidates.extend(all_shanghai[market_quota:])
                if len(all_shenzhen) > market_quota:
                    remaining_candidates.extend(all_shenzhen[market_quota:])
                if len(all_other) > market_quota:
                    remaining_candidates.extend(all_other[market_quota:])

                remaining_candidates.sort(key=lambda x: x['composite_score'], reverse=True)
                results.extend(remaining_candidates[:remaining_slots])

            if len(results) < max_results:
                all_candidates = all_shanghai + all_shenzhen + all_other
                all_candidates.sort(key=lambda x: x['composite_score'], reverse=True)
                results = all_candidates[:max_results]

            results.sort(key=lambda x: x['composite_score'], reverse=True)

            logger.info(f"高级选股完成，找到 {len(results)} 只符合条件的股票（上证: {len(shanghai_selected)}, 深证: {len(shenzhen_selected)}, 其他: {len(other_selected)}）")

            return results

        except Exception as e:
            logger.error(f"运行高级选股失败: {e}")
            return []

    async def get_selection_strategies(self) -> List[Dict[str, Any]]:
        strategies = [
            {
                'id': 1,
                'strategy_name': '动量突破',
                'description': '侧重技术动量，捕捉强势突破股票',
                'min_score': 0.0,
                'require_uptrend': True,
                'require_hot_sector': True,
                'require_breakout': True,
                'max_results': 20,
                'is_active': True,
            },
            {
                'id': 2,
                'strategy_name': '趋势跟随',
                'description': '侧重趋势质量，跟随稳定上升趋势',
                'min_score': 30.0,
                'require_uptrend': True,
                'require_hot_sector': False,
                'max_results': 20,
                'is_active': True,
            },
            {
                'id': 3,
                'strategy_name': '价值成长',
                'description': '侧重基本面，寻找优质成长股',
                'min_score': 30.0,
                'require_uptrend': False,
                'require_hot_sector': False,
                'max_results': 20,
                'is_active': True,
            },
            {
                'id': 4,
                'strategy_name': '超级龙头',
                'description': '侧重极强动量和放量，捕捉阶段龙头妖股',
                'min_score': 40.0,
                'require_uptrend': True,
                'require_hot_sector': False,
                'require_breakout': False,
                'max_results': 20,
                'is_active': True,
            },
            {
                'id': 5,
                'strategy_name': '底部掘金',
                'description': '侧重低估值与底部反转信号，捕捉即将转强的股票',
                'min_score': 25.0,
                'require_uptrend': False,
                'require_hot_sector': False,
                'require_breakout': False,
                'max_results': 20,
                'is_active': True,
            },
        ]

        return strategies

    def _determine_risk_level(self, composite_score: float, volatility: float = 0.0) -> str:
        """
        确定风险等级

        Args:
            composite_score: 综合评分
            volatility: 波动率

        Returns:
            风险等级: 低/中/高
        """
        try:
            if composite_score >= 80 and volatility < 0.3:
                return '低'
            elif composite_score >= 60:
                return '中'
            else:
                return '高'
        except:
            return '中'

    def _determine_holding_period(self, technical_score: float, fundamental_score: float) -> str:
        """
        确定建议持有期

        Args:
            technical_score: 技术面评分
            fundamental_score: 基本面评分

        Returns:
            持有期: 短线/中线/长线
        """
        try:
            if technical_score > fundamental_score + 20:
                return '短线'
            elif fundamental_score > technical_score + 20:
                return '长线'
            else:
                return '中线'
        except:
            return '中线'

    def _calculate_target_price(self, current_price: float, composite_score: float) -> float:
        """
        计算目标价位

        Args:
            current_price: 当前价格
            composite_score: 综合评分

        Returns:
            目标价位
        """
        try:
            # 根据评分确定上涨空间
            if composite_score >= 90:
                target_ratio = 0.25  # 25%
            elif composite_score >= 80:
                target_ratio = 0.15  # 15%
            elif composite_score >= 70:
                target_ratio = 0.10  # 10%
            elif composite_score >= 60:
                target_ratio = 0.05  # 5%
            else:
                target_ratio = 0.0  # 0%

            target_price = current_price * (1 + target_ratio)
            return round(target_price, 2)
        except:
            return round(current_price * 1.05, 2)  # 默认5%

    def _calculate_stop_loss_price(self, current_price: float, risk_level: str) -> float:
        """
        计算止损价位

        Args:
            current_price: 当前价格
            risk_level: 风险等级

        Returns:
            止损价位
        """
        try:
            # 根据风险等级确定止损比例
            if risk_level == '低':
                stop_loss_ratio = 0.08  # 8%
            elif risk_level == '中':
                stop_loss_ratio = 0.10  # 10%
            else:  # 高风险
                stop_loss_ratio = 0.15  # 15%

            stop_loss_price = current_price * (1 - stop_loss_ratio)
            return round(stop_loss_price, 2)
        except:
            return round(current_price * 0.90, 2)  # 默认10%

    def calculate_factor_ic(
        self,
        factor_data: pd.DataFrame,
        factor_columns: List[str],
        return_column: str = "future_return",
        date_column: str = "date",
    ) -> Dict[str, Dict[str, float]]:
        """
        计算因子IC和IR（简单版本）

        Args:
            factor_data: 包含日期、因子值和未来收益率的DataFrame
            factor_columns: 需要评估的因子列名列表
            return_column: 未来收益率列名
            date_column: 日期列名

        Returns:
            {factor: {"ic": ic, "ir": ir, "obs": n}} 的字典
        """
        results: Dict[str, Dict[str, float]] = {}

        if factor_data is None or factor_data.empty:
            return results

        df = factor_data.copy()

        if date_column not in df.columns or return_column not in df.columns:
            return results

        df = df.dropna(subset=[date_column, return_column])

        if df.empty:
            return results

        grouped = df.groupby(date_column)

        for factor in factor_columns:
            if factor not in df.columns:
                continue

            ics: List[float] = []

            for _, group in grouped:
                g = group[[factor, return_column]].dropna()
                if len(g) < 5:
                    continue
                try:
                    ic = g[factor].rank().corr(g[return_column].rank())
                except Exception:
                    ic = None
                if ic is None or np.isnan(ic):
                    continue
                ics.append(ic)

            if not ics:
                continue

            ic_array = np.array(ics, dtype=float)
            mean_ic = float(np.nanmean(ic_array))
            std_ic = float(np.nanstd(ic_array, ddof=1)) if len(ic_array) > 1 else 0.0
            ir = float(mean_ic / std_ic) if std_ic > 0 else 0.0

            results[factor] = {
                "ic": mean_ic,
                "ir": ir,
                "obs": float(len(ic_array)),
            }

        return results
