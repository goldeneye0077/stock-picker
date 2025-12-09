"""
基本面数据采集客户端
扩展Tushare客户端，专门用于采集基本面数据
"""

import pandas as pd
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from loguru import logger
import asyncio
import time

from .tushare_client import TushareClient


class FundamentalClient:
    """基本面数据采集客户端"""

    def __init__(self, tushare_client: TushareClient = None):
        self.tushare_client = tushare_client or TushareClient()
        self.request_delay = 0.6  # Tushare API请求延迟（秒）

    async def _rate_limit(self):
        """API请求频率限制"""
        await asyncio.sleep(self.request_delay)

    async def get_financial_indicators(self, ts_code: str, start_date: str = None,
                                      end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取财务指标数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)

        Returns:
            财务指标DataFrame，包含以下字段：
            - ts_code: 股票代码
            - ann_date: 公告日期
            - end_date: 报告期
            - eps: 每股收益(元)
            - dt_eps: 稀释每股收益(元)
            - total_revenue_ps: 每股营业收入(元)
            - revenue_ps: 每股营业收入(元)
            - capital_rese_ps: 每股资本公积(元)
            - surplus_rese_ps: 每股盈余公积(元)
            - undist_profit_ps: 每股未分配利润(元)
            - extra_item: 非经常性损益(元)
            - profit_dedt: 扣除非经常性损益后的净利润(元)
            - gross_margin: 毛利率(%)
            - current_ratio: 流动比率
            - quick_ratio: 速动比率
            - cash_ratio: 现金比率
            - ar_turn: 应收账款周转率(次)
            - ca_turn: 流动资产周转率(次)
            - fa_turn: 固定资产周转率(次)
            - assets_turn: 总资产周转率(次)
            - op_income: 经营活动净收益(元)
            - valuechange_income: 价值变动净收益(元)
            - interst_income: 利息费用(元)
            - daa: 折旧与摊销(元)
            - ebit: 息税前利润(元)
            - ebitda: 息税折旧摊销前利润(元)
            - fcff: 企业自由现金流量(元)
            - fcfe: 股权自由现金流量(元)
            - current_exint: 无息流动负债(元)
            - noncurrent_exint: 无息非流动负债(元)
            - interestdebt: 带息债务(元)
            - netdebt: 净债务(元)
            - tangible_asset: 有形资产(元)
            - working_capital: 营运资金(元)
            - networking_capital: 营运流动资本(元)
            - invest_capital: 全部投入资本(元)
            - retained_earnings: 留存收益(元)
            - diluted2_eps: 期末摊薄每股收益(元)
            - bps: 每股净资产(元)
            - ocfps: 每股经营活动产生的现金流量净额(元)
            - retainedps: 每股留存收益(元)
            - cfps: 每股现金流量净额(元)
            - ebit_ps: 每股息税前利润(元)
            - fcff_ps: 每股企业自由现金流量(元)
            - fcfe_ps: 每股股东自由现金流量(元)
            - netprofit_margin: 销售净利率(%)
            - grossprofit_margin: 销售毛利率(%)
            - cogs_of_sales: 销售成本率(%)
            - expense_of_sales: 销售期间费用率(%)
            - profit_to_gr: 净利润/营业总收入(%)
            - saleexp_to_gr: 销售费用/营业总收入(%)
            - adminexp_of_gr: 管理费用/营业总收入(%)
            - finaexp_of_gr: 财务费用/营业总收入(%)
            - impai_ttm: 资产减值损失/营业总收入(%)
            - gc_of_gr: 营业总成本/营业总收入(%)
            - op_of_gr: 营业利润/营业总收入(%)
            - ebit_of_gr: 息税前利润/营业总收入(%)
            - roe: 净资产收益率(%)
            - roe_waa: 加权平均净资产收益率(%)
            - roe_dt: 净资产收益率(扣除非经常损益)(%)
            - roa: 总资产报酬率(%)
            - npta: 总资产净利润(%)
            - roic: 投入资本回报率(%)
            - roe_yearly: 年化净资产收益率(%)
            - roa2_yearly: 年化总资产报酬率(%)
            - roe_avg: 平均净资产收益率(%)
            - opincome_of_ebt: 经营活动净收益/利润总额(%)
            - investincome_of_ebt: 价值变动净收益/利润总额(%)
            - n_op_profit_of_ebt: 营业外收支净额/利润总额(%)
            - tax_to_ebt: 所得税/利润总额(%)
            - dtprofit_to_profit: 扣除非经常损益后的净利润/净利润(%)
            - salescash_to_or: 销售商品提供劳务收到的现金/营业收入(%)
            - ocf_to_or: 经营活动产生的现金流量净额/营业收入(%)
            - ocf_to_opincome: 经营活动产生的现金流量净额/经营活动净收益(%)
            - capitalized_to_da: 资本支出/折旧和摊销(%)
            - debt_to_assets: 资产负债率(%)
            - assets_to_eqt: 权益乘数
            - dp_assets_to_eqt: 权益乘数(杜邦分析)
            - ca_to_assets: 流动资产/总资产(%)
            - nca_to_assets: 非流动资产/总资产(%)
            - tbassets_to_totalassets: 有形资产/总资产(%)
            - int_to_talcap: 带息债务/全部投入资本(%)
            - eqt_to_talcapital: 归属于母公司的股东权益/全部投入资本(%)
            - currentdebt_to_debt: 流动负债/负债合计(%)
            - longdeb_to_debt: 非流动负债/负债合计(%)
            - ocf_to_shortdebt: 经营活动产生的现金流量净额/流动负债(%)
            - debt_to_eqt: 产权比率
            - eqt_to_debt: 归属于母公司的股东权益/负债合计(%)
            - eqt_to_interestdebt: 归属于母公司的股东权益/带息债务(%)
            - tangibleasset_to_debt: 有形资产/负债合计(%)
            - tangasset_to_intdebt: 有形资产/带息债务(%)
            - tangibleasset_to_netdebt: 有形资产/净债务(%)
            - ocf_to_debt: 经营活动产生的现金流量净额/负债合计(%)
            - ocf_to_interestdebt: 经营活动产生的现金流量净额/带息债务(%)
            - ocf_to_netdebt: 经营活动产生的现金流量净额/净债务(%)
            - ebit_to_interest: 已获利息倍数(EBIT/利息费用)
            - longdebt_to_workingcapital: 长期债务与营运资金比率
            - ebitda_to_debt: 息税折旧摊销前利润/负债合计(%)
            - turn_days: 营业周期(天)
            - roa_yearly: 年化总资产净利率(%)
            - roa_dp: 总资产净利率(杜邦分析)(%)
            - fixed_assets: 固定资产合计(元)
            - profit_prefin_exp: 扣除财务费用前营业利润(元)
            - non_op_profit: 营业外收支净额(元)
            - op_to_ebt: 营业利润/利润总额(%)
            - nop_to_ebt: 营业外收支净额/利润总额(%)
            - ocf_to_profit: 经营活动产生的现金流量净额/净利润(%)
            - cash_to_liqdebt: 现金到期债务比
            - cash_to_liqdebt_withinterest: 现金流动负债比
            - op_to_liqdebt: 经营现金流动负债比
            - op_to_debt: 经营现金负债总额比
            - roic_yearly: 年化投入资本回报率(%)
            - total_fa_trun: 固定资产合计周转率
            - profit_to_op: 利润总额/营业收入(%)
            - q_opincome: 经营活动单季度净收益(元)
            - q_investincome: 价值变动单季度净收益(元)
            - q_dtprofit: 扣除非经常损益后的单季度净利润(元)
            - q_eps: 每股收益(单季度)(元)
            - q_netprofit_margin: 销售净利率(单季度)(%)
            - q_gsprofit_margin: 销售毛利率(单季度)(%)
            - q_exp_to_sales: 销售期间费用率(单季度)(%)
            - q_profit_to_gr: 净利润/营业总收入(单季度)(%)
            - q_saleexp_to_gr: 销售费用/营业总收入(单季度)(%)
            - q_adminexp_to_gr: 管理费用/营业总收入(单季度)(%)
            - q_finaexp_to_gr: 财务费用/营业总收入(单季度)(%)
            - q_impair_to_gr_ttm: 资产减值损失/营业总收入(单季度)(%)
            - q_gc_to_gr: 营业总成本/营业总收入(单季度)(%)
            - q_op_to_gr: 营业利润/营业总收入(单季度)(%)
            - q_roe: 净资产收益率(单季度)(%)
            - q_dt_roe: 净资产单季度收益率(扣除非经常损益)(%)
            - q_npta: 总资产净利润(单季度)(%)
            - q_opincome_to_ebt: 经营活动净收益/利润总额(单季度)(%)
            - q_investincome_to_ebt: 价值变动净收益/利润总额(单季度)(%)
            - q_dtprofit_to_profit: 扣除非经常损益后的净利润/净利润(单季度)(%)
            - q_salescash_to_or: 销售商品提供劳务收到的现金/营业收入(单季度)(%)
            - q_ocf_to_sales: 经营活动产生的现金流量净额/营业收入(单季度)(%)
            - q_ocf_to_or: 经营活动产生的现金流量净额/营业收入(单季度)(%)
            - basic_eps_yoy: 基本每股收益同比增长率(%)
            - dt_eps_yoy: 稀释每股收益同比增长率(%)
            - cfps_yoy: 每股经营活动产生的现金流量净额同比增长率(%)
            - op_yoy: 营业利润同比增长率(%)
            - ebt_yoy: 利润总额同比增长率(%)
            - netprofit_yoy: 归属母公司股东的净利润同比增长率(%)
            - dt_netprofit_yoy: 归属母公司股东的净利润-扣除非经常损益同比增长率(%)
            - ocf_yoy: 经营活动产生的现金流量净额同比增长率(%)
            - roe_yoy: 净资产收益率(摊薄)同比增长率(%)
            - bps_yoy: 每股净资产相对年初增长率(%)
            - assets_yoy: 资产总计相对年初增长率(%)
            - eqt_yoy: 归属母公司的股东权益相对年初增长率(%)
            - tr_yoy: 营业总收入同比增长率(%)
            - or_yoy: 营业收入同比增长率(%)
            - q_gr_yoy: 营业总收入同比增长率(%)(单季度)
            - q_gr_qoq: 营业总收入环比增长率(%)(单季度)
            - q_sales_yoy: 营业收入同比增长率(%)(单季度)
            - q_sales_qoq: 营业收入环比增长率(%)(单季度)
            - q_op_yoy: 营业利润同比增长率(%)(单季度)
            - q_op_qoq: 营业利润环比增长率(%)(单季度)
            - q_profit_yoy: 净利润同比增长率(%)(单季度)
            - q_profit_qoq: 净利润环比增长率(%)(单季度)
            - q_netprofit_yoy: 归属母公司股东的净利润同比增长率(%)(单季度)
            - q_netprofit_qoq: 归属母公司股东的净利润环比增长率(%)(单季度)
            - equity_yoy: 净资产同比增长率
            - rd_exp: 研发费用
            - update_flag: 更新标识
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            # 设置默认日期范围
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365*3)).strftime('%Y%m%d')  # 3年数据

            # 获取财务指标数据
            df = self.tushare_client.pro.fina_indicator(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['end_date'] = pd.to_datetime(df['end_date'])
                df = df.sort_values('end_date')
                logger.info(f"获取财务指标数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到财务指标数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取财务指标数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_income_statement(self, ts_code: str, start_date: str = None,
                                  end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取利润表数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)

        Returns:
            利润表DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            # 设置默认日期范围
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365*3)).strftime('%Y%m%d')

            df = self.tushare_client.pro.income(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date,
                fields='ts_code,ann_date,f_ann_date,end_date,report_type,comp_type,basic_eps,diluted_eps,'
                       'total_revenue,revenue,int_income,prem_earned,comm_income,n_commis_income,'
                       'n_oth_income,n_oth_b_income,prem_income,out_prem,une_prem_reser,reins_income,'
                       'n_sec_tb_income,n_sec_uw_income,n_asset_mg_income,oth_b_income,fv_value_chg_gain,'
                       'invest_income,ass_invest_income,forex_gain,total_cogs,oper_cost,int_exp,comm_exp,'
                       'biz_tax_surch,sell_exp,admin_exp,fin_exp,assets_impair_loss,prem_refund,compens_payout,'
                       'reser_insur_liab,div_payt,reins_exp,oper_exp,compens_payout_refu,insur_reser_refu,'
                       'reins_cost_refund,other_bus_cost,operate_profit,non_oper_income,non_oper_exp,'
                       'nca_disploss,total_profit,income_tax,n_income,net_profit,n_income_attr_p'
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['f_ann_date'] = pd.to_datetime(df['f_ann_date'])
                df['end_date'] = pd.to_datetime(df['end_date'])
                df = df.sort_values('end_date')
                logger.info(f"获取利润表数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到利润表数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取利润表数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_balance_sheet(self, ts_code: str, start_date: str = None,
                               end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取资产负债表数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)

        Returns:
            资产负债表DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            # 设置默认日期范围
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365*3)).strftime('%Y%m%d')

            df = self.tushare_client.pro.balancesheet(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date,
                fields='ts_code,ann_date,f_ann_date,end_date,report_type,comp_type,total_share,'
                       'cap_rese,undistr_porfit,minority_int,total_hldr_eqy_exc_min_int,'
                       'total_hldr_eqy_inc_min_int,total_liab,total_assets,fix_assets,'
                       'current_asset,goodwill,lt_amor_exp,defer_tax_assets,defer_inc_tax_liab,'
                       'inventories,trad_asset,notes_receiv,accounts_receiv,oth_receiv,prepayment,'
                       'div_receiv,int_receiv,lt_equity_invest,st_loan,lt_loan,bond_payable,'
                       'preferred_stock_l,capital_reser,treasury_share,actual_ann_date'
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['f_ann_date'] = pd.to_datetime(df['f_ann_date'])
                df['end_date'] = pd.to_datetime(df['end_date'])
                df = df.sort_values('end_date')
                logger.info(f"获取资产负债表数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到资产负债表数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取资产负债表数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_cash_flow(self, ts_code: str, start_date: str = None,
                           end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取现金流量表数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)

        Returns:
            现金流量表DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            # 设置默认日期范围
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365*3)).strftime('%Y%m%d')

            df = self.tushare_client.pro.cashflow(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date,
                fields='ts_code,ann_date,f_ann_date,end_date,report_type,comp_type,net_profit,'
                       'finan_exp,c_fr_sale_sg,c_paid_goods_s,st_cash_out_act,'
                       'n_cashflow_act,n_cash_equ_beg,n_cash_equ_end,free_cashflow'
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['f_ann_date'] = pd.to_datetime(df['f_ann_date'])
                df['end_date'] = pd.to_datetime(df['end_date'])
                df = df.sort_values('end_date')
                logger.info(f"获取现金流量表数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到现金流量表数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取现金流量表数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_forecast_data(self, ts_code: str, start_date: str = None,
                               end_date: str = None) -> Optional[pd.DataFrame]:
        """
        获取业绩预告数据

        Args:
            ts_code: 股票代码
            start_date: 开始日期 (YYYYMMDD)
            end_date: 结束日期 (YYYYMMDD)

        Returns:
            业绩预告DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            # 设置默认日期范围
            if not end_date:
                end_date = datetime.now().strftime('%Y%m%d')
            if not start_date:
                start_date = (datetime.now() - timedelta(days=365*2)).strftime('%Y%m%d')

            df = self.tushare_client.pro.forecast(
                ts_code=ts_code,
                start_date=start_date,
                end_date=end_date
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['end_date'] = pd.to_datetime(df['end_date'])
                df = df.sort_values('ann_date')
                logger.info(f"获取业绩预告数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到业绩预告数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取业绩预告数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_dividend_data(self, ts_code: str) -> Optional[pd.DataFrame]:
        """
        获取分红数据

        Args:
            ts_code: 股票代码

        Returns:
            分红DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            df = self.tushare_client.pro.dividend(
                ts_code=ts_code
            )

            if not df.empty:
                df['ann_date'] = pd.to_datetime(df['ann_date'])
                df['imp_ann_date'] = pd.to_datetime(df['imp_ann_date'])
                df['div_exdate'] = pd.to_datetime(df['div_exdate'])
                df['pay_date'] = pd.to_datetime(df['pay_date'])
                df = df.sort_values('ann_date')
                logger.info(f"获取分红数据成功: {ts_code}, 共{len(df)}条记录")
            else:
                logger.warning(f"未找到分红数据: {ts_code}")

            return df

        except Exception as e:
            logger.error(f"获取分红数据失败: {ts_code}, 错误: {e}")
            return None

    async def get_company_info(self, ts_code: str) -> Optional[Dict]:
        """
        获取公司基本信息

        Args:
            ts_code: 股票代码

        Returns:
            公司信息字典
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            df = self.tushare_client.pro.stock_company(
                ts_code=ts_code
            )

            if not df.empty:
                company_info = df.iloc[0].to_dict()
                logger.info(f"获取公司信息成功: {ts_code}")
                return company_info
            else:
                logger.warning(f"未找到公司信息: {ts_code}")
                return None

        except Exception as e:
            logger.error(f"获取公司信息失败: {ts_code}, 错误: {e}")
            return None

    async def get_industry_classification(self, ts_code: str = None) -> Optional[pd.DataFrame]:
        """
        获取行业分类数据

        Args:
            ts_code: 股票代码，如果为None则获取所有行业分类

        Returns:
            行业分类DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            if ts_code:
                df = self.tushare_client.pro.hk_hold(
                    ts_code=ts_code
                )
            else:
                # 获取所有行业分类
                df = self.tushare_client.pro.hk_hold()

            if not df.empty:
                logger.info(f"获取行业分类数据成功，共{len(df)}条记录")
                return df
            else:
                logger.warning("未找到行业分类数据")
                return None

        except Exception as e:
            logger.error(f"获取行业分类数据失败，错误: {e}")
            return None

    async def get_concept_classification(self, ts_code: str = None) -> Optional[pd.DataFrame]:
        """
        获取概念分类数据

        Args:
            ts_code: 股票代码，如果为None则获取所有概念分类

        Returns:
            概念分类DataFrame
        """
        if not self.tushare_client.pro:
            return None

        try:
            await self._rate_limit()

            if ts_code:
                df = self.tushare_client.pro.concept_detail(
                    id=ts_code
                )
            else:
                # 获取所有概念分类
                df = self.tushare_client.pro.concept()

            if not df.empty:
                logger.info(f"获取概念分类数据成功，共{len(df)}条记录")
                return df
            else:
                logger.warning("未找到概念分类数据")
                return None

        except Exception as e:
            logger.error(f"获取概念分类数据失败，错误: {e}")
            return None

    async def get_all_financial_data(self, ts_code: str) -> Dict[str, Any]:
        """
        获取所有财务数据（综合接口）

        Args:
            ts_code: 股票代码

        Returns:
            包含所有财务数据的字典
        """
        try:
            logger.info(f"开始获取所有财务数据: {ts_code}")

            # 并行获取所有财务数据
            tasks = [
                self.get_financial_indicators(ts_code),
                self.get_income_statement(ts_code),
                self.get_balance_sheet(ts_code),
                self.get_cash_flow(ts_code),
                self.get_forecast_data(ts_code),
                self.get_dividend_data(ts_code),
                self.get_company_info(ts_code)
            ]

            results = await asyncio.gather(*tasks, return_exceptions=True)

            financial_data = {
                'financial_indicators': None,
                'income_statement': None,
                'balance_sheet': None,
                'cash_flow': None,
                'forecast_data': None,
                'dividend_data': None,
                'company_info': None
            }

            # 处理结果
            keys = list(financial_data.keys())
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    logger.error(f"获取{keys[i]}数据失败: {ts_code}, 错误: {result}")
                elif result is not None and not result.empty if hasattr(result, 'empty') else result is not None:
                    financial_data[keys[i]] = result
                else:
                    logger.warning(f"未找到{keys[i]}数据: {ts_code}")

            logger.info(f"获取所有财务数据完成: {ts_code}")
            return financial_data

        except Exception as e:
            logger.error(f"获取所有财务数据失败: {ts_code}, 错误: {e}")
            return {}

    async def get_batch_financial_indicators(self, ts_codes: List[str],
                                            start_date: str = None,
                                            end_date: str = None) -> Dict[str, pd.DataFrame]:
        """
        批量获取多只股票的财务指标数据

        Args:
            ts_codes: 股票代码列表
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            股票代码到财务指标DataFrame的映射字典
        """
        results = {}

        for ts_code in ts_codes:
            try:
                logger.info(f"获取财务指标数据: {ts_code}")
                df = await self.get_financial_indicators(ts_code, start_date, end_date)

                if df is not None and not df.empty:
                    results[ts_code] = df
                else:
                    logger.warning(f"未找到财务指标数据: {ts_code}")

                # 频率限制
                await self._rate_limit()

            except Exception as e:
                logger.error(f"获取财务指标数据失败: {ts_code}, 错误: {e}")

        return results