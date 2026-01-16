"""
基本面数据采集客户端
扩展Tushare客户端，专门处理基本面数据采集
"""

import asyncio
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import pandas as pd
from tqdm import tqdm

import sys
import os

# 添加项目根目录到Python路径
project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

try:
    # 首先尝试相对导入
    from ..data_sources.tushare_client import TushareClient
    from ...utils.fundamental_db import FundamentalDB
except ImportError as e:
    # 如果相对导入失败，尝试绝对导入
    try:
        from data_sources.tushare_client import TushareClient
        from utils.fundamental_db import FundamentalDB
    except ImportError:
        raise ImportError(f"无法导入模块: {e}")

logger = logging.getLogger(__name__)


class FundamentalClient:
    """基本面数据采集客户端"""

    def __init__(self, tushare_client: TushareClient, db_path: str | None = None):
        """
        初始化基本面客户端

        Args:
            tushare_client: Tushare客户端实例
            db_path: 数据库路径
        """
        self.tushare_client = tushare_client
        self.api = tushare_client.pro
        self.fundamental_db = FundamentalDB(db_path)

    def _normalize_stock_code(self, stock_code: str) -> str:
        """
        规范化股票代码格式

        Args:
            stock_code: 股票代码，可以是 '000001' 或 '000001.SZ'

        Returns:
            规范化的股票代码，如 '000001.SZ'
        """
        # 如果已经包含交易所后缀，直接返回
        if '.' in stock_code:
            return stock_code

        # 根据股票代码判断交易所
        # 6开头是上交所，0或3开头是深交所
        if stock_code.startswith('6'):
            return f"{stock_code}.SH"
        elif stock_code.startswith('0') or stock_code.startswith('3'):
            return f"{stock_code}.SZ"
        else:
            # 默认返回深交所格式
            return f"{stock_code}.SZ"

    async def fetch_stock_basic_info(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取股票基本信息

        Args:
            stock_code: 股票代码

        Returns:
            股票基本信息字典
        """
        try:
            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的stock_basic接口
            df = await asyncio.to_thread(
                self.api.stock_basic,
                ts_code=normalized_code,
                fields='ts_code,name,area,industry,market,list_date,list_status,is_hs'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的基本信息")
                return None

            # 转换为字典
            basic_info = df.iloc[0].to_dict()

            # 计算上市天数
            if basic_info.get('list_date'):
                list_date = datetime.strptime(str(basic_info['list_date']), '%Y%m%d')
                days_listed = (datetime.now() - list_date).days
                basic_info['days_listed'] = days_listed

            return basic_info

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 基本信息失败: {e}")
            return None

    async def fetch_company_info(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取公司信息

        Args:
            stock_code: 股票代码

        Returns:
            公司信息字典
        """
        try:
            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的stock_company接口
            df = await asyncio.to_thread(
                self.api.stock_company,
                ts_code=normalized_code,
                fields='ts_code,chairman,manager,secretary,reg_capital,setup_date,province,city,introduction,website,email,office,employees,main_business,business_scope'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的公司信息")
                return None

            return df.iloc[0].to_dict()

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 公司信息失败: {e}")
            return None

    async def fetch_financial_indicators(self, stock_code: str, period: str = '20241231') -> Optional[Dict[str, Any]]:
        """
        获取财务指标数据

        Args:
            stock_code: 股票代码
            period: 报告期，格式如'20241231'

        Returns:
            财务指标字典
        """
        try:
            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的fina_indicator接口获取财务指标
            df = await asyncio.to_thread(
                self.api.fina_indicator,
                ts_code=normalized_code,
                period=period,
                fields='ts_code,ann_date,end_date,roe,roa,grossprofit_margin,profit_to_gr,op_of_gr,ebit_of_gr,roe_yearly,roa2_yearly,roa_yearly,debt_to_assets,assets_to_eqt,ca_to_assets,nca_to_assets,tbassets_to_totalassets,int_to_talcap,eqt_to_talcapital,currentdebt_to_debt,longdeb_to_debt,ocf_to_or,ocf_to_opincome,ocf_to_gr,free_cashflow,ocf_yearly,debt_to_eqt,ocf_to_shortdebt,debt_to_assets_yearly,profit_to_op,roe_dt,roa_dt,roe_yearly_dt,roa_yearly_dt,roe_avg,roa_avg,roe_avg_yearly,roa_avg_yearly,roe_std,roa_std,roe_std_yearly,roa_std_yearly,roe_cv,roa_cv,roe_cv_yearly,roa_cv_yearly,roe_gr,roa_gr,roe_gr_yearly,roa_gr_yearly,roe_rank,roa_rank,roe_rank_yearly,roa_rank_yearly,roe_pct,roa_pct,roe_pct_yearly,roa_pct_yearly,roe_ttm,roa_ttm,roe_ttm_yearly,roa_ttm_yearly,roe_ttm_rank,roa_ttm_rank,roe_ttm_rank_yearly,roa_ttm_rank_yearly,roe_ttm_pct,roa_ttm_pct,roe_ttm_pct_yearly,roa_ttm_pct_yearly'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的财务指标数据")
                return None

            # 获取最新报告期的数据
            latest_report = df.iloc[0].to_dict()

            # 计算关键财务指标
            financial_data = {
                'ts_code': latest_report.get('ts_code'),
                'ann_date': latest_report.get('ann_date'),
                'end_date': latest_report.get('end_date'),
                'roe': latest_report.get('roe'),  # 净资产收益率
                'roa': latest_report.get('roa'),  # 总资产收益率
                'grossprofit_margin': latest_report.get('grossprofit_margin'),  # 毛利率
                'profit_to_gr': latest_report.get('profit_to_gr'),  # 净利率
                'debt_to_assets': latest_report.get('debt_to_assets'),  # 资产负债率
            }
            
            # 添加其他存在的字段
            for key, value in latest_report.items():
                if key not in financial_data and key != 'ts_code':
                    financial_data[key] = value

            return financial_data

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 财务指标失败: {e}")
            return None

    async def fetch_income_statement(self, stock_code: str, period: str = '20241231') -> Optional[Dict[str, Any]]:
        """
        获取利润表数据

        Args:
            stock_code: 股票代码
            period: 报告期

        Returns:
            利润表数据字典
        """
        try:
            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的income接口
            df = await asyncio.to_thread(
                self.api.income,
                ts_code=normalized_code,
                period=period,
                fields='ts_code,ann_date,f_end_date,report_type,comp_type,basic_eps,diluted_eps,total_revenue,revenue,int_income,prem_earned,comm_income,n_commis_income,n_oth_income,n_oth_b_income,prem_income,out_prem,une_prem_reser,reins_income,n_sec_tb_income,n_sec_uw_income,n_asset_mg_income,oth_b_income,fv_value_chg_gain,invest_income,ass_invest_income,forex_gain,total_cogs,oper_cost,int_exp,comm_exp,biz_tax_surch,sell_exp,admin_exp,fin_exp,assets_impair_loss,prem_refund,compens_payout,reser_insur_liab,div_payt,reins_exp,oper_exp,compens_payout_refu,insur_reser_refu,reins_cost_refund,other_bus_cost,operate_profit,non_oper_income,non_oper_exp,nca_disploss,total_profit,income_tax,n_income,n_income_attr_p'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的利润表数据")
                return None

            data = df.iloc[0].to_dict()
            
            # 日期回退逻辑
            if not data.get('f_end_date'):
                if data.get('end_date'):
                    data['f_end_date'] = data['end_date']
                elif data.get('ann_date'):
                    data['f_end_date'] = data['ann_date']
                
            return data

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 利润表失败: {e}")
            return None

    async def fetch_balance_sheet(self, stock_code: str, period: str = '20241231') -> Optional[Dict[str, Any]]:
        """
        获取资产负债表数据

        Args:
            stock_code: 股票代码
            period: 报告期

        Returns:
            资产负债表数据字典
        """
        try:
            # 使用Tushare的balancesheet接口
            df = await asyncio.to_thread(
                self.api.balancesheet,
                ts_code=stock_code,
                period=period,
                fields='ts_code,ann_date,f_end_date,report_type,comp_type,total_share,cap_rese,undistr_porfit,minority_int,total_hldr_eqy_exc_min_int,total_hldr_eqy_inc_min_int,total_liab,total_assets,fix_assets,current_assets,goodwill,lt_amor_exp,defer_tax_assets,decr_in_disbur,oth_nca,total_nca,cash_reser_cb,depos_in_oth_bfi,prec_metals,deriv_assets,rr_reins_une_prem,rr_reins_outstanding_clm,rr_reins_lins_liab,rr_reins_lthins_liab,refund_depos,ph_pledge_loans,refund_cap_depos,indep_acct_assets,client_depos,client_prov,transac_seat_fee,invest_as_receiv,total_assets_oth,lt_equity_invest,st_loans,lt_loans,accept_depos,depos,loan_oth_bank,trading_fl,trading_fa,deriv_liab,customers_deposit_oth,oth_comp_depos,oth_liab_fin,accept_depos_oth,oth_liab,prem_receiv_adva,depos_received,ph_invest,reser_une_prem,reser_outstanding_claims,reser_lins_liab,reser_lthins_liab,indept_acc_liab,pledge_borr,indem_payable,policy_div_payable,total_liab_oth,capital,capital_res,special_res,surplus_res,ordin_risk_res,retained_earnings,forex_diff,invest_loss_unconf,minority_int_oth,total_hldr_eqy_oth,loan_fund,stock_fund,other_fund'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的资产负债表数据")
                return None

            data = df.iloc[0].to_dict()
            
            # 字段映射
            if 'cap_rese' in data and 'capital_res' not in data:
                data['capital_res'] = data['cap_rese']
            
            if 'cap_rese' in data:
                del data['cap_rese']

            # 映射 undistr_porfit -> retained_earnings
            if 'undistr_porfit' in data and 'retained_earnings' not in data:
                data['retained_earnings'] = data['undistr_porfit']
            
            if 'undistr_porfit' in data:
                del data['undistr_porfit']

            # 日期回退逻辑
            if not data.get('f_end_date'):
                if data.get('end_date'):
                    data['f_end_date'] = data['end_date']
                elif data.get('ann_date'):
                    data['f_end_date'] = data['ann_date']
                
            return data
        except Exception as e:
            logger.error(f"获取股票 {stock_code} 资产负债表失败: {e}")
            return None

    async def fetch_cash_flow(self, stock_code: str, period: str = '20241231') -> Optional[Dict[str, Any]]:
        """
        获取现金流量表数据

        Args:
            stock_code: 股票代码
            period: 报告期

        Returns:
            现金流量表数据字典
        """
        try:
            # 使用Tushare的cashflow接口
            df = await asyncio.to_thread(
                self.api.cashflow,
                ts_code=stock_code,
                period=period,
                fields='ts_code,ann_date,f_end_date,report_type,comp_type,net_profit,finan_exp,c_fr_sale_sg,c_fr_oth_operate_a,total_c_fr_operate_a,c_paid_goods_s,c_paid_to_for_empl,c_paid_for_taxes,total_c_paid_operate_a,n_cashflow_act,n_cfr_incr_cap,cfr_incr_borr,cfr_cash_incr,cfr_fr_issue_bond,total_cfr_fin_act,c_paid_for_debts,c_paid_div_prof_int,total_c_paid_fin_act,n_cashflow_fin_act,forex_chg,n_incr_cash_cash_equ,c_cash_equ_beg_period,c_cash_equ_end_period,free_cashflow'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的现金流量表数据")
                return None

            data = df.iloc[0].to_dict()
            
            # 日期回退逻辑
            if not data.get('f_end_date'):
                if data.get('end_date'):
                    data['f_end_date'] = data['end_date']
                elif data.get('ann_date'):
                    data['f_end_date'] = data['ann_date']
                
            return data

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 现金流量表失败: {e}")
            return None

    async def fetch_dividend_data(self, stock_code: str) -> Optional[List[Dict[str, Any]]]:
        """
        获取分红数据

        Args:
            stock_code: 股票代码

        Returns:
            分红数据列表
        """
        try:
            # 检查Tushare API是否可用
            if not self.api:
                logger.warning("Tushare API不可用，无法获取分红数据")
                return None

            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的dividend接口
            df = await asyncio.to_thread(
                self.api.dividend,
                ts_code=normalized_code,
                fields='ts_code,end_date,ann_date,div_proc,stk_div,stk_bo_rate,stk_co_rate,cash_div,cash_div_tax,record_date,ex_date,pay_date,div_listdate,imp_ann_date,base_date,base_share'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的分红数据")
                return None

            # 获取最近5年的分红数据
            df_sorted = df.sort_values('end_date', ascending=False)
            recent_dividends = df_sorted.head(5).to_dict('records')

            # 清理数据中的 nan 值
            import math
            cleaned_dividends = []
            for dividend in recent_dividends:
                cleaned = {}
                for key, value in dividend.items():
                    if isinstance(value, float) and math.isnan(value):
                        cleaned[key] = None
                    else:
                        cleaned[key] = value
                cleaned_dividends.append(cleaned)

            return cleaned_dividends

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 分红数据失败: {e}")
            return None

    async def fetch_shareholder_data(self, stock_code: str) -> Optional[List[Dict[str, Any]]]:
        """
        获取股东数据

        Args:
            stock_code: 股票代码

        Returns:
            股东数据列表
        """
        try:
            # 检查Tushare API是否可用
            if not self.api:
                logger.warning("Tushare API不可用，无法获取股东数据")
                return None

            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的top10_holders接口
            df = await asyncio.to_thread(
                self.api.top10_holders,
                ts_code=normalized_code,
                fields='ts_code,ann_date,end_date,holder_name,hold_amount,hold_ratio'
            )

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的股东数据")
                return None

            # 获取最新报告期的前十大股东
            latest_date = df['end_date'].max()
            latest_holders = df[df['end_date'] == latest_date].to_dict('records')

            return latest_holders

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 股东数据失败: {e}")
            return None

    async def fetch_valuation_data(self, stock_code: str) -> Optional[Dict[str, Any]]:
        """
        获取估值数据

        Args:
            stock_code: 股票代码

        Returns:
            估值数据字典
        """
        try:
            # 检查Tushare API是否可用
            if not self.api:
                logger.warning("Tushare API不可用，无法获取估值数据")
                return None

            # 规范化股票代码
            normalized_code = self._normalize_stock_code(stock_code)

            # 使用Tushare的daily_basic接口获取最新估值数据
            today = datetime.now().strftime('%Y%m%d')
            df = await asyncio.to_thread(
                self.api.daily_basic,
                ts_code=normalized_code,
                trade_date=today,
                fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,total_share,float_share,free_share,total_mv,circ_mv'
            )

            if df.empty:
                # 如果今天没有数据，获取最近一天的数据
                df = await asyncio.to_thread(
                    self.api.daily_basic,
                    ts_code=normalized_code,
                    fields='ts_code,trade_date,close,turnover_rate,turnover_rate_f,volume_ratio,pe,pe_ttm,pb,ps,ps_ttm,dv_ratio,dv_ttm,total_share,float_share,free_share,total_mv,circ_mv'
                )
                df = df.sort_values('trade_date', ascending=False).head(1)

            if df.empty:
                logger.warning(f"未找到股票 {stock_code} 的估值数据")
                return None

            valuation_data = df.iloc[0].to_dict()

            # 添加估值分析
            pe = valuation_data.get('pe')
            pb = valuation_data.get('pb')

            # PE估值分析
            if pe:
                if pe < 10:
                    pe_valuation = '低估'
                elif pe < 20:
                    pe_valuation = '合理'
                elif pe < 30:
                    pe_valuation = '偏高'
                else:
                    pe_valuation = '高估'
                valuation_data['pe_valuation'] = pe_valuation

            # PB估值分析
            if pb:
                if pb < 1:
                    pb_valuation = '低估'
                elif pb < 2:
                    pb_valuation = '合理'
                elif pb < 3:
                    pb_valuation = '偏高'
                else:
                    pb_valuation = '高估'
                valuation_data['pb_valuation'] = pb_valuation

            return valuation_data

        except Exception as e:
            logger.error(f"获取股票 {stock_code} 估值数据失败: {e}")
            return None

    def _log_debug(self, msg):
        with open("fundamental_debug.log", "a", encoding="utf-8") as f:
            f.write(f"{datetime.now().isoformat()} - {msg}\n")

    async def fetch_comprehensive_fundamental_data(self, stock_code: str) -> Dict[str, Any]:
        """
        获取综合基本面数据

        Args:
            stock_code: 股票代码

        Returns:
            综合基本面数据字典
        """
        self._log_debug(f"开始获取股票 {stock_code} 的综合基本面数据")
        logger.info(f"开始获取股票 {stock_code} 的综合基本面数据")

        # 串行获取所有基本面数据，避免并发问题
        try:
            self._log_debug(f"Fetching basic_info for {stock_code}")
            basic_info = await self.fetch_stock_basic_info(stock_code)
            
            self._log_debug(f"Fetching company_info for {stock_code}")
            company_info = await self.fetch_company_info(stock_code)
            
            self._log_debug(f"Fetching financial_indicators for {stock_code}")
            financial_indicators = await self.fetch_financial_indicators(stock_code)
            
            self._log_debug(f"Fetching income_statement for {stock_code}")
            income_statement = await self.fetch_income_statement(stock_code)
            
            self._log_debug(f"Fetching balance_sheet for {stock_code}")
            balance_sheet = await self.fetch_balance_sheet(stock_code)
            
            self._log_debug(f"Fetching cash_flow for {stock_code}")
            cash_flow = await self.fetch_cash_flow(stock_code)
            
            self._log_debug(f"Fetching dividend_data for {stock_code}")
            dividend_data = await self.fetch_dividend_data(stock_code)
            
            self._log_debug(f"Fetching shareholder_data for {stock_code}")
            shareholder_data = await self.fetch_shareholder_data(stock_code)
            
            self._log_debug(f"Fetching valuation_data for {stock_code}")
            valuation_data = await self.fetch_valuation_data(stock_code)
            
            self._log_debug(f"All fetch tasks completed for {stock_code}")
        except Exception as e:
            self._log_debug(f"Error fetching data for {stock_code}: {e}")
            logger.error(f"获取数据过程中发生错误: {e}")
            # 返回一个包含错误信息的字典，而不是抛出异常
            return {
                'stock_code': stock_code,
                'error': str(e),
                'basic_info': None,
                'company_info': None,
                'financial_indicators': None,
                'income_statement': None,
                'balance_sheet': None,
                'cash_flow': None,
                'dividend_data': None,
                'shareholder_data': None,
                'valuation_data': None,
                'fetch_time': datetime.now().isoformat(),
                'fundamental_score': 0
            }

        # 处理结果
        comprehensive_data = {
            'stock_code': stock_code,
            'basic_info': basic_info,
            'company_info': company_info,
            'financial_indicators': financial_indicators,
            'income_statement': income_statement,
            'balance_sheet': balance_sheet,
            'cash_flow': cash_flow,
            'dividend_data': dividend_data,
            'shareholder_data': shareholder_data,
            'valuation_data': valuation_data,
            'fetch_time': datetime.now().isoformat(),
        }

        # 计算基本面评分
        comprehensive_data['fundamental_score'] = self._calculate_fundamental_score(comprehensive_data)

        # 清理数据中的 nan 值，确保JSON序列化正常
        comprehensive_data = self._clean_nan_values(comprehensive_data)

        logger.info(f"完成股票 {stock_code} 的综合基本面数据获取，评分: {comprehensive_data['fundamental_score']}")

        return comprehensive_data

    def _clean_nan_values(self, data: Any) -> Any:
        import math
        import numbers

        if isinstance(data, dict):
            return {k: self._clean_nan_values(v) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._clean_nan_values(item) for item in data]
        elif isinstance(data, numbers.Real):
            try:
                v = float(data)
            except Exception:
                return data
            if math.isnan(v) or math.isinf(v):
                return None
            return data
        else:
            return data

    def _calculate_fundamental_score(self, data: Dict[str, Any]) -> float:
        """
        计算基本面综合评分

        Args:
            data: 基本面数据

        Returns:
            基本面评分（0-100）
        """
        score = 50.0  # 基础分

        try:
            # 1. 财务指标评分（权重30%）
            financial_score = 0
            financial_data = data.get('financial_indicators')
            if financial_data:
                financial_score = 50  # 基础分

                # ROE评分
                roe = financial_data.get('roe')
                if roe:
                    if roe > 20:
                        financial_score += 20
                    elif roe > 15:
                        financial_score += 15
                    elif roe > 10:
                        financial_score += 10
                    elif roe > 5:
                        financial_score += 5
                    elif roe <= 0:
                        financial_score -= 10

                # 毛利率评分
                gross_margin = financial_data.get('grossprofit_margin')
                if gross_margin:
                    if gross_margin > 40:
                        financial_score += 15
                    elif gross_margin > 30:
                        financial_score += 10
                    elif gross_margin > 20:
                        financial_score += 5
                    elif gross_margin <= 10:
                        financial_score -= 5

                # 净利率评分
                net_margin = financial_data.get('profit_to_gr')
                if net_margin:
                    if net_margin > 20:
                        financial_score += 15
                    elif net_margin > 15:
                        financial_score += 10
                    elif net_margin > 10:
                        financial_score += 5
                    elif net_margin <= 0:
                        financial_score -= 10

                financial_score = max(0, min(100, financial_score))

            # 2. 估值评分（权重30%）
            valuation_score = 0
            valuation_data = data.get('valuation_data')
            if valuation_data:
                valuation_score = 50  # 基础分

                # PE评分
                pe = valuation_data.get('pe')
                if pe:
                    if pe < 10:
                        valuation_score += 25
                    elif pe < 15:
                        valuation_score += 15
                    elif pe < 20:
                        valuation_score += 5
                    elif pe > 30:
                        valuation_score -= 15
                    elif pe > 40:
                        valuation_score -= 25

                # PB评分
                pb = valuation_data.get('pb')
                if pb:
                    if pb < 1:
                        valuation_score += 25
                    elif pb < 1.5:
                        valuation_score += 15
                    elif pb < 2:
                        valuation_score += 5
                    elif pb > 3:
                        valuation_score -= 15
                    elif pb > 5:
                        valuation_score -= 25

                valuation_score = max(0, min(100, valuation_score))

            # 3. 分红评分（权重20%）
            dividend_score = 0
            dividend_data = data.get('dividend_data')
            if dividend_data and len(dividend_data) > 0:
                dividend_score = 50  # 基础分

                # 检查是否有连续分红
                recent_years = min(5, len(dividend_data))
                if recent_years >= 3:
                    dividend_score += 20
                elif recent_years >= 1:
                    dividend_score += 10

                # 检查股息率
                if valuation_data and valuation_data.get('dv_ratio'):
                    dv_ratio = valuation_data['dv_ratio']
                    if dv_ratio > 3:
                        dividend_score += 20
                    elif dv_ratio > 2:
                        dividend_score += 10
                    elif dv_ratio > 1:
                        dividend_score += 5

                dividend_score = max(0, min(100, dividend_score))

            # 4. 成长性评分（权重20%）
            growth_score = 50  # 基础分

            # 综合计算
            score = (
                financial_score * 0.3 +
                valuation_score * 0.3 +
                dividend_score * 0.2 +
                growth_score * 0.2
            )

            # 确保分数在0-100之间
            score = max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算基本面评分失败: {e}")

        return round(score, 2)

    async def batch_fetch_fundamental_data(self, stock_codes: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        批量获取基本面数据

        Args:
            stock_codes: 股票代码列表

        Returns:
            股票代码到基本面数据的映射
        """
        logger.info(f"开始批量获取 {len(stock_codes)} 只股票的基本面数据")

        results = {}

        for stock_code in tqdm(stock_codes, desc="获取基本面数据"):
            try:
                data = await self.fetch_comprehensive_fundamental_data(stock_code)
                results[stock_code] = data

                # 避免API限频
                await asyncio.sleep(0.1)

            except Exception as e:
                logger.error(f"获取股票 {stock_code} 基本面数据失败: {e}")
                results[stock_code] = {'error': str(e)}

        logger.info(f"完成批量基本面数据获取，成功: {len([v for v in results.values() if 'error' not in v])}/{len(stock_codes)}")

        return results

    async def save_fundamental_data_to_db(self, stock_code: str, data: Dict[str, Any]) -> bool:
        """
        保存基本面数据到数据库

        Args:
            stock_code: 股票代码
            data: 基本面数据

        Returns:
            是否保存成功
        """
        self._log_debug(f"Starting save_fundamental_data_to_db for {stock_code}")
        try:
            saved_count = 0

            # 1. 保存股票基本信息扩展
            basic_info = data.get('basic_info')
            company_info = data.get('company_info')
            if basic_info or company_info:
                self._log_debug(f"Saving basic_info/company_info for {stock_code}")
                extended_data = {}
                if basic_info:
                    extended_data.update(basic_info)
                if company_info:
                    extended_data.update(company_info)

                # 移除 ts_code
                if 'ts_code' in extended_data:
                    del extended_data['ts_code']

                if extended_data:
                    await self.fundamental_db.save_stock_basic_extended(stock_code, extended_data)
                    saved_count += 1

            # 2. 保存财务指标
            financial_indicators = data.get('financial_indicators')
            if financial_indicators:
                self._log_debug(f"Saving financial_indicators for {stock_code}")
                if isinstance(financial_indicators, dict):
                    indicators_list = [financial_indicators]
                else:
                    indicators_list = financial_indicators
                
                # 移除 ts_code
                for indicator in indicators_list:
                    if 'ts_code' in indicator:
                        del indicator['ts_code']

                saved = await self.fundamental_db.save_financial_indicators(stock_code, indicators_list)
                if saved > 0:
                    saved_count += 1

            # 3. 保存财务报表
            income_statement = data.get('income_statement')
            if income_statement:
                self._log_debug(f"Saving income_statement for {stock_code}")
                if 'ts_code' in income_statement:
                    del income_statement['ts_code']
                await self.fundamental_db.save_income_statement(stock_code, income_statement)
                saved_count += 1

            balance_sheet = data.get('balance_sheet')
            if balance_sheet:
                self._log_debug(f"Saving balance_sheet for {stock_code}")
                if 'ts_code' in balance_sheet:
                    del balance_sheet['ts_code']
                await self.fundamental_db.save_balance_sheet(stock_code, balance_sheet)
                saved_count += 1

            cash_flow = data.get('cash_flow')
            if cash_flow:
                self._log_debug(f"Saving cash_flow for {stock_code}")
                if 'ts_code' in cash_flow:
                    del cash_flow['ts_code']
                await self.fundamental_db.save_cash_flow_statement(stock_code, cash_flow)
                saved_count += 1

            # 4. 保存分红数据
            dividend_data = data.get('dividend_data')
            if dividend_data:
                self._log_debug(f"Saving dividend_data for {stock_code}")
                for dividend in dividend_data:
                    if 'ts_code' in dividend:
                        del dividend['ts_code']
                    await self.fundamental_db.save_dividend_data(stock_code, dividend)
                saved_count += 1

            # 5. 保存股东数据
            shareholder_data = data.get('shareholder_data')
            if shareholder_data:
                self._log_debug(f"Saving shareholder_data for {stock_code}")
                for shareholder in shareholder_data:
                    if 'ts_code' in shareholder:
                        del shareholder['ts_code']
                saved = await self.fundamental_db.save_shareholder_data(stock_code, shareholder_data)
                if saved > 0:
                    saved_count += 1

            # 6. 保存基本面评分
            fundamental_score = data.get('fundamental_score')
            if fundamental_score is not None:
                self._log_debug(f"Saving fundamental_score for {stock_code}")
                score_data = {
                    'stock_code': stock_code,
                    'score_date': datetime.now().strftime('%Y-%m-%d'),
                    'overall_score': fundamental_score,
                    'profitability_score': fundamental_score * 0.3,  # 示例计算
                    'valuation_score': fundamental_score * 0.3,
                    'dividend_score': fundamental_score * 0.2,
                    'growth_score': fundamental_score * 0.2,
                    'quality_score': fundamental_score * 0.2,
                    'analysis_summary': '基本面数据已采集并评分',
                    'strengths': '财务指标良好，估值合理',
                    'weaknesses': '成长性一般',
                    'opportunities': '行业前景良好',
                    'threats': '市场竞争激烈',
                    'investment_advice': '建议关注'
                }
                await self.fundamental_db.save_fundamental_score(stock_code, score_data)
                saved_count += 1

            self._log_debug(f"Save completed for {stock_code}, count: {saved_count}")
            logger.info(f"股票 {stock_code} 基本面数据保存完成，共保存 {saved_count} 项数据")
            return saved_count > 0

        except Exception as e:
            self._log_debug(f"Error saving data for {stock_code}: {e}")
            logger.error(f"保存股票 {stock_code} 基本面数据到数据库失败: {e}")
            return False

    async def fetch_and_save_fundamental_data(self, stock_code: str) -> Dict[str, Any]:
        """
        获取并保存基本面数据

        Args:
            stock_code: 股票代码

        Returns:
            基本面数据字典
        """
        try:
            # 获取数据
            data = await self.fetch_comprehensive_fundamental_data(stock_code)

            # 保存到数据库
            save_success = await self.save_fundamental_data_to_db(stock_code, data)

            if save_success:
                data['save_status'] = 'success'
                data['save_time'] = datetime.now().isoformat()
            else:
                data['save_status'] = 'failed'

            return data

        except Exception as e:
            logger.error(f"获取并保存股票 {stock_code} 基本面数据失败: {e}")
            return {
                'stock_code': stock_code,
                'error': str(e),
                'save_status': 'failed'
            }

    async def batch_fetch_and_save_fundamental_data(self, stock_codes: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        批量获取并保存基本面数据

        Args:
            stock_codes: 股票代码列表

        Returns:
            处理结果字典
        """
        logger.info(f"开始批量获取并保存 {len(stock_codes)} 只股票的基本面数据")

        results = {}

        for stock_code in tqdm(stock_codes, desc="获取并保存基本面数据"):
            try:
                data = await self.fetch_and_save_fundamental_data(stock_code)
                results[stock_code] = data

                # 避免API限频
                await asyncio.sleep(0.2)

            except Exception as e:
                logger.error(f"处理股票 {stock_code} 基本面数据失败: {e}")
                results[stock_code] = {
                    'stock_code': stock_code,
                    'error': str(e),
                    'save_status': 'failed'
                }

        success_count = len([v for v in results.values() if v.get('save_status') == 'success'])
        logger.info(f"批量基本面数据处理完成，成功: {success_count}/{len(stock_codes)}")

        return results
