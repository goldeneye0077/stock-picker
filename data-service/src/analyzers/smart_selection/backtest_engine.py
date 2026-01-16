"""
策略回测引擎
提供智能选股策略的回测功能
"""

import asyncio
import sqlite3
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Any, Optional, Tuple
import logging

# 导入智能选股分析器
try:
    from .smart_selection_analyzer import SmartSelectionAnalyzer
except ImportError:
    # 如果相对导入失败，尝试绝对导入
    from data_service.src.analyzers.smart_selection.smart_selection_analyzer import SmartSelectionAnalyzer

logger = logging.getLogger(__name__)

try:
    from ...utils.database import DATABASE_PATH
except ImportError:
    from utils.database import DATABASE_PATH


class BacktestEngine:
    """策略回测引擎"""

    def __init__(self, db_path: str = None):
        """
        初始化回测引擎

        Args:
            db_path: 数据库路径
        """
        if db_path is None:
            self.db_path = str(DATABASE_PATH)
        else:
            self.db_path = db_path
        self.initial_capital = 100000  # 初始资金：10万元
        self.transaction_cost = 0.001  # 交易成本：0.1%

        # 初始化智能选股分析器
        self.selection_analyzer = SmartSelectionAnalyzer(self.db_path)

    async def run_backtest(
        self,
        strategy_config: Dict[str, Any],
        start_date: str,
        end_date: str,
        algorithm_type: str = 'basic'
    ) -> Dict[str, Any]:
        """
        运行策略回测

        Args:
            strategy_config: 策略配置
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            algorithm_type: 算法类型 ('basic' 或 'advanced')

        Returns:
            回测结果
        """
        try:
            logger.info(f"开始回测: {start_date} 到 {end_date}, 算法类型: {algorithm_type}")
            logger.info(f"回测引擎数据库路径: {self.db_path}")

            # 1. 获取回测期间的交易日历
            trading_dates = await self._get_trading_dates(start_date, end_date)
            logger.info(f"获取到交易日历数量: {len(trading_dates)}")
            if not trading_dates:
                error_msg = f"回测期间无交易数据: {start_date} 到 {end_date}"
                logger.error(error_msg)
                return self._create_error_result(error_msg)

            # 2. 初始化投资组合
            portfolio = {
                'cash': self.initial_capital,
                'positions': {},  # {stock_code: {'shares': 数量, 'cost': 成本价, 'buy_date': 买入日期}}
                'transactions': [],  # 交易记录
                'daily_values': [],  # 每日净值
            }

            # 3. 按交易日进行回测
            for i, current_date in enumerate(trading_dates):
                # 3.1 获取当日选股结果
                selected_stocks = await self._get_daily_selection(
                    strategy_config, current_date, algorithm_type
                )

                # 3.2 执行调仓
                await self._rebalance_portfolio(
                    portfolio, selected_stocks, current_date
                )

                # 3.3 更新持仓市值
                portfolio_value = await self._update_portfolio_value(
                    portfolio, current_date
                )

                # 3.4 记录每日净值
                portfolio['daily_values'].append({
                    'date': current_date,
                    'total_value': portfolio_value,
                    'cash': portfolio['cash'],
                    'positions_value': portfolio_value - portfolio['cash'],
                    'positions_count': len(portfolio['positions'])
                })

                # 进度日志
                if i % 10 == 0 or i == len(trading_dates) - 1:
                    logger.info(f"回测进度: {i+1}/{len(trading_dates)} ({current_date})")

            # 4. 计算绩效指标
            performance_metrics = await self._calculate_performance_metrics(
                portfolio, start_date, end_date
            )

            # 5. 生成回测报告
            backtest_result = await self._generate_backtest_report(
                strategy_config, start_date, end_date, portfolio, performance_metrics
            )

            logger.info(f"回测完成: 总收益率 {performance_metrics['total_return']:.2f}%")

            return backtest_result

        except Exception as e:
            logger.error(f"回测失败: {e}")
            return self._create_error_result(f"回测失败: {str(e)}")

    async def _get_trading_dates(self, start_date: str, end_date: str) -> List[str]:
        """获取交易日历"""
        try:
            logger.info(f"获取交易日历: {start_date} 到 {end_date}, 数据库路径: {self.db_path}")
            conn = sqlite3.connect(self.db_path)
            query = """
                SELECT DISTINCT date as trade_date
                FROM klines
                WHERE date BETWEEN ? AND ?
                ORDER BY date
            """
            df = pd.read_sql_query(query, conn, params=(start_date, end_date))
            conn.close()

            dates = df['trade_date'].tolist()
            logger.info(f"获取到 {len(dates)} 个交易日")
            if len(dates) > 0:
                logger.info(f"第一个交易日: {dates[0]}, 最后一个交易日: {dates[-1]}")

            return dates
        except Exception as e:
            logger.error(f"获取交易日历失败: {e}")
            return []

    async def _get_daily_selection(
        self,
        strategy_config: Dict[str, Any],
        current_date: str,
        algorithm_type: str
    ) -> List[Dict[str, Any]]:
        """
        获取当日选股结果（使用真实智能选股算法）

        Args:
            strategy_config: 策略配置
            current_date: 当前日期
            algorithm_type: 算法类型

        Returns:
            选股结果列表
        """
        try:
            logger.info(f"获取 {current_date} 的选股结果，算法类型: {algorithm_type}")

            # 使用智能选股分析器进行真实选股
            # 注意：当前智能选股分析器使用最新数据，这里需要模拟历史数据
            # 为了简化，我们使用基于历史数据的简化版本
            results = await self._get_historical_selection_simple(
                strategy_config, current_date, algorithm_type
            )

            logger.info(f"获取到 {len(results)} 只选股结果")
            return results

        except Exception as e:
            logger.error(f"获取当日选股结果失败: {e}")
            # 失败时返回空列表，而不是模拟数据
            return []

    async def _get_historical_selection_simple(
        self,
        strategy_config: Dict[str, Any],
        current_date: str,
        algorithm_type: str
    ) -> List[Dict[str, Any]]:
        """
        简化版历史选股（基于历史数据计算评分）

        这是一个过渡方案，后续需要集成完整的智能选股算法
        """
        try:
            conn = sqlite3.connect(self.db_path)

            # 获取权重配置
            weights = strategy_config.get('weights', {
                'technical': 0.35,
                'fundamental': 0.30,
                'capital': 0.25,
                'market': 0.10,
            })

            # 基于历史数据计算评分（简化版）
            # 1. 获取有历史数据的股票（使用<=而不是=，确保能找到数据）
            query = """
                SELECT DISTINCT s.code as stock_code, s.name as stock_name
                FROM stocks s
                WHERE EXISTS (
                    SELECT 1 FROM klines k
                    WHERE k.stock_code = s.code
                    AND k.date <= ?
                    AND k.date >= date(?, '-5 days')
                )
                ORDER BY RANDOM()
                LIMIT 50  -- 限制数量提高性能
            """

            df_stocks = pd.read_sql_query(query, conn, params=(current_date, current_date))
            if df_stocks.empty:
                logger.warning(f"{current_date} 无股票数据")
                return []

            # 评分门槛
            min_score = strategy_config.get('min_score', 70.0)

            # all_results: 所有有评分的股票
            # results: 达到最低评分门槛的股票
            all_results = []
            results = []
            for _, row in df_stocks.iterrows():
                stock_code = row['stock_code']
                stock_name = row['stock_name']

                # 获取历史技术数据
                tech_score = await self._calculate_historical_technical_score(stock_code, current_date)
                # 获取历史基本面数据
                fund_score = await self._calculate_historical_fundamental_score(stock_code, current_date)
                # 简化处理其他维度
                capital_score = 50.0  # 默认值
                market_score = 50.0   # 默认值

                # 计算综合评分
                overall_score = (
                    tech_score * weights.get('technical', 0.35) +
                    fund_score * weights.get('fundamental', 0.30) +
                    capital_score * weights.get('capital', 0.25) +
                    market_score * weights.get('market', 0.10)
                )

                # 确保分数在合理范围
                overall_score = max(0, min(100, overall_score))

                # 构造结果对象
                result = {
                    'stock_code': stock_code,
                    'stock_name': stock_name,
                    'overall_score': round(overall_score, 2),
                    'technical_score': round(tech_score, 2),
                    'fundamental_score': round(fund_score, 2),
                    'capital_score': round(capital_score, 2),
                    'market_score': round(market_score, 2),
                    'selection_reason': f'历史数据评分: 技术{tech_score:.1f}/基本面{fund_score:.1f}',
                    'risk_level': '低' if overall_score >= 80 else '中' if overall_score >= 60 else '高',
                    'target_price': 0.0,  # 简化处理
                    'stop_loss_price': 0.0,  # 简化处理
                    'holding_period': '中线'
                }
                all_results.append(result)

                # 只把达到最低评分门槛的股票放入结果列表
                if overall_score >= min_score:
                    results.append(result)

            conn.close()

            max_results = strategy_config.get('max_results', 10)

            # 如果没有任何股票达到最低评分门槛，但有评分数据，则回退为按评分排序的前N只股票
            if not results and all_results:
                logger.info(
                    f"{current_date} 无股票达到最低评分 {min_score}，"
                    f"使用按评分排序的前 {max_results} 只股票进行回测"
                )
                all_results.sort(key=lambda x: x['overall_score'], reverse=True)
                return all_results[:max_results]

            # 正常情况下：只使用达到评分门槛的股票
            results.sort(key=lambda x: x['overall_score'], reverse=True)
            return results[:max_results]

        except Exception as e:
            logger.error(f"简化版历史选股失败: {e}")
            return []

    async def _calculate_historical_technical_score(
        self, stock_code: str, current_date: str
    ) -> float:
        """基于历史数据计算技术面评分"""
        try:
            conn = sqlite3.connect(self.db_path)

            # 获取最近5天的K线数据
            query = """
                SELECT close, volume, date
                FROM klines
                WHERE stock_code = ?
                AND date <= ?
                ORDER BY date DESC
                LIMIT 5
            """

            df = pd.read_sql_query(query, conn, params=(stock_code, current_date))
            conn.close()

            if df.empty or len(df) < 2:
                return 50.0  # 默认分

            # 计算价格变化
            latest_close = df.iloc[0]['close']
            prev_close = df.iloc[1]['close'] if len(df) > 1 else latest_close
            price_change = ((latest_close - prev_close) / prev_close * 100) if prev_close > 0 else 0

            # 计算成交量
            latest_volume = df.iloc[0]['volume']
            avg_volume = df['volume'].mean() if len(df) > 0 else latest_volume
            volume_ratio = latest_volume / avg_volume if avg_volume > 0 else 1.0

            # 简化评分逻辑
            score = 50.0  # 基础分

            # 价格变化加分
            if price_change > 5.0:
                score += 20
            elif price_change > 2.0:
                score += 10
            elif price_change > 0:
                score += 5
            elif price_change < -5.0:
                score -= 10

            # 成交量加分
            if volume_ratio > 2.0:
                score += 15
            elif volume_ratio > 1.5:
                score += 10
            elif volume_ratio > 1.0:
                score += 5

            return max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算历史技术面评分失败 {stock_code}: {e}")
            return 50.0

    async def _calculate_historical_fundamental_score(
        self, stock_code: str, current_date: str
    ) -> float:
        """基于历史数据计算基本面评分"""
        try:
            conn = sqlite3.connect(self.db_path)

            # 尝试获取基本面数据
            query = """
                SELECT pe, pb, total_mv
                FROM daily_basic
                WHERE stock_code = ?
                AND trade_date <= ?
                ORDER BY trade_date DESC
                LIMIT 1
            """

            df = pd.read_sql_query(query, conn, params=(stock_code, current_date))
            conn.close()

            if df.empty:
                return 50.0  # 默认分

            pe = df.iloc[0]['pe'] or 0
            pb = df.iloc[0]['pb'] or 0
            total_mv = df.iloc[0]['total_mv'] or 0

            # 简化评分逻辑
            score = 50.0  # 基础分

            # PE估值评分（越低越好）
            if pe > 0:
                if pe < 10:
                    score += 20
                elif pe < 15:
                    score += 10
                elif pe < 20:
                    score += 5
                elif pe > 40:
                    score -= 10
                elif pe > 30:
                    score -= 5

            # PB估值评分（越低越好）
            if pb > 0:
                if pb < 1:
                    score += 15
                elif pb < 2:
                    score += 10
                elif pb < 3:
                    score += 5
                elif pb > 5:
                    score -= 10
                elif pb > 3:
                    score -= 5

            # 市值评分（适中为好）
            if total_mv > 0:
                # 转换为亿元
                market_cap_billion = total_mv / 100000000
                if 10 <= market_cap_billion <= 100:  # 100-1000亿市值
                    score += 10
                elif market_cap_billion > 500:  # 超大市值
                    score += 5
                elif market_cap_billion < 5:  # 小市值
                    score -= 5

            return max(0, min(100, score))

        except Exception as e:
            logger.error(f"计算历史基本面评分失败 {stock_code}: {e}")
            return 50.0

    async def _rebalance_portfolio(
        self,
        portfolio: Dict[str, Any],
        selected_stocks: List[Dict[str, Any]],
        current_date: str
    ) -> None:
        """执行调仓（包含持有期规则）"""
        try:
            # 1. 检查持有期，卖出持有超过5天的股票
            positions_to_sell_by_holding = []
            for stock_code, position in portfolio['positions'].items():
                buy_date = position.get('buy_date')
                if buy_date:
                    # 计算持有天数
                    from datetime import datetime
                    buy_datetime = datetime.strptime(buy_date, '%Y-%m-%d')
                    current_datetime = datetime.strptime(current_date, '%Y-%m-%d')
                    days_held = (current_datetime - buy_datetime).days

                    # 持有超过5天则卖出
                    if days_held >= 5:
                        positions_to_sell_by_holding.append(stock_code)
                        logger.info(f"股票 {stock_code} 持有 {days_held} 天，触发卖出")

            # 2. 卖出不在选股列表中的持仓
            positions_to_sell_by_selection = []
            for stock_code, position in portfolio['positions'].items():
                if stock_code not in positions_to_sell_by_holding:  # 避免重复
                    if not any(s['stock_code'] == stock_code for s in selected_stocks):
                        positions_to_sell_by_selection.append(stock_code)

            # 合并卖出列表
            all_positions_to_sell = positions_to_sell_by_holding + positions_to_sell_by_selection

            for stock_code in all_positions_to_sell:
                await self._sell_position(portfolio, stock_code, current_date)

            # 2. 买入新的选股
            available_cash = portfolio['cash']
            max_positions = min(10, len(selected_stocks))  # 最多持有10只股票

            # 按评分排序
            selected_stocks_sorted = sorted(
                selected_stocks,
                key=lambda x: x.get('composite_score', x.get('overall_score', 0)),
                reverse=True
            )

            # 计算每只股票的买入金额
            position_value = available_cash / max_positions if max_positions > 0 else 0

            for stock in selected_stocks_sorted[:max_positions]:
                stock_code = stock['stock_code']

                # 如果已经持有，跳过
                if stock_code in portfolio['positions']:
                    continue

                # 获取当前价格
                current_price = await self._get_stock_price(stock_code, current_date)
                if current_price <= 0:
                    continue

                # 计算买入数量
                shares_to_buy = int(position_value / current_price)
                if shares_to_buy <= 0:
                    continue

                # 执行买入
                buy_amount = shares_to_buy * current_price
                transaction_cost = buy_amount * self.transaction_cost
                total_cost = buy_amount + transaction_cost

                if total_cost <= portfolio['cash']:
                    portfolio['cash'] -= total_cost
                    portfolio['positions'][stock_code] = {
                        'shares': shares_to_buy,
                        'cost': current_price,
                        'buy_date': current_date,
                        'buy_price': current_price
                    }

                    portfolio['transactions'].append({
                        'date': current_date,
                        'type': 'buy',
                        'stock_code': stock_code,
                        'shares': shares_to_buy,
                        'price': current_price,
                        'amount': buy_amount,
                        'cost': transaction_cost
                    })

        except Exception as e:
            logger.error(f"调仓失败: {e}")

    async def _sell_position(
        self,
        portfolio: Dict[str, Any],
        stock_code: str,
        current_date: str
    ) -> None:
        """卖出持仓"""
        try:
            position = portfolio['positions'].get(stock_code)
            if not position:
                return

            # 获取当前价格
            current_price = await self._get_stock_price(stock_code, current_date)
            if current_price <= 0:
                return

            # 计算卖出金额
            sell_amount = position['shares'] * current_price
            transaction_cost = sell_amount * self.transaction_cost
            net_amount = sell_amount - transaction_cost

            # 更新现金
            portfolio['cash'] += net_amount

            # 记录交易
            portfolio['transactions'].append({
                'date': current_date,
                'type': 'sell',
                'stock_code': stock_code,
                'shares': position['shares'],
                'price': current_price,
                'amount': sell_amount,
                'cost': transaction_cost,
                'profit': (current_price - position['buy_price']) * position['shares']
            })

            # 移除持仓
            del portfolio['positions'][stock_code]

        except Exception as e:
            logger.error(f"卖出持仓失败: {e}")

    async def _get_stock_price(self, stock_code: str, date: str) -> float:
        """获取股票价格"""
        try:
            conn = sqlite3.connect(self.db_path)
            # 优先使用当日收盘价；若当日无数据，回退到最近一个交易日的收盘价（<= 指定日期）
            query = """
                SELECT close
                FROM klines
                WHERE stock_code = ? AND date <= ?
                ORDER BY date DESC
                LIMIT 1
            """
            df = pd.read_sql_query(query, conn, params=(stock_code, date))
            conn.close()

            if not df.empty:
                return float(df.iloc[0]['close'])
            else:
                return 0.0
        except Exception as e:
            logger.error(f"获取股票价格失败: {e}")
            return 0.0

    async def _update_portfolio_value(
        self,
        portfolio: Dict[str, Any],
        current_date: str
    ) -> float:
        """更新持仓市值"""
        try:
            total_value = portfolio['cash']

            for stock_code, position in portfolio['positions'].items():
                current_price = await self._get_stock_price(stock_code, current_date)
                if current_price > 0:
                    position_value = position['shares'] * current_price
                    total_value += position_value

            return total_value
        except Exception as e:
            logger.error(f"更新持仓市值失败: {e}")
            return portfolio['cash']

    async def _calculate_performance_metrics(
        self,
        portfolio: Dict[str, Any],
        start_date: str,
        end_date: str
    ) -> Dict[str, float]:
        """计算绩效指标"""
        try:
            daily_values = portfolio['daily_values']
            if not daily_values:
                return self._get_default_metrics()

            # 提取每日净值
            dates = [v['date'] for v in daily_values]
            values = [v['total_value'] for v in daily_values]

            # 计算总收益率
            initial_value = values[0] if values else self.initial_capital
            final_value = values[-1] if values else self.initial_capital
            total_return = ((final_value - initial_value) / initial_value) * 100

            # 计算年化收益率
            days_count = len(dates)
            if days_count > 1:
                annual_return = ((final_value / initial_value) ** (252 / days_count) - 1) * 100
            else:
                annual_return = total_return

            # 计算最大回撤
            max_drawdown = 0.0
            peak = values[0]
            for value in values:
                if value > peak:
                    peak = value
                drawdown = (peak - value) / peak * 100
                if drawdown > max_drawdown:
                    max_drawdown = drawdown

            # 计算夏普比率（简化计算）
            if len(values) > 1:
                returns = [(values[i] - values[i-1]) / values[i-1] for i in range(1, len(values))]
                avg_return = np.mean(returns) * 252  # 年化平均收益率
                std_return = np.std(returns) * np.sqrt(252)  # 年化标准差
                sharpe_ratio = avg_return / std_return if std_return > 0 else 0
            else:
                sharpe_ratio = 0

            # 计算胜率
            transactions = portfolio['transactions']
            profit_trades = sum(1 for t in transactions if t.get('profit', 0) > 0)
            loss_trades = sum(1 for t in transactions if t.get('profit', 0) < 0)
            total_trades = profit_trades + loss_trades

            win_rate = (profit_trades / total_trades * 100) if total_trades > 0 else 0

            # 计算平均盈利/亏损
            profits = [t['profit'] for t in transactions if t.get('profit', 0) > 0]
            losses = [t['profit'] for t in transactions if t.get('profit', 0) < 0]

            avg_profit = np.mean(profits) if profits else 0
            avg_loss = np.mean(losses) if losses else 0

            # 计算盈亏比
            profit_factor = abs(avg_profit / avg_loss) if avg_loss != 0 else 0

            return {
                'total_return': total_return,
                'annual_return': annual_return,
                'max_drawdown': max_drawdown,
                'sharpe_ratio': sharpe_ratio,
                'win_rate': win_rate,
                'total_trades': total_trades,
                'profit_trades': profit_trades,
                'loss_trades': loss_trades,
                'average_profit': avg_profit,
                'average_loss': avg_loss,
                'profit_factor': profit_factor
            }

        except Exception as e:
            logger.error(f"计算绩效指标失败: {e}")
            return self._get_default_metrics()

    async def _generate_backtest_report(
        self,
        strategy_config: Dict[str, Any],
        start_date: str,
        end_date: str,
        portfolio: Dict[str, Any],
        performance_metrics: Dict[str, float]
    ) -> Dict[str, Any]:
        """生成回测报告"""
        return {
            'strategy_config': strategy_config,
            'start_date': start_date,
            'end_date': end_date,
            'total_return': performance_metrics['total_return'],
            'annual_return': performance_metrics['annual_return'],
            'max_drawdown': performance_metrics['max_drawdown'],
            'sharpe_ratio': performance_metrics['sharpe_ratio'],
            'win_rate': performance_metrics['win_rate'],
            'total_trades': performance_metrics['total_trades'],
            'profit_trades': performance_metrics['profit_trades'],
            'loss_trades': performance_metrics['loss_trades'],
            'average_profit': performance_metrics['average_profit'],
            'average_loss': performance_metrics['average_loss'],
            'profit_factor': performance_metrics['profit_factor'],
            'backtest_completed': True,
            'message': '回测完成',
            'timestamp': datetime.now().isoformat(),
            'portfolio_summary': {
                'initial_capital': self.initial_capital,
                'final_value': portfolio['daily_values'][-1]['total_value'] if portfolio['daily_values'] else self.initial_capital,
                'cash': portfolio['cash'],
                'positions_count': len(portfolio['positions']),
                'transactions_count': len(portfolio['transactions'])
            },
            'equity_curve': portfolio['daily_values']
        }

    def _get_default_metrics(self) -> Dict[str, float]:
        """获取默认绩效指标"""
        return {
            'total_return': 0.0,
            'annual_return': 0.0,
            'max_drawdown': 0.0,
            'sharpe_ratio': 0.0,
            'win_rate': 0.0,
            'total_trades': 0,
            'profit_trades': 0,
            'loss_trades': 0,
            'average_profit': 0.0,
            'average_loss': 0.0,
            'profit_factor': 0.0
        }

    def _create_error_result(self, error_message: str) -> Dict[str, Any]:
        """创建错误结果"""
        return {
            'strategy_config': {},
            'start_date': '',
            'end_date': '',
            'total_return': 0.0,
            'annual_return': 0.0,
            'max_drawdown': 0.0,
            'sharpe_ratio': 0.0,
            'win_rate': 0.0,
            'total_trades': 0,
            'profit_trades': 0,
            'loss_trades': 0,
            'average_profit': 0.0,
            'average_loss': 0.0,
            'profit_factor': 0.0,
            'backtest_completed': False,
            'message': error_message,
            'timestamp': datetime.now().isoformat(),
            'portfolio_summary': {
                'initial_capital': self.initial_capital,
                'final_value': self.initial_capital,
                'cash': self.initial_capital,
                'positions_count': 0,
                'transactions_count': 0
            },
            'equity_curve': []
        }


# 测试函数
async def test_backtest_engine():
    """测试回测引擎"""
    engine = BacktestEngine()

    strategy_config = {
        'weights': {'technical': 0.4, 'fundamental': 0.3, 'capital': 0.2, 'market': 0.1},
        'min_score': 40,
        'max_results': 5
    }

    # 使用最近30天进行测试
    end_date = datetime.now().strftime('%Y-%m-%d')
    start_date = (datetime.now() - timedelta(days=30)).strftime('%Y-%m-%d')

    result = await engine.run_backtest(
        strategy_config, start_date, end_date, 'basic'
    )

    print("回测结果:")
    print(f"总收益率: {result['total_return']:.2f}%")
    print(f"年化收益率: {result['annual_return']:.2f}%")
    print(f"最大回撤: {result['max_drawdown']:.2f}%")
    print(f"夏普比率: {result['sharpe_ratio']:.2f}")
    print(f"胜率: {result['win_rate']:.2f}%")
    print(f"总交易次数: {result['total_trades']}")
    print(f"消息: {result['message']}")


if __name__ == "__main__":
    asyncio.run(test_backtest_engine())
