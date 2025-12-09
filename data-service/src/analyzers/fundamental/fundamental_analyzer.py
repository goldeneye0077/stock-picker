"""
基本面分析器
对基本面数据进行深度分析，生成投资建议
"""

import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

try:
    # 首先尝试相对导入
    from .fundamental_client import FundamentalClient
    from ...utils.fundamental_db import FundamentalDB
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from analyzers.fundamental.fundamental_client import FundamentalClient
    from utils.fundamental_db import FundamentalDB

logger = logging.getLogger(__name__)


class FundamentalAnalyzer:
    """基本面分析器"""

    def __init__(self, fundamental_client: FundamentalClient, db_path: str = "data/stock_picker.db"):
        """
        初始化基本面分析器

        Args:
            fundamental_client: 基本面客户端
            db_path: 数据库路径
        """
        self.fundamental_client = fundamental_client
        self.fundamental_db = FundamentalDB(db_path)

    async def analyze_stock_fundamentals(self, stock_code: str) -> Dict[str, Any]:
        """
        分析股票基本面

        Args:
            stock_code: 股票代码

        Returns:
            基本面分析结果（兼容前端接口）
        """
        logger.info(f"开始分析股票 {stock_code} 的基本面")

        try:
            # 获取基本面数据
            logger.info(f"开始获取股票 {stock_code} 的综合基本面数据")
            fundamental_data = await self.fundamental_client.fetch_comprehensive_fundamental_data(stock_code)
            logger.info(f"获取到基本面数据: {type(fundamental_data)}, keys: {list(fundamental_data.keys()) if isinstance(fundamental_data, dict) else 'not dict'}")

            # 检查是否有错误
            if 'error' in fundamental_data:
                logger.error(f"基本面数据获取错误: {fundamental_data['error']}")
                return {
                    'stock_code': stock_code,
                    'error': fundamental_data['error'],
                    'analysis_date': datetime.now().isoformat()
                }

            # 进行深度分析
            try:
                detailed_analysis = {
                    'stock_code': stock_code,
                    'analysis_date': datetime.now().isoformat(),
                    'basic_analysis': await self._analyze_basic_info(fundamental_data),
                    'financial_analysis': await self._analyze_financials(fundamental_data),
                    'valuation_analysis': await self._analyze_valuation(fundamental_data),
                    'dividend_analysis': await self._analyze_dividends(fundamental_data),
                    'shareholder_analysis': await self._analyze_shareholders(fundamental_data),
                    'industry_comparison': await self._analyze_industry_position(fundamental_data),
                    'risk_assessment': await self._assess_risks(fundamental_data),
                    'investment_recommendation': await self._generate_recommendation(fundamental_data),
                    'overall_score': fundamental_data.get('fundamental_score', 0),
                    'score_breakdown': await self._calculate_detailed_score(fundamental_data)
                }
            except Exception as e:
                logger.error(f"深度分析过程中发生错误: {e}")
                import traceback
                logger.error(f"错误堆栈: {traceback.format_exc()}")
                raise

            # 保存分析结果
            await self._save_analysis_result(stock_code, detailed_analysis)

            # 转换为前端兼容的格式
            frontend_compatible_result = self._convert_to_frontend_format(detailed_analysis)

            logger.info(f"完成股票 {stock_code} 的基本面分析，综合评分: {detailed_analysis['overall_score']}")

            return frontend_compatible_result

        except Exception as e:
            logger.error(f"分析股票 {stock_code} 基本面失败: {e}")
            return {
                'stock_code': stock_code,
                'error': str(e),
                'analysis_date': datetime.now().isoformat()
            }

    async def _analyze_basic_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析基本信息"""
        basic_info = data.get('basic_info', {}) or {}
        company_info = data.get('company_info', {}) or {}

        analysis = {
            'company_name': basic_info.get('name', '未知'),
            'industry': basic_info.get('industry', '未知'),
            'area': basic_info.get('area', '未知'),
            'market': basic_info.get('market', '未知'),
            'list_date': basic_info.get('list_date', '未知'),
            'days_listed': basic_info.get('days_listed', 0),
            'company_size': '未知',
            'management_quality': '未知',
            'business_stability': '未知'
        }

        # 分析公司规模
        employees = company_info.get('employees')
        if employees:
            if employees > 10000:
                analysis['company_size'] = '大型企业'
            elif employees > 1000:
                analysis['company_size'] = '中型企业'
            else:
                analysis['company_size'] = '小型企业'

        # 分析管理层质量
        if company_info.get('chairman') and company_info.get('manager'):
            analysis['management_quality'] = '良好'
        elif company_info.get('chairman') or company_info.get('manager'):
            analysis['management_quality'] = '一般'
        else:
            analysis['management_quality'] = '信息不足'

        # 分析业务稳定性
        list_date = basic_info.get('list_date')
        if list_date:
            try:
                list_date_obj = datetime.strptime(str(list_date), '%Y%m%d')
                years_listed = (datetime.now() - list_date_obj).days / 365
                if years_listed > 10:
                    analysis['business_stability'] = '非常稳定'
                elif years_listed > 5:
                    analysis['business_stability'] = '稳定'
                elif years_listed > 3:
                    analysis['business_stability'] = '一般'
                else:
                    analysis['business_stability'] = '较新'
            except:
                analysis['business_stability'] = '未知'

        return analysis

    async def _analyze_financials(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析财务状况"""
        financial_data = data.get('financial_indicators', {}) or {}
        income_statement = data.get('income_statement', {}) or {}
        balance_sheet = data.get('balance_sheet', {}) or {}
        cash_flow = data.get('cash_flow', {}) or {}

        analysis = {
            'profitability': {
                'roe': financial_data.get('roe'),
                'roa': financial_data.get('roa'),
                'gross_margin': financial_data.get('grossprofit_margin'),
                'net_margin': financial_data.get('profit_to_gr'),
                'assessment': '未知',
                'score': 0
            },
            'solvency': {
                'debt_ratio': financial_data.get('debt_to_assets'),
                'current_ratio': None,
                'quick_ratio': None,
                'assessment': '未知',
                'score': 0
            },
            'operational_efficiency': {
                'asset_turnover': None,
                'inventory_turnover': None,
                'receivables_turnover': None,
                'assessment': '未知',
                'score': 0
            },
            'cash_flow_quality': {
                'operating_cash_flow': cash_flow.get('n_cashflow_act'),
                'free_cash_flow': cash_flow.get('free_cashflow'),
                'cash_flow_coverage': None,
                'assessment': '未知',
                'score': 0
            },
            'growth': {
                'revenue_growth': None,
                'profit_growth': None,
                'asset_growth': None,
                'assessment': '未知',
                'score': 0
            }
        }

        # 盈利能力评估
        roe = financial_data.get('roe')
        if roe:
            if roe > 20:
                analysis['profitability']['assessment'] = '优秀'
                analysis['profitability']['score'] = 90
            elif roe > 15:
                analysis['profitability']['assessment'] = '良好'
                analysis['profitability']['score'] = 75
            elif roe > 10:
                analysis['profitability']['assessment'] = '一般'
                analysis['profitability']['score'] = 60
            elif roe > 5:
                analysis['profitability']['assessment'] = '较差'
                analysis['profitability']['score'] = 40
            else:
                analysis['profitability']['assessment'] = '差'
                analysis['profitability']['score'] = 20

        # 偿债能力评估
        debt_ratio = financial_data.get('debt_to_assets')
        if debt_ratio:
            if debt_ratio < 0.3:
                analysis['solvency']['assessment'] = '非常安全'
                analysis['solvency']['score'] = 95
            elif debt_ratio < 0.5:
                analysis['solvency']['assessment'] = '安全'
                analysis['solvency']['score'] = 80
            elif debt_ratio < 0.7:
                analysis['solvency']['assessment'] = '一般'
                analysis['solvency']['score'] = 60
            else:
                analysis['solvency']['assessment'] = '风险较高'
                analysis['solvency']['score'] = 30

        # 现金流质量评估
        operating_cash_flow = cash_flow.get('n_cashflow_act')
        net_income = income_statement.get('n_income')
        if operating_cash_flow and net_income:
            if net_income > 0:
                cash_flow_ratio = operating_cash_flow / net_income
                if cash_flow_ratio > 1.2:
                    analysis['cash_flow_quality']['assessment'] = '优秀'
                    analysis['cash_flow_quality']['score'] = 90
                elif cash_flow_ratio > 0.8:
                    analysis['cash_flow_quality']['assessment'] = '良好'
                    analysis['cash_flow_quality']['score'] = 75
                elif cash_flow_ratio > 0.5:
                    analysis['cash_flow_quality']['assessment'] = '一般'
                    analysis['cash_flow_quality']['score'] = 60
                else:
                    analysis['cash_flow_quality']['assessment'] = '较差'
                    analysis['cash_flow_quality']['score'] = 40

        return analysis

    async def _analyze_valuation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析估值水平"""
        valuation_data = data.get('valuation_data', {}) or {}

        analysis = {
            'pe_ratio': valuation_data.get('pe'),
            'pb_ratio': valuation_data.get('pb'),
            'ps_ratio': valuation_data.get('ps'),
            'dividend_yield': valuation_data.get('dv_ratio'),
            'market_cap': valuation_data.get('total_mv'),
            'historical_comparison': '未知',
            'industry_comparison': '未知',
            'valuation_assessment': '未知',
            'score': 0
        }

        # PE估值评估
        pe = valuation_data.get('pe')
        if pe:
            if pe < 10:
                analysis['valuation_assessment'] = '严重低估'
                analysis['score'] = 95
            elif pe < 15:
                analysis['valuation_assessment'] = '低估'
                analysis['score'] = 80
            elif pe < 20:
                analysis['valuation_assessment'] = '合理'
                analysis['score'] = 65
            elif pe < 25:
                analysis['valuation_assessment'] = '偏高'
                analysis['score'] = 45
            elif pe < 30:
                analysis['valuation_assessment'] = '高估'
                analysis['score'] = 30
            else:
                analysis['valuation_assessment'] = '严重高估'
                analysis['score'] = 15

        # PB估值评估
        pb = valuation_data.get('pb')
        if pb:
            if pb < 1:
                analysis['valuation_assessment'] += ' (PB低估)'
                analysis['score'] = min(100, analysis['score'] + 10)
            elif pb > 3:
                analysis['valuation_assessment'] += ' (PB高估)'
                analysis['score'] = max(0, analysis['score'] - 10)

        return analysis

    async def _analyze_dividends(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析分红情况"""
        dividend_data = data.get('dividend_data', []) or []
        valuation_data = data.get('valuation_data', {}) or {}

        analysis = {
            'dividend_history': [],
            'dividend_yield': valuation_data.get('dv_ratio'),
            'dividend_consistency': '未知',
            'dividend_growth': '未知',
            'payout_ratio': '未知',
            'assessment': '未知',
            'score': 0
        }

        if dividend_data:
            # 分析分红历史
            recent_dividends = sorted(dividend_data, key=lambda x: x.get('end_date', ''), reverse=True)[:5]
            analysis['dividend_history'] = recent_dividends

            # 检查分红连续性
            years_with_dividend = len([d for d in recent_dividends if d.get('cash_div', 0) > 0])
            if years_with_dividend >= 5:
                analysis['dividend_consistency'] = '非常稳定'
                analysis['score'] += 30
            elif years_with_dividend >= 3:
                analysis['dividend_consistency'] = '稳定'
                analysis['score'] += 20
            elif years_with_dividend >= 1:
                analysis['dividend_consistency'] = '一般'
                analysis['score'] += 10
            else:
                analysis['dividend_consistency'] = '不稳定'
                analysis['score'] += 0

            # 分析股息率
            dividend_yield = valuation_data.get('dv_ratio')
            if dividend_yield:
                if dividend_yield > 3:
                    analysis['assessment'] = '高股息'
                    analysis['score'] += 40
                elif dividend_yield > 2:
                    analysis['assessment'] = '中等股息'
                    analysis['score'] += 30
                elif dividend_yield > 1:
                    analysis['assessment'] = '低股息'
                    analysis['score'] += 20
                else:
                    analysis['assessment'] = '股息率低'
                    analysis['score'] += 10

        analysis['score'] = min(100, analysis['score'])

        return analysis

    async def _analyze_shareholders(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析股东结构"""
        shareholder_data = data.get('shareholder_data', [])

        analysis = {
            'top_shareholders': [],
            'institutional_holdings': 0,
            'retail_holdings': 0,
            'shareholder_concentration': '未知',
            'institutional_support': '未知',
            'assessment': '未知',
            'score': 0
        }

        if shareholder_data:
            analysis['top_shareholders'] = shareholder_data[:10]

            # 计算机构持股比例
            institutional_holders = ['基金', '保险', '社保', 'QFII', '券商', '信托']
            institutional_ratio = sum(
                holder.get('hold_ratio', 0)
                for holder in shareholder_data
                if any(inst in str(holder.get('holder_name', '')) for inst in institutional_holders)
            )
            analysis['institutional_holdings'] = institutional_ratio

            # 分析股东集中度
            top5_ratio = sum(holder.get('hold_ratio', 0) for holder in shareholder_data[:5])
            if top5_ratio > 50:
                analysis['shareholder_concentration'] = '高度集中'
                analysis['score'] += 30
            elif top5_ratio > 30:
                analysis['shareholder_concentration'] = '较为集中'
                analysis['score'] += 20
            else:
                analysis['shareholder_concentration'] = '分散'
                analysis['score'] += 10

            # 分析机构支持度
            if institutional_ratio > 30:
                analysis['institutional_support'] = '强力支持'
                analysis['score'] += 40
            elif institutional_ratio > 20:
                analysis['institutional_support'] = '良好支持'
                analysis['score'] += 30
            elif institutional_ratio > 10:
                analysis['institutional_support'] = '一般支持'
                analysis['score'] += 20
            else:
                analysis['institutional_support'] = '支持较弱'
                analysis['score'] += 10

        analysis['score'] = min(100, analysis['score'])

        return analysis

    async def _analyze_industry_position(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """分析行业地位"""
        basic_info = data.get('basic_info', {}) or {}
        financial_data = data.get('financial_indicators', {}) or {}

        analysis = {
            'industry': basic_info.get('industry', '未知'),
            'market_position': '未知',
            'competitive_advantage': '未知',
            'industry_growth': '未知',
            'barriers_to_entry': '未知',
            'assessment': '未知',
            'score': 50  # 基础分
        }

        # 根据财务指标评估市场地位
        roe = financial_data.get('roe')
        if roe:
            if roe > 20:
                analysis['market_position'] = '行业龙头'
                analysis['score'] += 20
            elif roe > 15:
                analysis['market_position'] = '领先企业'
                analysis['score'] += 15
            elif roe > 10:
                analysis['market_position'] = '中等企业'
                analysis['score'] += 10
            else:
                analysis['market_position'] = '落后企业'
                analysis['score'] += 5

        # 毛利率评估竞争优势
        gross_margin = financial_data.get('grossprofit_margin')
        if gross_margin:
            if gross_margin > 40:
                analysis['competitive_advantage'] = '强竞争优势'
                analysis['score'] += 20
            elif gross_margin > 30:
                analysis['competitive_advantage'] = '中等竞争优势'
                analysis['score'] += 15
            elif gross_margin > 20:
                analysis['competitive_advantage'] = '一般竞争优势'
                analysis['score'] += 10
            else:
                analysis['competitive_advantage'] = '竞争优势弱'
                analysis['score'] += 5

        analysis['score'] = min(100, analysis['score'])

        return analysis

    async def _assess_risks(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """风险评估"""
        financial_data = data.get('financial_indicators', {}) or {}
        balance_sheet = data.get('balance_sheet', {}) or {}

        analysis = {
            'financial_risk': '低',
            'operational_risk': '中',
            'market_risk': '中',
            'liquidity_risk': '低',
            'regulatory_risk': '低',
            'overall_risk_level': '中',
            'risk_score': 30  # 越低越好
        }

        # 财务风险
        debt_ratio = financial_data.get('debt_to_assets')
        if debt_ratio:
            if debt_ratio > 0.7:
                analysis['financial_risk'] = '高'
                analysis['risk_score'] += 30
            elif debt_ratio > 0.5:
                analysis['financial_risk'] = '中高'
                analysis['risk_score'] += 20
            elif debt_ratio > 0.3:
                analysis['financial_risk'] = '中'
                analysis['risk_score'] += 15
            else:
                analysis['financial_risk'] = '低'
                analysis['risk_score'] += 5

        # 流动性风险
        current_assets = balance_sheet.get('current_assets')
        total_assets = balance_sheet.get('total_assets')
        if current_assets and total_assets:
            current_ratio = current_assets / total_assets if total_assets > 0 else 0
            if current_ratio < 0.2:
                analysis['liquidity_risk'] = '高'
                analysis['risk_score'] += 25
            elif current_ratio < 0.3:
                analysis['liquidity_risk'] = '中'
                analysis['risk_score'] += 15
            else:
                analysis['liquidity_risk'] = '低'
                analysis['risk_score'] += 5

        # 总体风险评估
        if analysis['risk_score'] > 60:
            analysis['overall_risk_level'] = '高'
        elif analysis['risk_score'] > 40:
            analysis['overall_risk_level'] = '中高'
        elif analysis['risk_score'] > 20:
            analysis['overall_risk_level'] = '中'
        else:
            analysis['overall_risk_level'] = '低'

        return analysis

    async def _generate_recommendation(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """生成投资建议"""
        fundamental_score = data.get('fundamental_score', 0)
        valuation_data = data.get('valuation_data', {}) or {}
        financial_data = data.get('financial_indicators', {}) or {}

        recommendation = {
            'rating': '持有',
            'confidence': '中等',
            'time_horizon': '中长期',
            'target_price': '未知',
            'stop_loss': '未知',
            'key_reasons': [],
            'risks_to_consider': [],
            'monitoring_points': []
        }

        # 根据基本面评分确定评级
        if fundamental_score >= 80:
            recommendation['rating'] = '强烈买入'
            recommendation['confidence'] = '高'
        elif fundamental_score >= 70:
            recommendation['rating'] = '买入'
            recommendation['confidence'] = '中高'
        elif fundamental_score >= 60:
            recommendation['rating'] = '增持'
            recommendation['confidence'] = '中等'
        elif fundamental_score >= 50:
            recommendation['rating'] = '持有'
            recommendation['confidence'] = '中等'
        elif fundamental_score >= 40:
            recommendation['rating'] = '减持'
            recommendation['confidence'] = '中低'
        else:
            recommendation['rating'] = '卖出'
            recommendation['confidence'] = '低'

        # 添加关键理由
        roe = financial_data.get('roe')
        if roe and roe > 15:
            recommendation['key_reasons'].append(f'ROE高达{roe:.1f}%，盈利能力强劲')

        pe = valuation_data.get('pe')
        if pe and pe < 15:
            recommendation['key_reasons'].append(f'PE仅{pe:.1f}倍，估值具有吸引力')

        dividend_yield = valuation_data.get('dv_ratio')
        if dividend_yield and dividend_yield > 2:
            recommendation['key_reasons'].append(f'股息率{dividend_yield:.1f}%，提供稳定收益')

        # 添加风险考虑
        debt_ratio = financial_data.get('debt_to_assets')
        if debt_ratio and debt_ratio > 0.5:
            recommendation['risks_to_consider'].append(f'资产负债率{debt_ratio*100:.1f}%较高，财务风险需关注')

        # 添加监控要点
        recommendation['monitoring_points'].append('季度财报发布情况')
        recommendation['monitoring_points'].append('行业政策变化')
        recommendation['monitoring_points'].append('公司重大事项公告')

        return recommendation

    async def _calculate_detailed_score(self, data: Dict[str, Any]) -> Dict[str, float]:
        """计算详细评分"""
        financial_analysis = await self._analyze_financials(data)
        valuation_analysis = await self._analyze_valuation(data)
        dividend_analysis = await self._analyze_dividends(data)
        shareholder_analysis = await self._analyze_shareholders(data)
        industry_analysis = await self._analyze_industry_position(data)

        detailed_score = {
            'profitability_score': financial_analysis.get('profitability', {}).get('score', 0),
            'solvency_score': financial_analysis.get('solvency', {}).get('score', 0),
            'cash_flow_score': financial_analysis.get('cash_flow_quality', {}).get('score', 0),
            'valuation_score': valuation_analysis.get('score', 0),
            'dividend_score': dividend_analysis.get('score', 0),
            'shareholder_score': shareholder_analysis.get('score', 0),
            'industry_score': industry_analysis.get('score', 0),
            'growth_score': 50,  # 默认分，需要历史数据计算
            'quality_score': 60   # 默认分
        }

        # 计算加权总分
        weights = {
            'profitability_score': 0.25,
            'solvency_score': 0.15,
            'cash_flow_score': 0.10,
            'valuation_score': 0.20,
            'dividend_score': 0.10,
            'shareholder_score': 0.05,
            'industry_score': 0.10,
            'growth_score': 0.03,
            'quality_score': 0.02
        }

        weighted_score = sum(detailed_score[key] * weights[key] for key in weights)
        detailed_score['weighted_total'] = round(weighted_score, 2)

        return detailed_score

    async def _save_analysis_result(self, stock_code: str, analysis_result: Dict[str, Any]) -> bool:
        """保存分析结果到数据库"""
        try:
            score_data = {
                'stock_code': stock_code,
                'score_date': datetime.now().strftime('%Y-%m-%d'),
                'overall_score': analysis_result.get('overall_score', 0),
                'profitability_score': analysis_result['score_breakdown'].get('profitability_score', 0),
                'valuation_score': analysis_result['score_breakdown'].get('valuation_score', 0),
                'dividend_score': analysis_result['score_breakdown'].get('dividend_score', 0),
                'growth_score': analysis_result['score_breakdown'].get('growth_score', 0),
                'quality_score': analysis_result['score_breakdown'].get('quality_score', 0),
                'analysis_summary': self._generate_analysis_summary(analysis_result),
                'strengths': self._extract_strengths(analysis_result),
                'weaknesses': self._extract_weaknesses(analysis_result),
                'opportunities': self._extract_opportunities(analysis_result),
                'threats': self._extract_threats(analysis_result),
                'investment_advice': analysis_result['investment_recommendation']['rating']
            }

            return await self.fundamental_db.save_fundamental_score(stock_code, score_data)

        except Exception as e:
            logger.error(f"保存分析结果失败: {e}")
            return False

    def _generate_analysis_summary(self, analysis_result: Dict[str, Any]) -> str:
        """生成分析摘要"""
        score = analysis_result.get('overall_score', 0)
        recommendation = analysis_result['investment_recommendation']['rating']

        if score >= 80:
            return f"综合评分{score}分，{recommendation}。公司基本面优秀，盈利能力强，估值合理，具备长期投资价值。"
        elif score >= 70:
            return f"综合评分{score}分，{recommendation}。公司基本面良好，财务状况稳健，估值具有吸引力。"
        elif score >= 60:
            return f"综合评分{score}分，{recommendation}。公司基本面一般，部分指标表现良好，需关注风险因素。"
        elif score >= 50:
            return f"综合评分{score}分，{recommendation}。公司基本面较弱，存在一定风险，建议谨慎对待。"
        else:
            return f"综合评分{score}分，{recommendation}。公司基本面较差，风险较高，不建议投资。"

    def _extract_strengths(self, analysis_result: Dict[str, Any]) -> str:
        """提取优势"""
        strengths = []
        financial_analysis = analysis_result.get('financial_analysis', {})

        # 盈利能力
        profitability = financial_analysis.get('profitability', {})
        if profitability.get('score', 0) >= 70:
            strengths.append('盈利能力强劲')

        # 偿债能力
        solvency = financial_analysis.get('solvency', {})
        if solvency.get('score', 0) >= 70:
            strengths.append('偿债能力良好')

        # 估值
        valuation = analysis_result.get('valuation_analysis', {})
        if valuation.get('score', 0) >= 70:
            strengths.append('估值具有吸引力')

        return '; '.join(strengths) if strengths else '无明显突出优势'

    def _extract_weaknesses(self, analysis_result: Dict[str, Any]) -> str:
        """提取劣势"""
        weaknesses = []
        financial_analysis = analysis_result.get('financial_analysis', {})

        # 盈利能力
        profitability = financial_analysis.get('profitability', {})
        if profitability.get('score', 0) < 50:
            weaknesses.append('盈利能力较弱')

        # 偿债能力
        solvency = financial_analysis.get('solvency', {})
        if solvency.get('score', 0) < 50:
            weaknesses.append('偿债能力不足')

        # 现金流
        cash_flow = financial_analysis.get('cash_flow_quality', {})
        if cash_flow.get('score', 0) < 50:
            weaknesses.append('现金流质量一般')

        return '; '.join(weaknesses) if weaknesses else '无明显重大劣势'

    def _extract_opportunities(self, analysis_result: Dict[str, Any]) -> str:
        """提取机会"""
        opportunities = []
        industry_analysis = analysis_result.get('industry_comparison', {})

        if industry_analysis.get('score', 0) >= 70:
            opportunities.append('行业地位领先')
        if industry_analysis.get('industry_growth') == '高增长':
            opportunities.append('行业处于高增长阶段')

        return '; '.join(opportunities) if opportunities else '无明显突出机会'

    def _extract_threats(self, analysis_result: Dict[str, Any]) -> str:
        """提取威胁"""
        threats = []
        risk_assessment = analysis_result.get('risk_assessment', {})

        if risk_assessment.get('financial_risk') in ['高', '中高']:
            threats.append('财务风险较高')
        if risk_assessment.get('market_risk') in ['高', '中高']:
            threats.append('市场风险较大')
        if risk_assessment.get('regulatory_risk') in ['高', '中高']:
            threats.append('政策监管风险')

        return '; '.join(threats) if threats else '无明显重大威胁'

    async def analyze_multiple_stocks(self, stock_codes: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        分析多只股票基本面

        Args:
            stock_codes: 股票代码列表

        Returns:
            分析结果字典
        """
        logger.info(f"开始分析 {len(stock_codes)} 只股票的基本面")

        results = {}

        for stock_code in stock_codes:
            try:
                analysis_result = await self.analyze_stock_fundamentals(stock_code)
                results[stock_code] = analysis_result

                # 避免API限频
                await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"分析股票 {stock_code} 失败: {e}")
                results[stock_code] = {
                    'stock_code': stock_code,
                    'error': str(e)
                }

        success_count = len([v for v in results.values() if 'error' not in v])
        logger.info(f"批量基本面分析完成，成功: {success_count}/{len(stock_codes)}")

        return results

    async def get_top_fundamental_stocks(self, limit: int = 20, min_score: float = 70.0) -> List[Dict[str, Any]]:
        """
        获取基本面评分最高的股票

        Args:
            limit: 返回数量限制
            min_score: 最低评分要求

        Returns:
            股票列表
        """
        return await self.fundamental_db.get_top_fundamental_stocks(limit, min_score)

    def _convert_to_frontend_format(self, detailed_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """
        将详细分析结果转换为前端兼容的格式

        Args:
            detailed_analysis: 详细分析结果

        Returns:
            前端兼容的分析结果
        """
        # 提取财务分析数据，确保不为None
        financial_analysis = detailed_analysis.get('financial_analysis', {}) or {}
        valuation_analysis = detailed_analysis.get('valuation_analysis', {}) or {}
        investment_recommendation = detailed_analysis.get('investment_recommendation', {}) or {}

        # 构建前端兼容的数据结构
        frontend_analysis = {
            'stock_code': detailed_analysis.get('stock_code', ''),
            'analysis': {
                # 财务健康度
                'financial_health': {
                    'current_ratio': financial_analysis.get('solvency', {}).get('current_ratio'),
                    'quick_ratio': financial_analysis.get('solvency', {}).get('quick_ratio'),
                    'debt_to_equity': financial_analysis.get('solvency', {}).get('debt_ratio'),
                    'interest_coverage': None,  # 暂时没有这个数据
                    'score': financial_analysis.get('solvency', {}).get('score', 0),
                    'grade': self._score_to_grade(financial_analysis.get('solvency', {}).get('score', 0))
                },
                # 盈利能力
                'profitability': {
                    'roe': financial_analysis.get('profitability', {}).get('roe'),
                    'roa': financial_analysis.get('profitability', {}).get('roa'),
                    'gross_margin': financial_analysis.get('profitability', {}).get('gross_margin'),
                    'net_margin': financial_analysis.get('profitability', {}).get('net_margin'),
                    'operating_margin': None,  # 暂时没有这个数据
                    'score': financial_analysis.get('profitability', {}).get('score', 0),
                    'grade': self._score_to_grade(financial_analysis.get('profitability', {}).get('score', 0))
                },
                # 估值水平
                'valuation': {
                    'pe_ratio': valuation_analysis.get('pe_ratio'),
                    'pb_ratio': valuation_analysis.get('pb_ratio'),
                    'ps_ratio': valuation_analysis.get('ps_ratio'),
                    'dividend_yield': valuation_analysis.get('dividend_yield'),
                    'peg_ratio': valuation_analysis.get('peg_ratio'),
                    'score': valuation_analysis.get('score', 0),
                    'grade': self._score_to_grade(valuation_analysis.get('score', 0))
                },
                # 成长性
                'growth': {
                    'revenue_growth': financial_analysis.get('growth', {}).get('revenue_growth'),
                    'profit_growth': financial_analysis.get('growth', {}).get('profit_growth'),
                    'eps_growth': financial_analysis.get('growth', {}).get('eps_growth'),
                    'asset_growth': financial_analysis.get('growth', {}).get('asset_growth'),
                    'score': financial_analysis.get('growth', {}).get('score', 0),
                    'grade': self._score_to_grade(financial_analysis.get('growth', {}).get('score', 0))
                },
                # 运营效率
                'efficiency': {
                    'asset_turnover': financial_analysis.get('operational_efficiency', {}).get('asset_turnover'),
                    'inventory_turnover': financial_analysis.get('operational_efficiency', {}).get('inventory_turnover'),
                    'receivable_turnover': financial_analysis.get('operational_efficiency', {}).get('receivables_turnover'),
                    'operating_cycle': None,  # 暂时没有这个数据
                    'score': financial_analysis.get('operational_efficiency', {}).get('score', 0),
                    'grade': self._score_to_grade(financial_analysis.get('operational_efficiency', {}).get('score', 0))
                },
                # 总体评分和建议
                'overall_score': detailed_analysis.get('overall_score', 0),
                'recommendation': investment_recommendation.get('rating', '暂无建议'),
                'timestamp': detailed_analysis.get('analysis_date', '')
            },
            'timestamp': detailed_analysis.get('analysis_date', '')
        }

        return frontend_analysis

    def _score_to_grade(self, score: float) -> str:
        """将分数转换为等级"""
        if score >= 80:
            return '优秀'
        elif score >= 60:
            return '良好'
        elif score >= 40:
            return '一般'
        else:
            return '较差'

    async def compare_stocks(self, stock_codes: List[str]) -> Dict[str, Any]:
        """
        比较多只股票的基本面

        Args:
            stock_codes: 股票代码列表

        Returns:
            比较结果
        """
        logger.info(f"开始比较 {len(stock_codes)} 只股票的基本面")

        # 获取所有股票的分析结果
        analysis_results = await self.analyze_multiple_stocks(stock_codes)

        # 提取有效结果
        valid_results = {k: v for k, v in analysis_results.items() if 'error' not in v}

        if not valid_results:
            return {'error': '没有有效的分析结果'}

        # 进行比较分析
        comparison = {
            'compared_stocks': list(valid_results.keys()),
            'comparison_date': datetime.now().isoformat(),
            'score_ranking': [],
            'valuation_comparison': [],
            'profitability_comparison': [],
            'risk_comparison': [],
            'recommendation_summary': {}
        }

        # 评分排名
        score_ranking = []
        for stock_code, result in valid_results.items():
            score_ranking.append({
                'stock_code': stock_code,
                'overall_score': result.get('overall_score', 0),
                'company_name': result.get('basic_analysis', {}).get('company_name', '未知')
            })

        score_ranking.sort(key=lambda x: x['overall_score'], reverse=True)
        comparison['score_ranking'] = score_ranking

        # 估值比较
        for stock_code, result in valid_results.items():
            valuation = result.get('valuation_analysis', {})
            comparison['valuation_comparison'].append({
                'stock_code': stock_code,
                'pe_ratio': valuation.get('pe_ratio'),
                'pb_ratio': valuation.get('pb_ratio'),
                'valuation_assessment': valuation.get('valuation_assessment', '未知')
            })

        # 盈利能力比较
        for stock_code, result in valid_results.items():
            financials = result.get('financial_analysis', {})
            profitability = financials.get('profitability', {})
            comparison['profitability_comparison'].append({
                'stock_code': stock_code,
                'roe': profitability.get('roe'),
                'gross_margin': profitability.get('gross_margin'),
                'profitability_assessment': profitability.get('assessment', '未知')
            })

        # 风险比较
        for stock_code, result in valid_results.items():
            risk = result.get('risk_assessment', {})
            comparison['risk_comparison'].append({
                'stock_code': stock_code,
                'overall_risk': risk.get('overall_risk_level', '未知'),
                'financial_risk': risk.get('financial_risk', '未知'),
                'risk_score': risk.get('risk_score', 0)
            })

        # 投资建议汇总
        recommendation_counts = {}
        for stock_code, result in valid_results.items():
            recommendation = result.get('investment_recommendation', {}).get('rating', '未知')
            recommendation_counts[recommendation] = recommendation_counts.get(recommendation, 0) + 1

        comparison['recommendation_summary'] = recommendation_counts

        return comparison