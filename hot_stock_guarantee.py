#!/usr/bin/env python3
"""
热门股票保障模块
确保热门板块股票数据100%完整
"""

import asyncio
import aiosqlite
import time
from datetime import datetime, timedelta
from typing import List, Dict, Tuple
import logging

# 导入重试和验证工具
import sys
sys.path.append('.')
from retry_utils import sync_collect_with_retry
from data_validation import DataValidator

# 添加 data-service 路径以导入 tushare 客户端
sys.path.append('data-service/src')
from data_sources.tushare_client import TushareClient

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class HotStockGuarantee:
    """热门股票保障器"""

    def __init__(self, db_path: str = "data/stock_picker.db"):
        self.db_path = db_path
        self.tushare_client = None
        self.validator = DataValidator(db_path)

        # 热门股票配置
        self.hot_stocks_config = {
            'AI算力硬件': [
                ("300474", "SZ", "景嘉微"),
                ("002371", "SZ", "北方华创"),
                ("002049", "SZ", "紫光国微")
            ],
            '新能源': [
                ("300750", "SZ", "宁德时代")
            ],
            '白酒': [
                ("600519", "SH", "贵州茅台"),
                ("000858", "SZ", "五粮液")
            ],
            '商业航天': [
                ("600118", "SH", "中国卫星"),
                ("600879", "SH", "航天电子"),
                ("000901", "SZ", "航天科技")
            ],
            'CPO板块': [
                ("300502", "SZ", "新易盛"),
                ("300394", "SZ", "天孚通信"),
                ("300308", "SZ", "中际旭创")
            ],
            '其他重要': [
                ("002415", "SZ", "海康威视"),
                ("000001", "SZ", "平安银行")
            ]
        }

        # 获取所有热门股票
        self.all_hot_stocks = []
        for category, stocks in self.hot_stocks_config.items():
            self.all_hot_stocks.extend(stocks)

        logger.info(f"热门股票保障器初始化，共 {len(self.all_hot_stocks)} 只股票")

    def initialize(self) -> bool:
        """初始化"""
        try:
            self.tushare_client = TushareClient()
            if not self.tushare_client.is_available():
                logger.error("Tushare 客户端不可用")
                return False
            return True
        except Exception as e:
            logger.error(f"初始化失败: {e}")
            return False

    async def check_hot_stock_coverage(self, date: str = None) -> Dict[str, any]:
        """
        检查热门股票数据覆盖率

        Args:
            date: 日期，如果为None则检查最近7天

        Returns:
            覆盖率统计信息
        """
        if date is None:
            # 检查最近7天
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=6)).strftime('%Y-%m-%d')
            return await self._check_date_range_coverage(start_date, end_date)
        else:
            # 检查指定日期
            return await self._check_single_date_coverage(date)

    async def _check_single_date_coverage(self, date: str) -> Dict[str, any]:
        """检查单日覆盖率"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                results = []
                missing_kline = []
                missing_flow = []

                for stock_code, exchange, name in self.all_hot_stocks:
                    ts_code = f"{stock_code}.{exchange}"

                    # 检查K线数据
                    await cursor.execute("""
                        SELECT COUNT(*) FROM klines
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, date))
                    has_kline = (await cursor.fetchone())[0] > 0

                    # 检查资金流向数据
                    await cursor.execute("""
                        SELECT COUNT(*) FROM fund_flow
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, date))
                    has_flow = (await cursor.fetchone())[0] > 0

                    status = "COMPLETE" if has_kline and has_flow else "INCOMPLETE"
                    if not has_kline:
                        missing_kline.append(f"{ts_code} {name}")
                    if not has_flow:
                        missing_flow.append(f"{ts_code} {name}")

                    results.append({
                        'ts_code': ts_code,
                        'name': name,
                        'has_kline': has_kline,
                        'has_flow': has_flow,
                        'status': status
                    })

                total = len(self.all_hot_stocks)
                complete_count = sum(1 for r in results if r['status'] == 'COMPLETE')
                kline_coverage = sum(1 for r in results if r['has_kline']) / total
                flow_coverage = sum(1 for r in results if r['has_flow']) / total

                return {
                    'date': date,
                    'total_hot_stocks': total,
                    'complete_count': complete_count,
                    'incomplete_count': total - complete_count,
                    'kline_coverage': round(kline_coverage, 4),
                    'flow_coverage': round(flow_coverage, 4),
                    'missing_kline': missing_kline,
                    'missing_flow': missing_flow,
                    'is_fully_covered': complete_count == total,
                    'results': results
                }

        except Exception as e:
            logger.error(f"检查单日覆盖率失败 {date}: {e}")
            return {
                'date': date,
                'error': str(e),
                'is_fully_covered': False
            }

    async def _check_date_range_coverage(self, start_date: str, end_date: str) -> Dict[str, any]:
        """检查日期范围覆盖率"""
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
            end = datetime.strptime(end_date, '%Y-%m-%d')
            delta = end - start

            daily_results = []
            for i in range(delta.days + 1):
                date = (start + timedelta(days=i)).strftime('%Y-%m-%d')
                result = await self._check_single_date_coverage(date)
                daily_results.append(result)

            # 计算总体统计
            total_days = len(daily_results)
            avg_kline_coverage = sum(r['kline_coverage'] for r in daily_results) / total_days
            avg_flow_coverage = sum(r['flow_coverage'] for r in daily_results) / total_days
            fully_covered_days = sum(1 for r in daily_results if r['is_fully_covered'])

            # 找出缺失最严重的日期
            worst_days = sorted(daily_results, key=lambda x: x['incomplete_count'], reverse=True)[:3]

            return {
                'date_range': f"{start_date} 至 {end_date}",
                'total_days': total_days,
                'fully_covered_days': fully_covered_days,
                'partially_covered_days': total_days - fully_covered_days,
                'avg_kline_coverage': round(avg_kline_coverage, 4),
                'avg_flow_coverage': round(avg_flow_coverage, 4),
                'worst_days': worst_days,
                'daily_results': daily_results,
                'is_fully_covered': fully_covered_days == total_days
            }

        except Exception as e:
            logger.error(f"检查日期范围覆盖率失败 {start_date}-{end_date}: {e}")
            return {
                'date_range': f"{start_date} 至 {end_date}",
                'error': str(e),
                'is_fully_covered': False
            }

    async def supplement_missing_data(self, date: str = None):
        """
        补充缺失的热门股票数据

        Args:
            date: 日期，如果为None则补充最近7天
        """
        if date is None:
            # 补充最近7天
            end_date = datetime.now()
            start_date = end_date - timedelta(days=6)

            for i in range(7):
                current_date = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
                await self._supplement_single_date(current_date)
                time.sleep(1)  # API限流
        else:
            # 补充指定日期
            await self._supplement_single_date(date)

    async def _supplement_single_date(self, date: str):
        """补充单日缺失数据"""
        logger.info(f"补充 {date} 热门股票缺失数据...")

        try:
            # 检查缺失情况
            coverage = await self._check_single_date_coverage(date)

            if coverage['is_fully_covered']:
                logger.info(f"{date} 热门股票数据已完整，无需补充")
                return

            logger.info(f"{date} 缺失数据: K线{len(coverage['missing_kline'])}只, 资金流向{len(coverage['missing_flow'])}只")

            # 补充K线数据
            for missing_item in coverage['missing_kline']:
                parts = missing_item.split()
                if len(parts) >= 2:
                    ts_code = parts[0]
                    await self._supplement_kline_data(ts_code, date)

            # 补充资金流向数据
            for missing_item in coverage['missing_flow']:
                parts = missing_item.split()
                if len(parts) >= 2:
                    ts_code = parts[0]
                    await self._supplement_flow_data(ts_code, date)

            # 验证补充结果
            final_coverage = await self._check_single_date_coverage(date)
            if final_coverage['is_fully_covered']:
                logger.info(f"{date} 数据补充完成，现在已100%完整")
            else:
                logger.warning(f"{date} 数据补充后仍不完整: K线覆盖率{final_coverage['kline_coverage']:.1%}, 资金流向覆盖率{final_coverage['flow_coverage']:.1%}")

        except Exception as e:
            logger.error(f"补充单日数据失败 {date}: {e}")

    async def _supplement_kline_data(self, ts_code: str, date: str):
        """补充K线数据"""
        try:
            # 转换日期格式
            trade_date = date.replace('-', '')

            def _get_kline_data():
                df = asyncio.run(self.tushare_client.get_daily_data(
                    ts_code,
                    start_date=trade_date,
                    end_date=trade_date
                ))
                return df

            df = sync_collect_with_retry(_get_kline_data)

            if df is None or df.empty:
                logger.warning(f"无法获取 {ts_code} {date} K线数据")
                return

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                for _, row in df.iterrows():
                    try:
                        stock_code = ts_code.split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        await cursor.execute("""
                            INSERT OR REPLACE INTO klines
                            (stock_code, date, open, high, low, close, volume, amount, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            trade_date_str,
                            float(row['open']),
                            float(row['high']),
                            float(row['low']),
                            float(row['close']),
                            int(row['vol'] * 100),
                            float(row['amount'] * 1000)
                        ))
                    except Exception as e:
                        logger.warning(f"插入K线 {ts_code} 失败: {e}")

                await db.commit()
                logger.info(f"补充 {ts_code} K线数据成功")

        except Exception as e:
            logger.error(f"补充K线数据失败 {ts_code} {date}: {e}")

    async def _supplement_flow_data(self, ts_code: str, date: str):
        """补充资金流向数据"""
        try:
            # 转换日期格式
            trade_date = date.replace('-', '')

            def _get_flow_data():
                df = asyncio.run(self.tushare_client.get_moneyflow(
                    ts_code,
                    start_date=trade_date,
                    end_date=trade_date
                ))
                return df

            df = sync_collect_with_retry(_get_flow_data)

            if df is None or df.empty:
                logger.warning(f"无法获取 {ts_code} {date} 资金流向数据")
                return

            # 插入数据库
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.cursor()

                for _, row in df.iterrows():
                    try:
                        stock_code = ts_code.split('.')[0]
                        trade_date_str = row['trade_date'].strftime('%Y-%m-%d')

                        # 计算大单占比
                        total_amount = abs(row['buy_lg_amount']) + abs(row['sell_lg_amount']) + \
                                     abs(row['buy_elg_amount']) + abs(row['sell_elg_amount'])
                        small_amount = abs(row['buy_sm_amount']) + abs(row['sell_sm_amount']) + \
                                     abs(row['buy_md_amount']) + abs(row['sell_md_amount'])

                        large_order_ratio = total_amount / (total_amount + small_amount) if (total_amount + small_amount) > 0 else 0
                        institutional_flow = float(row.get('extra_large_net_flow', 0))

                        await cursor.execute("""
                            INSERT OR REPLACE INTO fund_flow
                            (stock_code, date, main_fund_flow, retail_fund_flow, institutional_flow, large_order_ratio, created_at)
                            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                        """, (
                            stock_code,
                            trade_date_str,
                            float(row['main_fund_flow']),
                            float(row['retail_fund_flow']),
                            institutional_flow,
                            round(large_order_ratio, 4)
                        ))
                    except Exception as e:
                        logger.warning(f"插入资金流向 {ts_code} 失败: {e}")

                await db.commit()
                logger.info(f"补充 {ts_code} 资金流向数据成功")

        except Exception as e:
            logger.error(f"补充资金流向数据失败 {ts_code} {date}: {e}")

    async def generate_coverage_report(self, days: int = 7) -> Dict[str, any]:
        """
        生成热门股票覆盖率报告

        Args:
            days: 报告天数

        Returns:
            覆盖率报告
        """
        logger.info(f"生成最近{days}天热门股票覆盖率报告...")

        try:
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=days-1)).strftime('%Y-%m-%d')

            # 获取覆盖率数据
            coverage_data = await self._check_date_range_coverage(start_date, end_date)

            # 生成报告
            report = {
                'report_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'date_range': coverage_data['date_range'],
                'total_days': coverage_data['total_days'],
                'fully_covered_days': coverage_data['fully_covered_days'],
                'partially_covered_days': coverage_data['partially_covered_days'],
                'coverage_rate': coverage_data['fully_covered_days'] / coverage_data['total_days'],
                'avg_kline_coverage': coverage_data['avg_kline_coverage'],
                'avg_flow_coverage': coverage_data['avg_flow_coverage'],
                'is_fully_covered': coverage_data['is_fully_covered'],
                'hot_stock_categories': list(self.hot_stocks_config.keys()),
                'total_hot_stocks': len(self.all_hot_stocks),
                'worst_days': coverage_data['worst_days'],
                'recommendations': self._generate_recommendations(coverage_data)
            }

            return report

        except Exception as e:
            logger.error(f"生成覆盖率报告失败: {e}")
            return {
                'report_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'error': str(e)
            }

    def _generate_recommendations(self, coverage_data: Dict) -> List[str]:
        """生成改进建议"""
        recommendations = []

        if not coverage_data['is_fully_covered']:
            recommendations.append("热门股票数据不完整，建议立即补充缺失数据")

        if coverage_data['avg_kline_coverage'] < 0.95:
            recommendations.append(f"K线覆盖率({coverage_data['avg_kline_coverage']:.1%})低于95%，需要优化采集逻辑")

        if coverage_data['avg_flow_coverage'] < 0.95:
            recommendations.append(f"资金流向覆盖率({coverage_data['avg_flow_coverage']:.1%})低于95%，需要优化采集逻辑")

        if coverage_data['worst_days']:
            worst_date = coverage_data['worst_days'][0]['date']
            recommendations.append(f"最差日期: {worst_date}，建议优先补充该日数据")

        if not recommendations:
            recommendations.append("热门股票数据完整，继续保持")

        return recommendations


async def test_hot_stock_guarantee():
    """测试热门股票保障功能"""
    print("测试热门股票保障功能...")

    guarantee = HotStockGuarantee()

    if not guarantee.initialize():
        print("初始化失败")
        return

    try:
        # 测试1: 检查最近7天覆盖率
        print("\n1. 检查最近7天覆盖率:")
        coverage = await guarantee.check_hot_stock_coverage()
        print(f"   日期范围: {coverage['date_range']}")
        print(f"   完全覆盖天数: {coverage['fully_covered_days']}/{coverage['total_days']}")
        print(f"   K线平均覆盖率: {coverage['avg_kline_coverage']:.1%}")
        print(f"   资金流向平均覆盖率: {coverage['avg_flow_coverage']:.1%}")

        # 测试2: 生成覆盖率报告
        print("\n2. 生成覆盖率报告:")
        report = await guarantee.generate_coverage_report(days=7)
        print(f"   报告时间: {report['report_date']}")
        print(f"   覆盖率: {report['coverage_rate']:.1%}")
        print(f"   是否完全覆盖: {'是' if report['is_fully_covered'] else '否'}")

        # 测试3: 检查单日覆盖率
        print("\n3. 检查今日覆盖率:")
        today = datetime.now().strftime('%Y-%m-%d')
        today_coverage = await guarantee._check_single_date_coverage(today)
        print(f"   日期: {today_coverage['date']}")
        print(f"   完整股票: {today_coverage['complete_count']}/{today_coverage['total_hot_stocks']}")
        print(f"   K线覆盖率: {today_coverage['kline_coverage']:.1%}")
        print(f"   资金流向覆盖率: {today_coverage['flow_coverage']:.1%}")

        print("\n测试完成!")

    except Exception as e:
        print(f"测试失败: {e}")


if __name__ == "__main__":
    asyncio.run(test_hot_stock_guarantee())