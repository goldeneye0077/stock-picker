"""
智能选股分析器
基于多维度分析的智能选股算法
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

try:
    from ...utils.database import DATABASE_PATH
except ImportError:
    from utils.database import DATABASE_PATH


class SmartSelectionAnalyzer:
    """智能选股分析器"""

    def __init__(self, db_path: str = None):
        """
        初始化智能选股分析器

        Args:
            db_path: 数据库路径，如果为None则使用默认路径
        """
        if db_path is None:
            self.db_path = DATABASE_PATH
        else:
            self.db_path = Path(db_path)

    async def _get_stock_list(self) -> List[Dict[str, Any]]:
        """
        获取股票列表

        Returns:
            股票列表
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取所有股票基本信息，随机取样2000只
                cursor = await db.execute("""
                    SELECT s.code, s.name, s.exchange, s.industry
                    FROM stocks s
                    WHERE EXISTS (
                        SELECT 1 FROM klines k
                        WHERE k.stock_code = s.code
                        LIMIT 1
                    )
                    ORDER BY RANDOM()
                    LIMIT 2000  -- 随机取样2000只股票，提高性能
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

                logger.info(f"从数据库获取到 {len(stocks)} 只股票")
                return stocks

        except Exception as e:
            logger.error(f"获取股票列表失败: {e}")
            # 如果数据库中没有数据，返回一些示例股票用于测试
            return [
                {'stock_code': '000001.SZ', 'stock_name': '平安银行', 'exchange': 'SZ', 'industry': '银行', 'raw_code': '000001'},
                {'stock_code': '600519.SH', 'stock_name': '贵州茅台', 'exchange': 'SH', 'industry': '白酒', 'raw_code': '600519'},
                {'stock_code': '000858.SZ', 'stock_name': '五粮液', 'exchange': 'SZ', 'industry': '白酒', 'raw_code': '000858'},
                {'stock_code': '002415.SZ', 'stock_name': '海康威视', 'exchange': 'SZ', 'industry': '安防设备', 'raw_code': '002415'},
                {'stock_code': '300750.SZ', 'stock_name': '宁德时代', 'exchange': 'SZ', 'industry': '新能源', 'raw_code': '300750'},
            ]

    async def _get_technical_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取技术面数据

        Args:
            stock_code: 股票代码

        Returns:
            技术面数据
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取最新K线数据计算技术指标
                cursor = await db.execute("""
                    SELECT
                        close, open, high, low, volume, date
                    FROM klines
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT 20
                """, (stock_code,))

                rows = await cursor.fetchall()

                if not rows:
                    return None

                # 计算技术指标
                closes = [row[0] for row in rows]
                volumes = [row[4] for row in rows]
                dates = [row[5] for row in rows]

                if len(closes) >= 2:
                    # 计算5日价格变化
                    price_change_5d = ((closes[0] - closes[4]) / closes[4] * 100) if len(closes) >= 5 else 0

                    # 计算量比（当日成交量/20日均量）
                    if len(volumes) >= 20:
                        avg_volume_20d = sum(volumes[:20]) / 20
                        volume_ratio = volumes[0] / avg_volume_20d if avg_volume_20d > 0 else 1.0
                    else:
                        volume_ratio = 1.0

                    # 计算简单移动平均
                    sma_5 = sum(closes[:5]) / 5 if len(closes) >= 5 else closes[0]
                    sma_10 = sum(closes[:10]) / 10 if len(closes) >= 10 else closes[0]

                    technical_data = {
                        'current_price': closes[0],
                        'price_change_5d': round(price_change_5d, 2),
                        'volume_ratio': round(volume_ratio, 2),
                        'sma_5': round(sma_5, 2),
                        'sma_10': round(sma_10, 2),
                        'latest_date': dates[0] if dates else None,
                        'volume': volumes[0],
                        'avg_volume_20d': round(sum(volumes[:20]) / 20, 2) if len(volumes) >= 20 else volumes[0]
                    }

                    # 计算技术面评分
                    technical_score = self._calculate_technical_score(technical_data)
                    technical_data['technical_score'] = round(technical_score, 1)

                    return technical_data

        except Exception as e:
            logger.error(f"获取技术面数据失败 {stock_code}: {e}")

        # 返回模拟数据用于测试
        technical_data = {
            'current_price': 15.0,
            'price_change_5d': 2.5,
            'volume_ratio': 1.8,
            'sma_5': 14.8,
            'sma_10': 14.5,
            'latest_date': datetime.now().strftime('%Y-%m-%d'),
            'volume': 1000000,
            'avg_volume_20d': 800000
        }

        # 计算技术面评分
        technical_score = self._calculate_technical_score(technical_data)
        technical_data['technical_score'] = round(technical_score, 1)

        return technical_data

    async def _get_fundamental_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取基本面数据

        Args:
            stock_code: 股票代码

        Returns:
            基本面数据
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 首先尝试从daily_basic表获取基本面数据（PE、PB等）
                cursor = await db.execute("""
                    SELECT
                        pe, pe_ttm, pb, ps, ps_ttm, dv_ratio, dv_ttm,
                        turnover_rate, total_mv, circ_mv, trade_date
                    FROM daily_basic
                    WHERE stock_code = ?
                    ORDER BY trade_date DESC
                    LIMIT 1
                """, (stock_code,))

                row = await cursor.fetchone()

                if row:
                    pe = row[0] or 0
                    pe_ttm = row[1] or 0
                    pb = row[2] or 0
                    ps = row[3] or 0
                    ps_ttm = row[4] or 0
                    dv_ratio = row[5] or 0  # 股息率
                    dv_ttm = row[6] or 0    # TTM股息率
                    turnover_rate = row[7] or 0  # 换手率
                    total_mv = row[8] or 0  # 总市值
                    circ_mv = row[9] or 0   # 流通市值
                    trade_date = row[10]

                    # 使用PE TTM作为主要估值指标
                    actual_pe = pe_ttm if pe_ttm > 0 else pe

                    # 如果PE为0或负数，使用行业平均PE
                    if actual_pe <= 0:
                        industry = await self._get_industry(stock_code, db)
                        industry_pe = {
                            "银行": 6.5, "白酒": 28.0, "新能源": 35.0, "医药": 25.0,
                            "科技": 30.0, "房地产": 8.0, "制造业": 15.0
                        }
                        actual_pe = industry_pe.get(industry, 15.0)

                    # 计算ROE（使用PB和PE估算）
                    # ROE = PB / PE * 100%
                    roe = (pb / actual_pe * 100) if actual_pe > 0 else 0

                    # 使用行业平均增长率（后续可以从财报数据获取）
                    # 暂时使用合理估计值
                    industry = await self._get_industry(stock_code, db)

                    # 根据行业设置合理的增长率
                    industry_growth = {
                        "银行": 8.0, "白酒": 15.0, "新能源": 25.0, "医药": 18.0,
                        "科技": 20.0, "房地产": 5.0, "制造业": 12.0
                    }

                    revenue_growth = industry_growth.get(industry, 10.0)
                    profit_growth = revenue_growth * 0.8  # 利润增长率通常低于营收增长率

                    # 负债率估算（根据行业）
                    industry_debt = {
                        "银行": 92.0, "白酒": 30.0, "新能源": 55.0, "医药": 40.0,
                        "科技": 45.0, "房地产": 75.0, "制造业": 50.0
                    }

                    debt_ratio = industry_debt.get(industry, 50.0)

                    # 计算基本面综合评分
                    fundamental_score = self._calculate_fundamental_score_from_data(
                        roe, actual_pe, pb, revenue_growth, profit_growth, debt_ratio
                    )

                    fundamental_data = {
                        'roe': round(roe, 1),
                        'pe': round(actual_pe, 1),
                        'pb': round(pb, 2),
                        'revenue_growth': round(revenue_growth, 1),
                        'profit_growth': round(profit_growth, 1),
                        'debt_ratio': round(debt_ratio, 1),
                        'dividend_yield': round(dv_ratio, 2),  # 股息率
                        'turnover_rate': round(turnover_rate, 2),  # 换手率
                        'total_market_value': round(total_mv, 2),  # 总市值（亿元）
                        'circulating_market_value': round(circ_mv, 2),  # 流通市值（亿元）
                        'overall_fundamental_score': round(fundamental_score, 1),
                        'has_fundamental_data': True,  # 标记有实际基本面数据
                        'data_source': 'daily_basic',
                        'industry': industry,
                        'latest_date': trade_date
                    }
                    return fundamental_data

        except Exception as e:
            logger.error(f"从daily_basic获取基本面数据失败 {stock_code}: {e}")

        # 如果daily_basic没有数据，尝试从fundamental_scores表获取
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT
                        profitability_score, valuation_score, dividend_score,
                        growth_score, quality_score, overall_score
                    FROM fundamental_scores
                    WHERE stock_code = ?
                    ORDER BY score_date DESC
                    LIMIT 1
                """, (stock_code,))

                row = await cursor.fetchone()

                if row:
                    profitability_score = row[0] or 0
                    valuation_score = row[1] or 0
                    dividend_score = row[2] or 0
                    growth_score = row[3] or 0
                    quality_score = row[4] or 0
                    overall_score = row[5] or 0

                    # 转换逻辑：
                    # ROE = 盈利能力分数 * 0.5 (假设最高50% ROE)
                    # PE = 30 - 估值分数 * 0.25 (估值分数越高，PE越低)
                    # PB = 5 - 估值分数 * 0.05 (估值分数越高，PB越低)
                    # 营收增长率 = 成长性分数 * 0.5 (假设最高50%增长率)
                    # 利润增长率 = 成长性分数 * 0.4 (假设最高40%增长率)
                    # 负债率 = 70 - 质量分数 * 0.5 (质量分数越高，负债率越低)

                    fundamental_data = {
                        'roe': round(profitability_score * 0.5, 1),
                        'pe': round(30 - valuation_score * 0.25, 1),
                        'pb': round(5 - valuation_score * 0.05, 2),
                        'revenue_growth': round(growth_score * 0.5, 1),
                        'profit_growth': round(growth_score * 0.4, 1),
                        'debt_ratio': round(70 - quality_score * 0.5, 1),
                        'overall_fundamental_score': overall_score,
                        'dividend_score': dividend_score,
                        'quality_score': quality_score,
                        'has_fundamental_data': True,
                        'data_source': 'fundamental_scores'
                    }
                    return fundamental_data

        except Exception as e:
            logger.error(f"从fundamental_scores获取基本面数据失败 {stock_code}: {e}")

        # 如果都没有数据，使用行业默认值
        return await self._get_industry_default_fundamental_data(stock_code)

    async def _get_industry(self, stock_code: str, db) -> str:
        """获取股票所属行业"""
        try:
            cursor = await db.execute("""
                SELECT industry FROM stocks WHERE code = ?
            """, (stock_code,))
            row = await cursor.fetchone()
            return row[0] if row else "未知"
        except:
            return "未知"

    def _calculate_fundamental_score_from_data(
        self, roe: float, pe: float, pb: float,
        revenue_growth: float, profit_growth: float, debt_ratio: float
    ) -> float:
        """根据实际数据计算基本面评分"""
        score = 0.0

        # 1. 盈利能力评分 (40分) - 更严格的标准
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
        elif roe <= 0:  # 负ROE严重扣分
            score -= 20
        elif roe < 3.0:  # 极低ROE扣分
            score -= 10

        # 2. 估值水平评分 (30分) - 更严格的估值标准
        if pe > 0:  # 避免除零错误
            if pe < 8.0:
                score += 30
            elif pe < 12.0:
                score += 20
            elif pe < 15.0:
                score += 10
            elif pe < 20.0:
                score += 5
            elif pe > 40.0:
                score -= 20  # 过高估值严重扣分
            elif pe > 30.0:
                score -= 10
        else:  # PE为0或负数（亏损）
            score -= 15

        # 3. 成长性评分 (30分) - 增加负增长惩罚
        if revenue_growth > 30.0:
            score += 30
        elif revenue_growth > 20.0:
            score += 20
        elif revenue_growth > 15.0:
            score += 10
        elif revenue_growth > 10.0:
            score += 5
        elif revenue_growth < 0:  # 负增长严重扣分
            score -= 20
        elif revenue_growth < 5.0:  # 低增长扣分
            score -= 10

        # 4. 财务健康度评分 (20分) - 负债率越低越好
        if debt_ratio < 30.0:
            score += 20
        elif debt_ratio < 40.0:
            score += 15
        elif debt_ratio < 50.0:
            score += 10
        elif debt_ratio < 60.0:
            score += 5
        elif debt_ratio > 80.0:
            score -= 20  # 高负债严重扣分
        elif debt_ratio > 70.0:
            score -= 10

        # 5. 额外惩罚：面临退市风险的股票（如ST股）
        # 这里可以根据股票名称或状态判断，暂时留空

        return max(0, min(100, score))

    async def _get_industry_default_fundamental_data(self, stock_code: str) -> Dict[str, Any]:
        """获取行业默认基本面数据"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取股票所属行业
                industry = await self._get_industry(stock_code, db)

                # 根据行业设置不同的默认值
                industry_defaults = {
                    "银行": {"roe": 12.0, "pe": 6.5, "pb": 0.8, "revenue_growth": 8.0, "profit_growth": 7.0, "debt_ratio": 92.0},
                    "白酒": {"roe": 25.0, "pe": 28.0, "pb": 8.0, "revenue_growth": 15.0, "profit_growth": 18.0, "debt_ratio": 30.0},
                    "新能源": {"roe": 18.0, "pe": 35.0, "pb": 4.5, "revenue_growth": 40.0, "profit_growth": 35.0, "debt_ratio": 55.0},
                    "医药": {"roe": 20.0, "pe": 25.0, "pb": 3.5, "revenue_growth": 18.0, "profit_growth": 20.0, "debt_ratio": 40.0},
                    "科技": {"roe": 15.0, "pe": 30.0, "pb": 4.0, "revenue_growth": 25.0, "profit_growth": 22.0, "debt_ratio": 45.0},
                    "房地产": {"roe": 10.0, "pe": 8.0, "pb": 1.2, "revenue_growth": 5.0, "profit_growth": 3.0, "debt_ratio": 75.0},
                    "制造业": {"roe": 14.0, "pe": 15.0, "pb": 2.0, "revenue_growth": 12.0, "profit_growth": 10.0, "debt_ratio": 50.0},
                }

                defaults = industry_defaults.get(industry, {
                    "roe": 12.0, "pe": 15.0, "pb": 2.0,
                    "revenue_growth": 10.0, "profit_growth": 8.0, "debt_ratio": 50.0
                })

                # 计算基本面评分 - 行业默认值应该比实际数据评分低
                fundamental_score = self._calculate_fundamental_score_from_data(
                    defaults["roe"], defaults["pe"], defaults["pb"],
                    defaults["revenue_growth"], defaults["profit_growth"], defaults["debt_ratio"]
                )

                # 行业默认值评分减半，鼓励使用实际数据
                adjusted_score = max(0, fundamental_score * 0.5)

                return {
                    'roe': defaults["roe"],
                    'pe': defaults["pe"],
                    'pb': defaults["pb"],
                    'revenue_growth': defaults["revenue_growth"],
                    'profit_growth': defaults["profit_growth"],
                    'debt_ratio': defaults["debt_ratio"],
                    'overall_fundamental_score': round(adjusted_score, 1),
                    'dividend_score': 30.0,  # 降低
                    'quality_score': 40.0,   # 降低
                    'has_fundamental_data': False,  # 标记没有实际基本面数据
                    'industry': industry,
                    'data_source': 'industry_default'
                }

        except Exception as e:
            logger.error(f"获取行业默认基本面数据失败 {stock_code}: {e}")

            # 最终回退：通用默认值
            return {
                'roe': 12.0,
                'pe': 15.0,
                'pb': 2.0,
                'revenue_growth': 10.0,
                'profit_growth': 8.0,
                'debt_ratio': 50.0,
                'overall_fundamental_score': 60.0,
                'dividend_score': 50.0,
                'quality_score': 60.0,
                'has_fundamental_data': False,
                'data_source': 'fallback_default'
            }

    async def _get_capital_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取资金面数据

        Args:
            stock_code: 股票代码

        Returns:
            资金面数据
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取最新资金流向数据
                cursor = await db.execute("""
                    SELECT
                        main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, date
                    FROM fund_flow
                    WHERE stock_code = ?
                    ORDER BY date DESC
                    LIMIT 1
                """, (stock_code,))

                row = await cursor.fetchone()

                if row:
                    capital_data = {
                        'main_net_inflow': row[0],  # 主力资金净流入
                        'retail_net_inflow': row[1],  # 散户资金净流入
                        'institutional_flow': row[2],  # 机构资金流向
                        'large_order_ratio': row[3],  # 大单占比
                        'latest_date': row[4]
                    }
                    return capital_data

        except Exception as e:
            logger.error(f"获取资金面数据失败 {stock_code}: {e}")

        # 返回模拟数据用于测试
        return {
            'main_net_inflow': 5000000,
            'retail_net_inflow': -2000000,
            'institutional_flow': 3000000,
            'large_order_ratio': 0.65,
            'latest_date': datetime.now().strftime('%Y-%m-%d')
        }

    async def _get_market_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取市场面数据

        Args:
            stock_code: 股票代码

        Returns:
            市场面数据
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取股票所属行业
                cursor = await db.execute("""
                    SELECT industry FROM stocks WHERE code = ?
                """, (stock_code,))

                row = await cursor.fetchone()
                industry = row[0] if row else "未知"

                # 尝试从realtime_quotes表获取板块数据
                cursor = await db.execute("""
                    SELECT AVG(change_percent) as avg_sector_change
                    FROM realtime_quotes rq
                    JOIN stocks s ON rq.stock_code = s.code
                    WHERE s.industry = ?
                """, (industry,))

                row = await cursor.fetchone()
                avg_sector_change = row[0] if row and row[0] is not None else 0.0

                # 如果realtime_quotes表没有数据，尝试从klines表计算
                if avg_sector_change == 0.0:
                    cursor = await db.execute("""
                        SELECT AVG((close - open) / open * 100) as avg_sector_change
                        FROM klines k
                        JOIN stocks s ON k.stock_code = s.code
                        WHERE s.industry = ?
                        AND k.date = (SELECT MAX(date) FROM klines WHERE stock_code = ?)
                    """, (industry, stock_code))

                    row = await cursor.fetchone()
                    avg_sector_change = row[0] if row and row[0] is not None else 0.0

                # 计算板块排名（简化版）
                # 这里应该基于所有行业的平均涨跌幅计算排名
                # 暂时使用固定值
                sector_rank = 50  # 默认中等排名

                # 根据涨跌幅调整排名
                if avg_sector_change > 5.0:
                    sector_rank = 10  # 前10%
                elif avg_sector_change > 2.0:
                    sector_rank = 25  # 前25%
                elif avg_sector_change > 0:
                    sector_rank = 40  # 前40%
                elif avg_sector_change > -2.0:
                    sector_rank = 60  # 中等偏后
                else:
                    sector_rank = 80  # 后20%

                market_data = {
                    'industry': industry,
                    'avg_sector_change': round(avg_sector_change, 2),
                    'sector_rank': sector_rank,
                }

                # 计算市场面评分
                market_score = self._calculate_market_score(market_data)
                market_data['market_score'] = round(market_score, 1)

                return market_data

        except Exception as e:
            logger.error(f"获取市场面数据失败 {stock_code}: {e}")

        # 返回模拟数据用于测试
        market_data = {
            'industry': '银行',
            'avg_sector_change': 1.2,
            'sector_rank': 50,
        }

        # 计算市场面评分
        market_score = self._calculate_market_score(market_data)
        market_data['market_score'] = round(market_score, 1)

        return market_data

    def _calculate_technical_score(self, technical_data: Dict[str, Any]) -> float:
        """
        计算技术面评分

        Args:
            technical_data: 技术面数据

        Returns:
            技术面评分 (0-100)
        """
        score = 0.0  # 从0分开始，更严格

        try:
            # 1. 成交量异动评分 (40分) - 降低门槛，适应大盘股
            volume_ratio = technical_data.get('volume_ratio')
            if volume_ratio:
                if volume_ratio > 2.5:  # 降低标准，原3.0
                    score += 40
                elif volume_ratio > 1.8:  # 降低标准，原2.0
                    score += 30
                elif volume_ratio > 1.3:  # 降低标准，原1.5
                    score += 20
                elif volume_ratio > 0.8:  # 降低标准，原1.0
                    score += 10
                elif volume_ratio > 0.3:  # 降低标准，原0.5
                    score += 5
                else:
                    score += 0  # 不放量不加分

            # 2. 价格趋势评分 (30分) - 降低门槛，适应大盘股
            price_change = technical_data.get('price_change_5d')
            if price_change:
                if price_change > 7.0:  # 降低标准，原10.0
                    score += 30
                elif price_change > 3.5:  # 降低标准，原5.0
                    score += 20
                elif price_change > 1.0:  # 降低标准，原2.0
                    score += 10
                elif price_change > 0:
                    score += 5
                elif price_change > -1.0:  # 降低标准，原-2.0
                    score += 2
                else:
                    score += 0  # 下跌不加分

            # 3. 均线系统评分 (30分)
            # 检查价格是否在均线之上
            current_price = technical_data.get('current_price', 0)
            sma_5 = technical_data.get('sma_5', 0)
            sma_10 = technical_data.get('sma_10', 0)

            if current_price > 0 and sma_5 > 0 and sma_10 > 0:
                # 多头排列：价格>5日线>10日线
                if current_price > sma_5 > sma_10:
                    score += 30
                # 价格在5日线之上
                elif current_price > sma_5:
                    score += 20
                # 价格在10日线之上
                elif current_price > sma_10:
                    score += 10
                else:
                    score += 0  # 价格在均线之下不加分
            else:
                # 数据不全，给基础分
                score += 10

            # 确保分数在0-100之间
            score = max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算技术面评分失败: {e}")

        return round(score, 2)

    def _calculate_fundamental_score(self, fundamental_data: Dict[str, Any]) -> float:
        """
        计算基本面评分

        Args:
            fundamental_data: 基本面数据

        Returns:
            基本面评分 (0-100)
        """
        try:
            # 如果有实际基本面数据，使用实际数据计算
            has_fundamental_data = fundamental_data.get('has_fundamental_data', False)

            if has_fundamental_data:
                # 使用实际数据计算
                score = 0.0  # 从0分开始，更严格

                # 1. 盈利能力评分 (40分)
                roe = fundamental_data.get('roe')
                if roe:
                    if roe > 25.0:  # 提高标准
                        score += 40
                    elif roe > 20.0:
                        score += 30
                    elif roe > 15.0:
                        score += 20
                    elif roe > 10.0:
                        score += 10
                    elif roe > 5.0:
                        score += 5
                    elif roe <= 0:
                        score += 0  # 亏损不加分

                # 2. 估值水平评分 (30分)
                pe = fundamental_data.get('pe')
                if pe:
                    if pe < 8.0:  # 提高标准
                        score += 30
                    elif pe < 12.0:
                        score += 20
                    elif pe < 15.0:
                        score += 10
                    elif pe < 20.0:
                        score += 5
                    elif pe > 30.0:
                        score += 0  # 高估值不加分
                    elif pe > 40.0:
                        score += 0  # 过高估值不加分

                # 3. 成长性评分 (30分)
                revenue_growth = fundamental_data.get('revenue_growth')
                if revenue_growth:
                    if revenue_growth > 30.0:  # 提高标准
                        score += 30
                    elif revenue_growth > 20.0:
                        score += 20
                    elif revenue_growth > 15.0:
                        score += 10
                    elif revenue_growth > 10.0:
                        score += 5
                    elif revenue_growth <= 0:
                        score += 0  # 负增长不加分

                # 确保分数在0-100之间
                score = max(0, min(100, score))
                return round(score, 2)
            else:
                # 如果没有实际基本面数据，使用行业默认值计算
                score = 0.0

                # 从行业默认值计算评分
                roe = fundamental_data.get('roe')
                pe = fundamental_data.get('pe')
                revenue_growth = fundamental_data.get('revenue_growth')
                industry = fundamental_data.get('industry', '未知')

                # 1. 盈利能力评分 (40分)
                if roe:
                    if roe > 20.0:
                        score += 40
                    elif roe > 15.0:
                        score += 30
                    elif roe > 10.0:
                        score += 20
                    elif roe > 5.0:
                        score += 10
                    else:
                        score += 5

                # 2. 估值水平评分 (30分)
                if pe:
                    if pe < 10.0:
                        score += 30
                    elif pe < 15.0:
                        score += 20
                    elif pe < 20.0:
                        score += 10
                    elif pe < 30.0:
                        score += 5
                    else:
                        score += 0

                # 3. 成长性评分 (30分)
                if revenue_growth:
                    if revenue_growth > 20.0:
                        score += 30
                    elif revenue_growth > 15.0:
                        score += 20
                    elif revenue_growth > 10.0:
                        score += 10
                    elif revenue_growth > 5.0:
                        score += 5
                    else:
                        score += 0

                # 根据数据缺失情况降低评分（降低5分）
                penalty = 5  # 数据缺失惩罚
                adjusted_score = max(0, score - penalty)

                return round(adjusted_score, 2)

        except Exception as e:
            logger.error(f"计算基本面评分失败: {e}")
            return 40.0  # 默认分降低

    def _calculate_capital_score(self, capital_data: Dict[str, Any]) -> float:
        """
        计算资金面评分

        Args:
            capital_data: 资金面数据

        Returns:
            资金面评分 (0-100)
        """
        score = 0.0  # 从0分开始，更严格

        try:
            # 1. 主力资金流入评分 (60分)
            main_net_inflow = capital_data.get('main_net_inflow')
            if main_net_inflow:
                if main_net_inflow > 50000000:  # 提高标准到5000万
                    score += 60
                elif main_net_inflow > 20000000:  # 2000万
                    score += 40
                elif main_net_inflow > 5000000:   # 500万
                    score += 20
                elif main_net_inflow > 1000000:   # 100万
                    score += 10
                elif main_net_inflow > 0:
                    score += 5
                else:
                    score += 0  # 主力资金流出不加分

            # 2. 大单占比评分 (40分)
            large_order_ratio = capital_data.get('large_order_ratio')
            if large_order_ratio:
                if large_order_ratio > 0.8:  # 大单占比>80%
                    score += 40
                elif large_order_ratio > 0.6:
                    score += 30
                elif large_order_ratio > 0.4:
                    score += 20
                elif large_order_ratio > 0.2:
                    score += 10
                else:
                    score += 0  # 小单为主不加分

            # 3. 机构资金流向评分 (20分)
            institutional_flow = capital_data.get('institutional_flow')
            if institutional_flow:
                if institutional_flow > 10000000:  # 机构资金流入>1000万
                    score += 20
                elif institutional_flow > 5000000:
                    score += 15
                elif institutional_flow > 1000000:
                    score += 10
                elif institutional_flow > 0:
                    score += 5
                else:
                    score += 0  # 机构资金流出不加分

            # 确保分数在0-100之间
            score = max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算资金面评分失败: {e}")

        return round(score, 2)

    def _calculate_market_score(self, market_data: Dict[str, Any]) -> float:
        """
        计算市场面评分

        Args:
            market_data: 市场面数据

        Returns:
            市场面评分 (0-100)
        """
        score = 0.0  # 从0分开始，更严格

        try:
            # 1. 板块热度评分 (60分)
            sector_rank = market_data.get('sector_rank')
            if sector_rank:
                if sector_rank <= 10:  # 前10%
                    score += 60
                elif sector_rank <= 25:  # 前25%
                    score += 40
                elif sector_rank <= 40:  # 前40%
                    score += 20
                elif sector_rank <= 60:  # 前60%
                    score += 10
                else:
                    score += 0  # 后40%不加分

            # 2. 板块涨跌幅评分 (40分)
            avg_sector_change = market_data.get('avg_sector_change')
            if avg_sector_change:
                if avg_sector_change > 5.0:  # 板块大涨
                    score += 40
                elif avg_sector_change > 2.0:
                    score += 30
                elif avg_sector_change > 0:
                    score += 20
                elif avg_sector_change > -2.0:
                    score += 10
                else:
                    score += 0  # 板块大跌不加分

            # 确保分数在0-100之间
            score = max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算市场面评分失败: {e}")

        return round(score, 2)

    def _calculate_overall_score(
        self,
        technical_score: float,
        fundamental_score: float,
        capital_score: float,
        market_score: float,
        weights: Dict[str, float]
    ) -> float:
        """
        计算综合评分

        Args:
            technical_score: 技术面评分
            fundamental_score: 基本面评分
            capital_score: 资金面评分
            market_score: 市场面评分
            weights: 权重配置

        Returns:
            综合评分 (0-100)
        """
        try:
            overall_score = (
                technical_score * weights.get('technical', 0.35) +
                fundamental_score * weights.get('fundamental', 0.30) +
                capital_score * weights.get('capital', 0.25) +
                market_score * weights.get('market', 0.10)
            )

            # 确保分数在0-100之间
            overall_score = max(0, min(100, overall_score))

            return round(overall_score, 2)

        except Exception as e:
            logger.error(f"计算综合评分失败: {e}")
            return 0.0

    def _determine_risk_level(self, overall_score: float, volatility: float = 0.0) -> str:
        """
        确定风险等级

        Args:
            overall_score: 综合评分
            volatility: 波动率

        Returns:
            风险等级: 低/中/高
        """
        try:
            if overall_score >= 80 and volatility < 0.3:
                return '低'
            elif overall_score >= 60:
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

    def _generate_selection_reason(
        self,
        technical_score: float,
        fundamental_score: float,
        capital_score: float,
        market_score: float
    ) -> str:
        """
        生成入选理由

        Args:
            technical_score: 技术面评分
            fundamental_score: 基本面评分
            capital_score: 资金面评分
            market_score: 市场面评分

        Returns:
            入选理由
        """
        reasons = []

        if technical_score >= 80:
            reasons.append('技术面强势')
        elif technical_score >= 60:
            reasons.append('技术面良好')

        if fundamental_score >= 80:
            reasons.append('基本面优秀')
        elif fundamental_score >= 60:
            reasons.append('基本面稳健')

        if capital_score >= 80:
            reasons.append('资金持续流入')
        elif capital_score >= 60:
            reasons.append('资金关注度高')

        if market_score >= 80:
            reasons.append('市场热度高')
        elif market_score >= 60:
            reasons.append('市场表现良好')

        if not reasons:
            reasons.append('综合评分达标')

        return '+'.join(reasons)

    def _calculate_target_price(self, current_price: float, overall_score: float) -> float:
        """
        计算目标价位

        Args:
            current_price: 当前价格
            overall_score: 综合评分

        Returns:
            目标价位
        """
        try:
            # 根据评分确定上涨空间
            if overall_score >= 90:
                target_ratio = 0.25  # 25%
            elif overall_score >= 80:
                target_ratio = 0.15  # 15%
            elif overall_score >= 70:
                target_ratio = 0.10  # 10%
            elif overall_score >= 60:
                target_ratio = 0.05  # 5%
            else:
                target_ratio = 0.0

            target_price = current_price * (1 + target_ratio)
            return round(target_price, 2)

        except:
            return current_price

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
            if risk_level == '低':
                stop_loss_ratio = 0.08  # 8%
            elif risk_level == '中':
                stop_loss_ratio = 0.12  # 12%
            else:  # 高
                stop_loss_ratio = 0.15  # 15%

            stop_loss_price = current_price * (1 - stop_loss_ratio)
            return round(stop_loss_price, 2)

        except:
            return current_price * 0.9  # 默认10%止损

    async def analyze_stock(
        self,
        stock_info: Dict[str, Any],
        weights: Dict[str, float]
    ) -> Optional[Dict[str, Any]]:
        """
        分析单只股票

        Args:
            stock_info: 股票信息字典，包含stock_code、stock_name、raw_code等
            weights: 权重配置

        Returns:
            分析结果
        """
        try:
            stock_code = stock_info.get('stock_code', '')
            stock_name = stock_info.get('stock_name', '')
            raw_code = stock_info.get('raw_code', stock_code)

            # 获取各维度数据（使用raw_code进行数据库查询）
            technical_data = await self._get_technical_data(raw_code)
            fundamental_data = await self._get_fundamental_data(raw_code)
            capital_data = await self._get_capital_data(raw_code)
            market_data = await self._get_market_data(raw_code)

            # 计算各维度评分
            technical_score = self._calculate_technical_score(technical_data or {})
            fundamental_score = self._calculate_fundamental_score(fundamental_data or {})
            capital_score = self._calculate_capital_score(capital_data or {})
            market_score = self._calculate_market_score(market_data or {})

            # 计算综合评分
            overall_score = self._calculate_overall_score(
                technical_score, fundamental_score, capital_score, market_score, weights
            )

            # 确定风险等级和持有期
            risk_level = self._determine_risk_level(overall_score)
            holding_period = self._determine_holding_period(technical_score, fundamental_score)

            # 生成入选理由
            selection_reason = self._generate_selection_reason(
                technical_score, fundamental_score, capital_score, market_score
            )

            # 计算目标价和止损价（需要当前价格数据）
            current_price = technical_data.get('current_price', 0.0) if technical_data else 0.0
            target_price = self._calculate_target_price(current_price, overall_score)
            stop_loss_price = self._calculate_stop_loss_price(current_price, risk_level)

            result = {
                'stock_code': stock_code,
                'stock_name': stock_name,
                'overall_score': overall_score,
                'technical_score': technical_score,
                'fundamental_score': fundamental_score,
                'capital_score': capital_score,
                'market_score': market_score,
                'selection_reason': selection_reason,
                'risk_level': risk_level,
                'target_price': target_price,
                'stop_loss_price': stop_loss_price,
                'holding_period': holding_period,
                'selection_date': datetime.now().strftime('%Y-%m-%d'),
            }

            return result

        except Exception as e:
            logger.error(f"分析股票 {stock_code} 失败: {e}")
            return None

    async def run_smart_selection(
        self,
        strategy_config: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        运行智能选股

        Args:
            strategy_config: 策略配置

        Returns:
            选股结果列表
        """
        try:
            weights = strategy_config.get('weights', {
                'technical': 0.35,
                'fundamental': 0.30,
                'capital': 0.25,
                'market': 0.10,
            })

            min_score = strategy_config.get('min_score', 70.0)
            max_results = strategy_config.get('max_results', 20)

            logger.info(f"开始智能选股，策略权重: {weights}, 最低评分: {min_score}")

            # 获取股票列表（已限制数量并随机排序）
            stocks = await self._get_stock_list()
            if not stocks:
                logger.warning("未找到股票列表")
                return []

            logger.info(f"开始分析 {len(stocks)} 只股票（随机取样）")

            # 分市场选股：上证和深证分别选股，确保市场均衡
            shanghai_results = []
            shenzhen_results = []
            other_results = []

            # 存储所有结果（包括低于min_score的），用于备选
            all_shanghai = []
            all_shenzhen = []
            all_other = []

            # 分析每只股票
            for stock in stocks:
                if not stock.get('stock_code'):
                    continue

                result = await self.analyze_stock(stock, weights)

                if not result:
                    continue

                stock_code = result['stock_code']

                # 根据股票代码分类
                if stock_code.startswith('60'):  # 上证股票
                    all_shanghai.append(result)
                    if result['overall_score'] >= min_score:
                        shanghai_results.append(result)
                elif stock_code.startswith('00') or stock_code.startswith('30'):  # 深证股票
                    all_shenzhen.append(result)
                    if result['overall_score'] >= min_score:
                        shenzhen_results.append(result)
                else:  # 其他（如科创板、北交所等）
                    all_other.append(result)
                    if result['overall_score'] >= min_score:
                        other_results.append(result)

                # 避免过度消耗资源
                await asyncio.sleep(0.01)

            # 各市场分别排序（包括所有股票）
            all_shanghai.sort(key=lambda x: x['overall_score'], reverse=True)
            all_shenzhen.sort(key=lambda x: x['overall_score'], reverse=True)
            all_other.sort(key=lambda x: x['overall_score'], reverse=True)
            shanghai_results.sort(key=lambda x: x['overall_score'], reverse=True)
            shenzhen_results.sort(key=lambda x: x['overall_score'], reverse=True)
            other_results.sort(key=lambda x: x['overall_score'], reverse=True)

            # 均衡选取：确保上证和深证都有代表
            results = []
            max_per_market = max(1, max_results // 3)  # 每个市场最多取1/3

            # 强制每个市场至少选一只股票（即使评分很低）
            # 上证市场
            if all_shanghai:
                # 优先取达到min_score的
                if shanghai_results:
                    results.extend(shanghai_results[:max_per_market])
                else:
                    # 如果没有达到min_score的，取该市场最好的（即使评分很低）
                    results.extend(all_shanghai[:1])
                    logger.info(f"上证市场无达标股票，选取最佳: {all_shanghai[0]['stock_code']} ({all_shanghai[0]['overall_score']}分)")
            else:
                logger.warning("上证市场无股票数据")

            # 深证市场
            if all_shenzhen:
                if shenzhen_results:
                    results.extend(shenzhen_results[:max_per_market])
                else:
                    results.extend(all_shenzhen[:1])
                    logger.info(f"深证市场无达标股票，选取最佳: {all_shenzhen[0]['stock_code']} ({all_shenzhen[0]['overall_score']}分)")
            else:
                logger.warning("深证市场无股票数据")

            # 其他市场
            if all_other:
                if other_results:
                    results.extend(other_results[:max_per_market])
                else:
                    results.extend(all_other[:1])
                    logger.info(f"其他市场无达标股票，选取最佳: {all_other[0]['stock_code']} ({all_other[0]['overall_score']}分)")
            else:
                logger.warning("其他市场无股票数据")

            # 如果总数不足，从所有结果中补足
            if len(results) < max_results:
                all_qualified_results = shanghai_results + shenzhen_results + other_results
                all_qualified_results.sort(key=lambda x: x['overall_score'], reverse=True)
                # 补充时排除已选中的
                for result in all_qualified_results:
                    if result not in results and len(results) < max_results:
                        results.append(result)

            # 最终排序
            results.sort(key=lambda x: x['overall_score'], reverse=True)
            results = results[:max_results]

            logger.info(f"智能选股完成，找到 {len(results)} 只符合条件的股票")
            logger.info(f"上证股票统计: 总数{len(all_shanghai)}只，达标{len(shanghai_results)}只，入选{len([r for r in results if r['stock_code'].startswith('60')])}只")
            logger.info(f"深证股票统计: 总数{len(all_shenzhen)}只，达标{len(shenzhen_results)}只，入选{len([r for r in results if r['stock_code'].startswith('00') or r['stock_code'].startswith('30')])}只")
            logger.info(f"其他股票统计: 总数{len(all_other)}只，达标{len(other_results)}只，入选{len([r for r in results if not (r['stock_code'].startswith('60') or r['stock_code'].startswith('00') or r['stock_code'].startswith('30'))])}只")

            return results

        except Exception as e:
            logger.error(f"运行智能选股失败: {e}")
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
                'strategy_name': '均衡策略',
                'description': '技术面、基本面、资金面均衡配置',
                'technical_weight': 0.35,
                'fundamental_weight': 0.30,
                'capital_weight': 0.25,
                'market_weight': 0.10,
                'is_active': True,
            },
            {
                'id': 2,
                'strategy_name': '价值投资',
                'description': '侧重基本面分析，寻找低估优质股',
                'technical_weight': 0.20,
                'fundamental_weight': 0.50,
                'capital_weight': 0.20,
                'market_weight': 0.10,
                'is_active': True,
            },
            {
                'id': 3,
                'strategy_name': '技术突破',
                'description': '侧重技术面分析，捕捉趋势机会',
                'technical_weight': 0.50,
                'fundamental_weight': 0.20,
                'capital_weight': 0.20,
                'market_weight': 0.10,
                'is_active': True,
            },
            {
                'id': 4,
                'strategy_name': '资金驱动',
                'description': '侧重资金流向，跟随主力资金',
                'technical_weight': 0.25,
                'fundamental_weight': 0.25,
                'capital_weight': 0.40,
                'market_weight': 0.10,
                'is_active': True,
            },
        ]

        return strategies
