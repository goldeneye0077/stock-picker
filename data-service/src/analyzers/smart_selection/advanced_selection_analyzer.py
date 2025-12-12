"""
高级智能选股分析器
基于多因子动量模型的选股算法
参考幻方量化等优秀量化算法设计
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
import aiosqlite
from pathlib import Path

logger = logging.getLogger(__name__)


class AdvancedSelectionAnalyzer:
    """高级智能选股分析器"""

    def __init__(self, db_path: str = None):
        """
        初始化高级智能选股分析器

        Args:
            db_path: 数据库路径，如果为None则使用默认路径
        """
        if db_path is None:
            # 使用项目根目录的data文件夹中的数据库
            project_root = Path(__file__).parent.parent.parent.parent.parent
            self.db_path = project_root / "data" / "stock_picker.db"
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
                # 获取有足够交易数据的股票
                # 放宽行业数据限制：优先选择有行业数据的股票，但也允许没有行业数据的股票
                cursor = await db.execute("""
                    SELECT s.code, s.name, s.exchange, s.industry
                    FROM stocks s
                    WHERE EXISTS (
                        SELECT 1 FROM klines k
                        WHERE k.stock_code = s.code
                        AND k.date >= '2025-11-01'  -- 放宽日期限制，让更多股票参与
                        GROUP BY k.stock_code
                        HAVING COUNT(*) >= 10  -- 降低数据要求，至少10个交易日数据
                    )
                    ORDER BY
                        CASE
                            WHEN s.industry IS NOT NULL AND s.industry != '' THEN 0  -- 有行业数据的优先
                            ELSE 1  -- 没有行业数据的在后
                        END,
                        s.code
                    LIMIT 2000  -- 限制数量，提高性能
                """)

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

                if not rows or len(rows) < 20:
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
            if len(df) < 20:
                return factors

            closes = df['close'].values
            volumes = df['volume'].values

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
                # 计算14日RSI
                delta = np.diff(closes)
                gain = np.where(delta > 0, delta, 0)
                loss = np.where(delta < 0, -delta, 0)

                avg_gain = pd.Series(gain).rolling(window=14).mean().iloc[-1]
                avg_loss = pd.Series(loss).rolling(window=14).mean().iloc[-1]

                if avg_loss != 0:
                    rs = avg_gain / avg_loss
                    rsi = 100 - (100 / (1 + rs))
                    factors['rsi'] = rsi
                else:
                    factors['rsi'] = 100

            # 3. MACD因子
            if len(closes) >= 26:
                # 计算EMA
                ema12 = pd.Series(closes).ewm(span=12).mean().iloc[-1]
                ema26 = pd.Series(closes).ewm(span=26).mean().iloc[-1]
                macd = ema12 - ema26

                # 信号线（EMA9 of MACD）
                macd_series = pd.Series(closes).ewm(span=12).mean() - pd.Series(closes).ewm(span=26).mean()
                signal = macd_series.ewm(span=9).mean().iloc[-1]

                factors['macd'] = macd
                factors['macd_signal'] = signal
                factors['macd_histogram'] = macd - signal

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
            if len(closes) >= 20:
                x = np.arange(20)
                y = closes[-20:]
                slope, _ = np.polyfit(x, y, 1)
                factors['trend_slope'] = slope / closes[-20] * 100  # 百分比斜率

            # 7. 趋势R²（趋势稳定性）
            if len(closes) >= 20:
                x = np.arange(20)
                y = closes[-20:]
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
            if len(closes) >= 20:
                high_20d = np.max(closes[-20:])
                low_20d = np.min(closes[-20:])
                price_position = (closes[-1] - low_20d) / (high_20d - low_20d) if (high_20d - low_20d) > 0 else 0.5
                factors['price_position'] = price_position

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
                # 获取最新基本面数据
                cursor = await db.execute("""
                    SELECT pe_ttm, pb, total_mv, trade_date
                    FROM daily_basic
                    WHERE stock_code = ?
                    ORDER BY trade_date DESC
                    LIMIT 1
                """, (stock_code,))

                row = await cursor.fetchone()

                if row:
                    pe_ttm = row[0]
                    pb = row[1]
                    total_mv = row[2]
                    trade_date = row[3]

                    logger.info(f"股票 {stock_code} 原始数据: pe_ttm={pe_ttm}, pb={pb}, total_mv={total_mv}")

                    # 获取行业信息
                    cursor = await db.execute("""
                        SELECT industry FROM stocks WHERE code = ?
                    """, (stock_code,))
                    industry_row = await cursor.fetchone()
                    industry = industry_row[0] if industry_row else "未知"

                    logger.info(f"股票 {stock_code} 行业: {industry}")

                    # 如果PE为NULL或0，使用行业平均PE
                    if pe_ttm is None or pe_ttm == 0:
                        industry_pe = {
                            "银行": 6.5, "白酒": 28.0, "新能源": 35.0, "医药": 25.0,
                            "科技": 30.0, "房地产": 8.0, "制造业": 15.0, "化工": 12.0,
                            "化工原料": 12.0, "林业": 15.0,  # 添加缺失的行业
                            "有色金属": 10.0, "机械设备": 14.0, "电子": 25.0,
                            "计算机": 30.0, "通信": 20.0, "建筑装饰": 8.0,
                            "交通运输": 10.0, "公用事业": 12.0, "农林牧渔": 15.0,
                            "商业贸易": 10.0, "休闲服务": 20.0, "纺织服装": 12.0
                        }
                        pe_ttm = industry_pe.get(industry, 15.0)
                        logger.info(f"股票 {stock_code} 使用行业平均PE: {pe_ttm}")
                    else:
                        pe_ttm = float(pe_ttm)

                    # 处理PB
                    if pb is None:
                        pb = 0
                        logger.info(f"股票 {stock_code} PB为NULL，设置为0")
                    else:
                        pb = float(pb)

                    # 处理总市值
                    if total_mv is None:
                        total_mv = 0

                    # 计算ROE：ROE = PB / PE × 100%
                    if pe_ttm > 0:
                        roe = (pb / pe_ttm) * 100
                    else:
                        roe = 0

                    # 根据行业设置合理的增长率
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

                    # 计算PE分位数（简化版）
                    pe_percentile = self._calculate_pe_percentile(pe_ttm)

                    fundamental_score = self._calculate_fundamental_score(
                        float(roe), float(pe_ttm), float(revenue_growth)
                    )

                    logger.info(f"股票 {stock_code} 基本面计算: ROE={roe:.2f}%, PE={pe_ttm:.2f}, 营收增长={revenue_growth:.1f}%, 基本面评分={fundamental_score:.1f}")

                    return {
                        'pe_ttm': float(pe_ttm),
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
            'composite_score': 0.0
        }

        try:
            # 1. 技术动量评分 (35%)
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
                momentum_score += 10

            scores['momentum_score'] = min(momentum_score, 35)

            # 2. 趋势质量评分 (25%)
            trend_quality_score = 0.0

            # 趋势斜率
            trend_slope = factors.get('trend_slope', 0)
            if trend_slope > 1.0:
                trend_quality_score += 10
            elif trend_slope > 0.5:
                trend_quality_score += 5
            elif trend_slope > 0:
                trend_quality_score += 2

            # 趋势R²
            trend_r2 = factors.get('trend_r2', 0)
            if trend_r2 > 0.7:
                trend_quality_score += 10
            elif trend_r2 > 0.5:
                trend_quality_score += 5
            elif trend_r2 > 0.3:
                trend_quality_score += 2

            # 夏普比率
            sharpe = factors.get('sharpe_ratio', 0)
            if sharpe > 1.0:
                trend_quality_score += 5
            elif sharpe > 0.5:
                trend_quality_score += 3
            elif sharpe > 0:
                trend_quality_score += 1

            scores['trend_quality_score'] = min(trend_quality_score, 25)

            # 3. 板块热度评分 (20%)
            sector_heat = factors.get('sector_heat', 0)
            scores['sector_score'] = sector_heat * 0.2  # 转换为20分制

            # 4. 基本面评分 (20%)
            fundamental_score = factors.get('fundamental_score', 50)
            scores['fundamental_score'] = fundamental_score * 0.2  # 转换为20分制

            # 5. 技术面总分（动量+趋势质量）
            scores['technical_score'] = scores['momentum_score'] + scores['trend_quality_score']

            # 6. 综合评分
            scores['composite_score'] = (
                scores['technical_score'] +  # 技术面60%
                scores['sector_score'] +     # 板块20%
                scores['fundamental_score']  # 基本面20%
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
            if price_data is None or len(price_data) < 20:
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
                'current_price': current_price,
                'price_change_20d': all_factors.get('momentum_20d', 0),
                'volume_ratio': all_factors.get('volume_ratio', 1.0),
                'rsi': all_factors.get('rsi', 50),
                'macd_signal': all_factors.get('macd_histogram', 0),
                'trend_slope': all_factors.get('trend_slope', 0),
                'trend_r2': all_factors.get('trend_r2', 0),
                'sharpe_ratio': all_factors.get('sharpe_ratio', 0),
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
                'holding_period': holding_period
            }

            return result

        except Exception as e:
            logger.error(f"分析股票 {stock_code} 失败: {e}")
            return None

    def _generate_selection_reason(self, factors: Dict[str, Any], scores: Dict[str, float]) -> str:
        """
        生成入选理由

        Args:
            factors: 因子数据
            scores: 评分数据

        Returns:
            入选理由
        """
        reasons = []

        # 动量理由
        momentum_20d = factors.get('momentum_20d', 0)
        if momentum_20d > 10.0:
            reasons.append('强势上涨')
        elif momentum_20d > 5.0:
            reasons.append('趋势向上')

        # 技术面理由
        rsi = factors.get('rsi', 50)
        if 40 < rsi < 70:
            reasons.append('技术指标健康')

        macd_hist = factors.get('macd_histogram', 0)
        if macd_hist > 0:
            reasons.append('MACD金叉')

        # 趋势质量理由
        trend_r2 = factors.get('trend_r2', 0)
        if trend_r2 > 0.7:
            reasons.append('趋势稳定')
        elif trend_r2 > 0.5:
            reasons.append('趋势良好')

        # 板块理由
        sector_heat = factors.get('sector_heat', 0)
        if sector_heat > 70:
            reasons.append('热门板块')
        elif sector_heat > 50:
            reasons.append('板块活跃')

        # 基本面理由
        roe = factors.get('roe', 0)
        if roe > 20.0:
            reasons.append('盈利能力强')
        elif roe > 15.0:
            reasons.append('盈利能力良好')

        pe_ttm = factors.get('pe_ttm', 0)
        if 0 < pe_ttm < 15:
            reasons.append('估值合理')

        if not reasons:
            reasons.append('综合评分达标')

        return '、'.join(reasons[:3])  # 最多显示3个理由

    async def run_advanced_selection(self,
                                   min_score: float = 60.0,
                                   max_results: int = 20,
                                   require_uptrend: bool = True,
                                   require_hot_sector: bool = True) -> List[Dict[str, Any]]:
        """
        运行高级选股

        Args:
            min_score: 最低综合评分
            max_results: 最大结果数
            require_uptrend: 是否要求上升趋势
            require_hot_sector: 是否要求热门板块

        Returns:
            选股结果列表
        """
        try:
            logger.info(f"开始高级选股，最低评分: {min_score}, 最大结果: {max_results}")

            # 获取股票列表（随机取样2000只以提高性能）
            stocks = await self._get_stock_list()
            if not stocks:
                logger.warning("未找到符合条件的股票")
                return []

            # 随机取样500只股票（提高性能，减少API超时）
            import random
            original_count = len(stocks)
            sample_size = 500
            if original_count > sample_size:
                stocks = random.sample(stocks, sample_size)
                logger.info(f"随机取样{sample_size}只股票进行分析（原{original_count}只）")

            # 分市场存储结果
            all_shanghai = []  # 上证股票（60开头）
            all_shenzhen = []  # 深证股票（00/30开头）
            all_other = []     # 其他市场股票

            # 分析每只股票
            for i, stock in enumerate(stocks):
                if not stock.get('stock_code'):
                    continue

                result = await self.analyze_stock(stock)

                if result:
                    # 应用筛选条件
                    if result['composite_score'] >= min_score:
                        # 调试日志
                        logger.debug(f"股票 {result['stock_code']}: 综合评分={result['composite_score']:.1f}, "
                                   f"趋势斜率={result['trend_slope']:.4f}%, 板块热度={result['sector_heat']:.1f}")

                        if require_uptrend and result['trend_slope'] < -0.05:  # 放宽条件，允许小幅负斜率
                            logger.debug(f"  跳过: 不满足上升趋势条件 (斜率={result['trend_slope']:.4f}% < -0.05%)")
                            continue  # 跳过明显下降趋势
                        if require_hot_sector and result['sector_heat'] < 30:  # 降低门槛，从50降到30
                            logger.debug(f"  跳过: 不满足热门板块条件 (热度={result['sector_heat']:.1f} < 30)")
                            continue  # 跳过冷门板块

                        logger.debug(f"  通过筛选条件")

                        # 根据股票代码分市场存储
                        stock_code = result['stock_code']
                        if stock_code.startswith('60'):
                            all_shanghai.append(result)
                        elif stock_code.startswith('00') or stock_code.startswith('30'):
                            all_shenzhen.append(result)
                        else:
                            all_other.append(result)

                # 进度提示
                if (i + 1) % 50 == 0:
                    logger.info(f"已分析 {i+1}/{len(stocks)} 只股票，上证: {len(all_shanghai)}, 深证: {len(all_shenzhen)}, 其他: {len(all_other)}")

                # 避免过度消耗资源
                await asyncio.sleep(0.005)

            # 按综合评分排序
            all_shanghai.sort(key=lambda x: x['composite_score'], reverse=True)
            all_shenzhen.sort(key=lambda x: x['composite_score'], reverse=True)
            all_other.sort(key=lambda x: x['composite_score'], reverse=True)

            # 分市场选股逻辑：确保每个市场都有代表
            results = []

            # 计算每个市场应该选多少只股票
            market_quota = max_results // 3  # 每个市场至少1/3

            # 从上证市场选股
            shanghai_selected = all_shanghai[:market_quota]
            results.extend(shanghai_selected)

            # 从深证市场选股
            shenzhen_selected = all_shenzhen[:market_quota]
            results.extend(shenzhen_selected)

            # 从其他市场选股
            other_selected = all_other[:market_quota]
            results.extend(other_selected)

            # 如果还有剩余名额，从所有市场中按评分补充
            remaining_slots = max_results - len(results)
            if remaining_slots > 0:
                # 合并所有未入选的股票
                remaining_candidates = []
                if len(all_shanghai) > market_quota:
                    remaining_candidates.extend(all_shanghai[market_quota:])
                if len(all_shenzhen) > market_quota:
                    remaining_candidates.extend(all_shenzhen[market_quota:])
                if len(all_other) > market_quota:
                    remaining_candidates.extend(all_other[market_quota:])

                # 按评分排序并补充
                remaining_candidates.sort(key=lambda x: x['composite_score'], reverse=True)
                results.extend(remaining_candidates[:remaining_slots])

            # 如果某个市场没有股票，强制从其他市场补充
            if len(results) < max_results:
                # 合并所有股票
                all_candidates = all_shanghai + all_shenzhen + all_other
                all_candidates.sort(key=lambda x: x['composite_score'], reverse=True)
                results = all_candidates[:max_results]

            logger.info(f"高级选股完成，找到 {len(results)} 只符合条件的股票（上证: {len(shanghai_selected)}, 深证: {len(shenzhen_selected)}, 其他: {len(other_selected)}）")

            return results

        except Exception as e:
            logger.error(f"运行高级选股失败: {e}")
            return []

    async def get_selection_strategies(self) -> List[Dict[str, Any]]:
        """
        获取选股策略列表

        Returns:
            策略列表
        """
        strategies = [
            {
                'id': 1,
                'strategy_name': '动量突破',
                'description': '侧重技术动量，捕捉强势突破股票',
                'min_score': 50.0,  # 从70降低到50，适应当前市场
                'require_uptrend': True,
                'require_hot_sector': True,
                'max_results': 15,
                'is_active': True,
            },
            {
                'id': 2,
                'strategy_name': '趋势跟随',
                'description': '侧重趋势质量，跟随稳定上升趋势',
                'min_score': 65.0,
                'require_uptrend': True,
                'require_hot_sector': False,
                'max_results': 20,
                'is_active': True,
            },
            {
                'id': 3,
                'strategy_name': '板块轮动',
                'description': '侧重板块热度，捕捉热门板块机会',
                'min_score': 60.0,
                'require_uptrend': False,
                'require_hot_sector': True,
                'max_results': 15,
                'is_active': True,
            },
            {
                'id': 4,
                'strategy_name': '价值成长',
                'description': '侧重基本面，寻找优质成长股',
                'min_score': 60.0,
                'require_uptrend': False,
                'require_hot_sector': False,
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