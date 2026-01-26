import aiosqlite
import os
from pathlib import Path
from loguru import logger
from contextlib import asynccontextmanager

def _resolve_database_path() -> Path:
    url = os.getenv("DATABASE_URL")
    if url and url.startswith("sqlite:"):
        raw = url[len("sqlite:") :]
        if raw.startswith("///"):
            raw = raw[2:]
        return Path(raw)
    return Path(__file__).parent.parent.parent.parent / "data" / "stock_picker.db"


DATABASE_PATH = _resolve_database_path()

@asynccontextmanager
async def get_database():
    """
    Get database connection as async context manager

    Usage:
        async with get_database() as db:
            cursor = await db.execute("SELECT * FROM stocks")
            ...
    """
    db = await aiosqlite.connect(DATABASE_PATH)
    db.row_factory = aiosqlite.Row
    try:
        yield db
    finally:
        await db.close()

async def init_database():
    """Initialize database tables"""
    # Ensure data directory exists
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(DATABASE_PATH) as db:
        # Enable WAL mode for better concurrency
        try:
            await db.execute("PRAGMA journal_mode=WAL;")
        except Exception as e:
            logger.warning(f"Failed to enable WAL mode: {e}")
            await db.execute("PRAGMA journal_mode=DELETE;")

        # Create tables (same as backend)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS stocks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                code TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                exchange TEXT NOT NULL,
                industry TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS klines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume INTEGER NOT NULL,
                amount REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS volume_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                volume_ratio REAL NOT NULL,
                avg_volume_20 INTEGER NOT NULL,
                is_volume_surge BOOLEAN DEFAULT FALSE,
                analysis_result TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS fund_flow (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                main_fund_flow REAL NOT NULL,
                retail_fund_flow REAL NOT NULL,
                institutional_flow REAL NOT NULL,
                large_order_ratio REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS buy_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                signal_type TEXT NOT NULL,
                confidence REAL NOT NULL,
                price REAL NOT NULL,
                volume INTEGER NOT NULL,
                analysis_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS advanced_selection_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                run_id TEXT NOT NULL,
                strategy_id INTEGER,
                strategy_name TEXT,
                stock_code TEXT NOT NULL,
                stock_name TEXT NOT NULL,
                composite_score REAL NOT NULL,
                selection_date TEXT NOT NULL,
                risk_advice TEXT,
                selection_reason TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 实时行情表（保存每只股票的最新行情）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS realtime_quotes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT UNIQUE NOT NULL,
                ts_code TEXT,
                name TEXT,
                pre_close REAL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                vol INTEGER,
                amount REAL,
                num INTEGER,
                ask_volume1 INTEGER,
                bid_volume1 INTEGER,
                change_percent REAL,
                change_amount REAL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        # 历史行情快照表（保存所有历史记录）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS quote_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                pre_close REAL,
                open REAL,
                high REAL,
                low REAL,
                close REAL,
                vol INTEGER,
                amount REAL,
                num INTEGER,
                change_percent REAL,
                snapshot_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        # 每日指标表（技术分析指标）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS daily_basic (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                trade_date TEXT NOT NULL,
                close REAL,
                turnover_rate REAL,
                turnover_rate_f REAL,
                volume_ratio REAL,
                pe REAL,
                pe_ttm REAL,
                pb REAL,
                ps REAL,
                ps_ttm REAL,
                dv_ratio REAL,
                dv_ttm REAL,
                total_share REAL,
                float_share REAL,
                free_share REAL,
                total_mv REAL,
                circ_mv REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, trade_date)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS kpl_concepts (
                trade_date TEXT NOT NULL,
                ts_code TEXT NOT NULL,
                name TEXT,
                z_t_num INTEGER,
                up_num TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (trade_date, ts_code)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS kpl_concept_cons (
                trade_date TEXT NOT NULL,
                ts_code TEXT NOT NULL,
                name TEXT,
                stock_code TEXT NOT NULL,
                con_code TEXT,
                con_name TEXT,
                desc TEXT,
                hot_num REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (trade_date, ts_code, stock_code)
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS ths_indices (
                ts_code TEXT PRIMARY KEY,
                name TEXT,
                exchange TEXT,
                type TEXT,
                count INTEGER,
                list_date TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS ths_members (
                ts_code TEXT NOT NULL,
                stock_code TEXT NOT NULL,
                stock_name TEXT,
                weight REAL,
                in_date TEXT,
                out_date TEXT,
                is_new TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (ts_code, stock_code)
            )
        """)

        # 技术指标表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS technical_indicators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                -- 移动平均线
                ma5 REAL,
                ma10 REAL,
                ma20 REAL,
                ma30 REAL,
                ma60 REAL,
                -- MACD
                macd REAL,
                macd_signal_line REAL,
                macd_hist REAL,
                -- RSI
                rsi6 REAL,
                rsi12 REAL,
                rsi24 REAL,
                -- KDJ
                kdj_k REAL,
                kdj_d REAL,
                kdj_j REAL,
                -- 布林带
                boll_upper REAL,
                boll_middle REAL,
                boll_lower REAL,
                -- 其他指标
                atr REAL,
                cci REAL,
                obv REAL,
                volume_ratio REAL,
                -- 信号
                macd_signal TEXT,
                rsi_signal TEXT,
                kdj_signal TEXT,
                boll_signal TEXT,
                ma_trend_signal TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        # 趋势分析表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS trend_analysis (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                -- 多周期趋势
                trend_5d_type TEXT,
                trend_5d_slope REAL,
                trend_5d_r2 REAL,
                trend_5d_strength TEXT,
                trend_10d_type TEXT,
                trend_10d_slope REAL,
                trend_10d_r2 REAL,
                trend_10d_strength TEXT,
                trend_20d_type TEXT,
                trend_20d_slope REAL,
                trend_20d_r2 REAL,
                trend_20d_strength TEXT,
                trend_30d_type TEXT,
                trend_30d_slope REAL,
                trend_30d_r2 REAL,
                trend_30d_strength TEXT,
                trend_60d_type TEXT,
                trend_60d_slope REAL,
                trend_60d_r2 REAL,
                trend_60d_strength TEXT,
                -- 综合趋势
                composite_trend_type TEXT,
                composite_confidence REAL,
                composite_avg_slope REAL,
                composite_avg_strength REAL,
                -- 趋势反转信号
                reversal_signal TEXT,
                reversal_confidence REAL,
                ma_short REAL,
                ma_long REAL,
                distance_to_short REAL,
                distance_to_long REAL,
                golden_cross BOOLEAN,
                death_cross BOOLEAN,
                -- 趋势质量
                trend_quality TEXT,
                trend_quality_score REAL,
                volatility REAL,
                sharpe_ratio REAL,
                continuity REAL,
                max_drawdown REAL,
                positive_days INTEGER,
                negative_days INTEGER,
                total_days INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date)
            )
        """)

        # K线形态信号表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS pattern_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                date TEXT NOT NULL,
                -- 形态类型
                pattern_type TEXT NOT NULL,
                pattern_name TEXT NOT NULL,
                confidence REAL NOT NULL,
                -- 形态详情
                price REAL,
                body_size REAL,
                upper_shadow REAL,
                lower_shadow REAL,
                prev_body REAL,
                curr_body REAL,
                day1_body REAL,
                day2_body REAL,
                day3_body REAL,
                -- 综合信号
                pattern_signal TEXT,
                bullish_count INTEGER,
                bearish_count INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, date, pattern_type)
            )
        """)

        # ==================== 用户与权限表 ====================

        await db.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                is_admin BOOLEAN DEFAULT FALSE,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_permissions (
                user_id INTEGER NOT NULL,
                path TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, path),
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)

        await db.execute("""
            CREATE TABLE IF NOT EXISTS user_sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at DATETIME NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        """)

        # 创建索引优化查询性能
        await db.execute("CREATE INDEX IF NOT EXISTS idx_realtime_stock_code ON realtime_quotes(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_realtime_updated_at ON realtime_quotes(updated_at)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_stock_code ON quote_history(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_snapshot_time ON quote_history(snapshot_time)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_history_stock_time ON quote_history(stock_code, snapshot_time)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_code ON daily_basic(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_trade_date ON daily_basic(trade_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_daily_basic_stock_date ON daily_basic(stock_code, trade_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ths_indices_type ON ths_indices(type)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ths_members_stock_code ON ths_members(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_ths_members_ts_code ON ths_members(ts_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_technical_stock_code ON technical_indicators(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_technical_date ON technical_indicators(date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_technical_stock_date ON technical_indicators(stock_code, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_trend_stock_code ON trend_analysis(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_trend_date ON trend_analysis(date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_trend_stock_date ON trend_analysis(stock_code, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_pattern_stock_code ON pattern_signals(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_pattern_date ON pattern_signals(date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_pattern_stock_date ON pattern_signals(stock_code, date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_user_permissions_user_id ON user_permissions(user_id)")

        # ==================== 基本面数据表 ====================

        # 股票基本信息扩展表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS stock_basic_extended (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT UNIQUE NOT NULL,
                -- 基本信息
                ts_code TEXT,
                name TEXT NOT NULL,
                area TEXT,
                industry TEXT,
                market TEXT,
                list_date TEXT,
                list_status TEXT,
                is_hs TEXT,
                days_listed INTEGER,
                -- 公司信息
                chairman TEXT,
                manager TEXT,
                secretary TEXT,
                reg_capital REAL,
                setup_date TEXT,
                province TEXT,
                city TEXT,
                introduction TEXT,
                website TEXT,
                email TEXT,
                office TEXT,
                employees INTEGER,
                main_business TEXT,
                business_scope TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code)
            )
        """)

        # 财务指标表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS financial_indicators (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                ann_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                -- 盈利能力
                roe REAL,
                roa REAL,
                grossprofit_margin REAL,
                profit_to_gr REAL,
                op_of_gr REAL,
                ebit_of_gr REAL,
                roe_yearly REAL,
                roa2_yearly REAL,
                roa_yearly REAL,
                -- 偿债能力
                debt_to_assets REAL,
                assets_to_eqt REAL,
                ca_to_assets REAL,
                nca_to_assets REAL,
                tbassets_to_totalassets REAL,
                int_to_talcap REAL,
                eqt_to_talcapital REAL,
                currentdebt_to_debt REAL,
                longdeb_to_debt REAL,
                -- 运营能力
                ocf_to_or REAL,
                ocf_to_opincome REAL,
                ocf_to_gr REAL,
                free_cashflow REAL,
                ocf_yearly REAL,
                -- 其他指标
                debt_to_eqt REAL,
                ocf_to_shortdebt REAL,
                debt_to_assets_yearly REAL,
                profit_to_op REAL,
                roe_dt REAL,
                roa_dt REAL,
                roe_yearly_dt REAL,
                roa_yearly_dt REAL,
                roe_avg REAL,
                roa_avg REAL,
                roe_avg_yearly REAL,
                roa_avg_yearly REAL,
                roe_std REAL,
                roa_std REAL,
                roe_std_yearly REAL,
                roa_std_yearly REAL,
                roe_cv REAL,
                roa_cv REAL,
                roe_cv_yearly REAL,
                roa_cv_yearly REAL,
                roe_gr REAL,
                roa_gr REAL,
                roe_gr_yearly REAL,
                roa_gr_yearly REAL,
                roe_rank REAL,
                roa_rank REAL,
                roe_rank_yearly REAL,
                roa_rank_yearly REAL,
                roe_pct REAL,
                roa_pct REAL,
                roe_pct_yearly REAL,
                roa_pct_yearly REAL,
                roe_ttm REAL,
                roa_ttm REAL,
                roe_ttm_yearly REAL,
                roa_ttm_yearly REAL,
                roe_ttm_rank REAL,
                roa_ttm_rank REAL,
                roe_ttm_rank_yearly REAL,
                roa_ttm_rank_yearly REAL,
                roe_ttm_pct REAL,
                roa_ttm_pct REAL,
                roe_ttm_pct_yearly REAL,
                roa_ttm_pct_yearly REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, end_date)
            )
        """)

        # 利润表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS income_statements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                ann_date TEXT NOT NULL,
                f_end_date TEXT NOT NULL,
                report_type TEXT,
                comp_type TEXT,
                -- 收入
                total_revenue REAL,
                revenue REAL,
                int_income REAL,
                prem_earned REAL,
                comm_income REAL,
                n_commis_income REAL,
                n_oth_income REAL,
                n_oth_b_income REAL,
                prem_income REAL,
                out_prem REAL,
                une_prem_reser REAL,
                reins_income REAL,
                n_sec_tb_income REAL,
                n_sec_uw_income REAL,
                n_asset_mg_income REAL,
                oth_b_income REAL,
                fv_value_chg_gain REAL,
                invest_income REAL,
                ass_invest_income REAL,
                forex_gain REAL,
                -- 成本费用
                total_cogs REAL,
                oper_cost REAL,
                int_exp REAL,
                comm_exp REAL,
                biz_tax_surch REAL,
                sell_exp REAL,
                admin_exp REAL,
                fin_exp REAL,
                assets_impair_loss REAL,
                prem_refund REAL,
                compens_payout REAL,
                reser_insur_liab REAL,
                div_payt REAL,
                reins_exp REAL,
                oper_exp REAL,
                compens_payout_refu REAL,
                insur_reser_refu REAL,
                reins_cost_refund REAL,
                other_bus_cost REAL,
                -- 利润
                operate_profit REAL,
                non_oper_income REAL,
                non_oper_exp REAL,
                nca_disploss REAL,
                total_profit REAL,
                income_tax REAL,
                n_income REAL,
                n_income_attr_p REAL,
                -- 每股指标
                basic_eps REAL,
                diluted_eps REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, f_end_date, report_type)
            )
        """)

        # 资产负债表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS balance_sheets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                ann_date TEXT NOT NULL,
                f_end_date TEXT NOT NULL,
                report_type TEXT,
                comp_type TEXT,
                -- 资产
                total_assets REAL,
                current_assets REAL,
                fix_assets REAL,
                goodwill REAL,
                lt_amor_exp REAL,
                defer_tax_assets REAL,
                decr_in_disbur REAL,
                oth_nca REAL,
                total_nca REAL,
                cash_reser_cb REAL,
                depos_in_oth_bfi REAL,
                prec_metals REAL,
                deriv_assets REAL,
                rr_reins_une_prem REAL,
                rr_reins_outstanding_clm REAL,
                rr_reins_lins_liab REAL,
                rr_reins_lthins_liab REAL,
                refund_depos REAL,
                ph_pledge_loans REAL,
                refund_cap_depos REAL,
                indep_acct_assets REAL,
                client_depos REAL,
                client_prov REAL,
                transac_seat_fee REAL,
                invest_as_receiv REAL,
                total_assets_oth REAL,
                lt_equity_invest REAL,
                -- 负债
                total_liab REAL,
                st_loans REAL,
                lt_loans REAL,
                accept_depos REAL,
                depos REAL,
                loan_oth_bank REAL,
                trading_fl REAL,
                trading_fa REAL,
                deriv_liab REAL,
                customers_deposit_oth REAL,
                oth_comp_depos REAL,
                oth_liab_fin REAL,
                accept_depos_oth REAL,
                oth_liab REAL,
                prem_receiv_adva REAL,
                depos_received REAL,
                ph_invest REAL,
                reser_une_prem REAL,
                reser_outstanding_claims REAL,
                reser_lins_liab REAL,
                reser_lthins_liab REAL,
                indept_acc_liab REAL,
                pledge_borr REAL,
                indem_payable REAL,
                policy_div_payable REAL,
                total_liab_oth REAL,
                -- 所有者权益
                total_share REAL,
                capital REAL,
                capital_res REAL,
                special_res REAL,
                surplus_res REAL,
                ordin_risk_res REAL,
                retained_earnings REAL,
                forex_diff REAL,
                invest_loss_unconf REAL,
                minority_int REAL,
                minority_int_oth REAL,
                total_hldr_eqy_exc_min_int REAL,
                total_hldr_eqy_inc_min_int REAL,
                total_hldr_eqy_oth REAL,
                loan_fund REAL,
                stock_fund REAL,
                other_fund REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, f_end_date, report_type)
            )
        """)

        # 现金流量表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS cash_flow_statements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                ann_date TEXT NOT NULL,
                f_end_date TEXT NOT NULL,
                report_type TEXT,
                comp_type TEXT,
                -- 经营活动现金流
                net_profit REAL,
                finan_exp REAL,
                c_fr_sale_sg REAL,
                c_fr_oth_operate_a REAL,
                total_c_fr_operate_a REAL,
                c_paid_goods_s REAL,
                c_paid_to_for_empl REAL,
                c_paid_for_taxes REAL,
                total_c_paid_operate_a REAL,
                n_cashflow_act REAL,
                -- 投资活动现金流
                n_cfr_incr_cap REAL,
                cfr_incr_borr REAL,
                cfr_cash_incr REAL,
                cfr_fr_issue_bond REAL,
                total_cfr_fin_act REAL,
                -- 筹资活动现金流
                c_paid_for_debts REAL,
                c_paid_div_prof_int REAL,
                total_c_paid_fin_act REAL,
                n_cashflow_fin_act REAL,
                -- 其他
                forex_chg REAL,
                n_incr_cash_cash_equ REAL,
                c_cash_equ_beg_period REAL,
                c_cash_equ_end_period REAL,
                free_cashflow REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, f_end_date, report_type)
            )
        """)

        # 分红数据表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS dividend_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                end_date TEXT NOT NULL,
                ann_date TEXT,
                div_proc TEXT,
                stk_div REAL,
                stk_bo_rate REAL,
                stk_co_rate REAL,
                cash_div REAL,
                cash_div_tax REAL,
                record_date TEXT,
                ex_date TEXT,
                pay_date TEXT,
                div_listdate TEXT,
                imp_ann_date TEXT,
                base_date TEXT,
                base_share REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, end_date)
            )
        """)

        # 股东数据表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS shareholder_data (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                ann_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                holder_name TEXT NOT NULL,
                hold_amount REAL,
                hold_ratio REAL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, end_date, holder_name)
            )
        """)

        # 基本面综合评分表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS fundamental_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                score_date TEXT NOT NULL,
                -- 各项评分
                profitability_score REAL,
                valuation_score REAL,
                dividend_score REAL,
                growth_score REAL,
                quality_score REAL,
                -- 综合评分
                overall_score REAL,
                score_rank INTEGER,
                -- 分析结果
                analysis_summary TEXT,
                strengths TEXT,
                weaknesses TEXT,
                opportunities TEXT,
                threats TEXT,
                investment_advice TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, score_date)
            )
        """)

        # 基本面数据索引
        await db.execute("CREATE INDEX IF NOT EXISTS idx_stock_basic_extended_stock_code ON stock_basic_extended(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_financial_indicators_stock_code ON financial_indicators(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_financial_indicators_end_date ON financial_indicators(end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_financial_indicators_stock_date ON financial_indicators(stock_code, end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_income_statements_stock_code ON income_statements(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_income_statements_f_end_date ON income_statements(f_end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_balance_sheets_stock_code ON balance_sheets(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_balance_sheets_f_end_date ON balance_sheets(f_end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_cash_flow_statements_stock_code ON cash_flow_statements(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_cash_flow_statements_f_end_date ON cash_flow_statements(f_end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_dividend_data_stock_code ON dividend_data(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_dividend_data_end_date ON dividend_data(end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_shareholder_data_stock_code ON shareholder_data(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_shareholder_data_end_date ON shareholder_data(end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_fundamental_scores_stock_code ON fundamental_scores(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_fundamental_scores_score_date ON fundamental_scores(score_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_fundamental_scores_overall_score ON fundamental_scores(overall_score)")

        # ==================== 增量更新相关表 ====================

        # 超强主力配置表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS super_mainforce_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                alpha REAL NOT NULL,
                beta REAL NOT NULL,
                gamma REAL NOT NULL,
                daily_threshold REAL NOT NULL,
                auction_threshold REAL NOT NULL,
                open_threshold REAL NOT NULL,
                overall_threshold REAL NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 超强主力信号表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS super_mainforce_signals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                stock_code TEXT NOT NULL,
                signal_date TEXT NOT NULL,
                s_daily REAL NOT NULL,
                s_auction REAL NOT NULL,
                s_open REAL NOT NULL,
                s_total REAL NOT NULL,
                advice TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (stock_code) REFERENCES stocks (code),
                UNIQUE(stock_code, signal_date)
            )
        """)

        await db.execute("CREATE INDEX IF NOT EXISTS idx_sm_signals_date ON super_mainforce_signals(signal_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sm_signals_stock ON super_mainforce_signals(stock_code)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_sm_signals_total ON super_mainforce_signals(s_total)")

        # 采集历史表（记录每次数据采集的信息）
        await db.execute("""
            CREATE TABLE IF NOT EXISTS collection_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                collection_type TEXT NOT NULL,  -- 'full' 或 'incremental'
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                stock_count INTEGER DEFAULT 0,
                kline_count INTEGER DEFAULT 0,
                flow_count INTEGER DEFAULT 0,
                indicator_count INTEGER DEFAULT 0,
                status TEXT DEFAULT 'completed',  -- 'pending', 'running', 'completed', 'failed'
                error_message TEXT,
                elapsed_time REAL,  -- 耗时（秒）
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 数据采集配置表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS collection_config (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                config_key TEXT UNIQUE NOT NULL,
                config_value TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 数据质量监控表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS data_quality_monitor (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                monitor_date TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                threshold REAL,
                status TEXT,  -- 'normal', 'warning', 'error'
                alert_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 数据源健康状态表
        await db.execute("""
            CREATE TABLE IF NOT EXISTS data_source_health (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_name TEXT NOT NULL,
                status TEXT NOT NULL,  -- 'healthy', 'degraded', 'unavailable'
                success_rate REAL,
                avg_latency REAL,
                last_check_time DATETIME,
                error_message TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 创建增量更新相关索引
        await db.execute("CREATE INDEX IF NOT EXISTS idx_collection_history_type ON collection_history(collection_type)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_collection_history_dates ON collection_history(start_date, end_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_collection_history_status ON collection_history(status)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_collection_history_created ON collection_history(created_at)")

        await db.execute("CREATE INDEX IF NOT EXISTS idx_data_quality_monitor_date ON data_quality_monitor(monitor_date)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_data_quality_monitor_metric ON data_quality_monitor(metric_name)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_data_quality_monitor_status ON data_quality_monitor(status)")

        await db.execute("CREATE INDEX IF NOT EXISTS idx_data_source_health_source ON data_source_health(source_name)")
        await db.execute("CREATE INDEX IF NOT EXISTS idx_data_source_health_status ON data_source_health(status)")

        # 初始化采集配置
        await db.execute("""
            INSERT OR REPLACE INTO collection_config (config_key, config_value, description)
            VALUES
                ('incremental_enabled', 'false', '是否启用增量更新'),
                ('incremental_days', '7', '增量更新天数'),
                ('full_collection_days', '30', '全量更新天数'),
                ('max_retries', '3', '最大重试次数'),
                ('retry_delay', '2', '重试延迟（秒）'),
                ('hot_stock_guarantee', 'true', '热门股票保障'),
                ('data_validation_enabled', 'true', '数据验证启用'),
                ('quality_threshold', '85', '数据质量阈值（分）'),
                ('alert_enabled', 'true', '报警启用')
        """)

        await db.commit()
        logger.info("Database initialized successfully")
