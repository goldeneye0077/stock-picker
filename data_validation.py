#!/usr/bin/env python3
"""
数据完整性验证工具模块
提供数据质量检查和验证功能
"""

import asyncio
import aiosqlite
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class DataValidator:
    """数据验证器"""

    def __init__(self, db_path: str = "data/stock_picker.db"):
        self.db_path = db_path

    async def verify_stock_data_integrity(
        self,
        stock_code: str,
        date: str,
        check_types: List[str] = None
    ) -> Dict[str, bool]:
        """
        验证单只股票单日数据完整性

        Args:
            stock_code: 股票代码（如 '000001'）
            date: 日期（格式 'YYYY-MM-DD'）
            check_types: 要检查的数据类型列表，可选值：
                - 'kline': K线数据
                - 'fund_flow': 资金流向数据
                - 'daily_basic': 基本面数据
                - 'volume_analysis': 成交量分析数据

        Returns:
            字典，键为数据类型，值为是否完整的布尔值
        """
        if check_types is None:
            check_types = ['kline', 'fund_flow', 'daily_basic']

        results = {}

        try:
            async with aiosqlite.connect(self.db_path) as db:
                for check_type in check_types:
                    if check_type == 'kline':
                        cursor = await db.execute("""
                            SELECT COUNT(*) FROM klines
                            WHERE stock_code = ? AND date = ?
                        """, (stock_code, date))
                        has_data = (await cursor.fetchone())[0] > 0
                        results['kline'] = has_data

                    elif check_type == 'fund_flow':
                        cursor = await db.execute("""
                            SELECT COUNT(*) FROM fund_flow
                            WHERE stock_code = ? AND date = ?
                        """, (stock_code, date))
                        has_data = (await cursor.fetchone())[0] > 0
                        results['fund_flow'] = has_data

                    elif check_type == 'daily_basic':
                        cursor = await db.execute("""
                            SELECT COUNT(*) FROM daily_basic
                            WHERE stock_code = ? AND trade_date = ?
                        """, (stock_code, date))
                        has_data = (await cursor.fetchone())[0] > 0
                        results['daily_basic'] = has_data

                    elif check_type == 'volume_analysis':
                        cursor = await db.execute("""
                            SELECT COUNT(*) FROM volume_analysis
                            WHERE stock_code = ? AND date = ?
                        """, (stock_code, date))
                        has_data = (await cursor.fetchone())[0] > 0
                        results['volume_analysis'] = has_data

        except Exception as e:
            logger.error(f"验证股票数据完整性失败 {stock_code} {date}: {e}")
            for check_type in check_types:
                results[check_type] = False

        return results

    async def verify_date_data_completeness(
        self,
        date: str,
        min_coverage: float = 0.8
    ) -> Dict[str, any]:
        """
        验证指定日期的数据完整性

        Args:
            date: 日期（格式 'YYYY-MM-DD'）
            min_coverage: 最小覆盖率阈值

        Returns:
            包含完整性统计信息的字典
        """
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 获取股票总数
                cursor = await db.execute("SELECT COUNT(*) FROM stocks")
                total_stocks = (await cursor.fetchone())[0]

                if total_stocks == 0:
                    return {
                        'date': date,
                        'total_stocks': 0,
                        'kline_coverage': 0.0,
                        'fund_flow_coverage': 0.0,
                        'is_complete': False,
                        'message': '无股票数据'
                    }

                # 检查K线数据覆盖率
                cursor = await db.execute("""
                    SELECT COUNT(DISTINCT stock_code) as stock_count
                    FROM klines
                    WHERE date = ?
                """, (date,))
                kline_stocks = (await cursor.fetchone())[0]
                kline_coverage = kline_stocks / total_stocks

                # 检查资金流向数据覆盖率
                cursor = await db.execute("""
                    SELECT COUNT(DISTINCT stock_code) as stock_count
                    FROM fund_flow
                    WHERE date = ?
                """, (date,))
                flow_stocks = (await cursor.fetchone())[0]
                flow_coverage = flow_stocks / total_stocks

                # 判断是否完整
                is_complete = (kline_coverage >= min_coverage and
                              flow_coverage >= min_coverage)

                return {
                    'date': date,
                    'total_stocks': total_stocks,
                    'kline_stocks': kline_stocks,
                    'fund_flow_stocks': flow_stocks,
                    'kline_coverage': round(kline_coverage, 4),
                    'fund_flow_coverage': round(flow_coverage, 4),
                    'is_complete': is_complete,
                    'message': f"K线覆盖率: {kline_coverage:.1%}, 资金流向覆盖率: {flow_coverage:.1%}"
                }

        except Exception as e:
            logger.error(f"验证日期数据完整性失败 {date}: {e}")
            return {
                'date': date,
                'total_stocks': 0,
                'kline_coverage': 0.0,
                'fund_flow_coverage': 0.0,
                'is_complete': False,
                'message': f'验证失败: {e}'
            }

    async def verify_date_range_completeness(
        self,
        start_date: str,
        end_date: str,
        min_coverage: float = 0.8
    ) -> List[Dict[str, any]]:
        """
        验证日期范围内的数据完整性

        Args:
            start_date: 开始日期（格式 'YYYY-MM-DD'）
            end_date: 结束日期（格式 'YYYY-MM-DD'）
            min_coverage: 最小覆盖率阈值

        Returns:
            每日完整性统计信息列表
        """
        results = []

        # 生成日期列表
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        delta = end - start

        for i in range(delta.days + 1):
            date = (start + timedelta(days=i)).strftime('%Y-%m-%d')
            result = await self.verify_date_data_completeness(date, min_coverage)
            results.append(result)

        return results

    async def find_missing_data(
        self,
        date: str,
        data_type: str = 'kline'
    ) -> List[str]:
        """
        查找指定日期缺失数据的股票

        Args:
            date: 日期（格式 'YYYY-MM-DD'）
            data_type: 数据类型，'kline' 或 'fund_flow'

        Returns:
            缺失数据的股票代码列表
        """
        missing_stocks = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                if data_type == 'kline':
                    # 查找有股票信息但没有K线数据的股票
                    cursor = await db.execute("""
                        SELECT s.code
                        FROM stocks s
                        LEFT JOIN klines k ON s.code = k.stock_code AND k.date = ?
                        WHERE k.stock_code IS NULL
                    """, (date,))

                elif data_type == 'fund_flow':
                    # 查找有股票信息但没有资金流向数据的股票
                    cursor = await db.execute("""
                        SELECT s.code
                        FROM stocks s
                        LEFT JOIN fund_flow f ON s.code = f.stock_code AND f.date = ?
                        WHERE f.stock_code IS NULL
                    """, (date,))

                else:
                    raise ValueError(f"不支持的数据类型: {data_type}")

                rows = await cursor.fetchall()
                missing_stocks = [row[0] for row in rows]

        except Exception as e:
            logger.error(f"查找缺失数据失败 {date} {data_type}: {e}")

        return missing_stocks

    async def verify_hot_sector_coverage(
        self,
        date: str = None
    ) -> Dict[str, any]:
        """
        验证热门板块股票数据覆盖率

        Args:
            date: 日期，如果为None则检查最近7天

        Returns:
            热门股票覆盖率统计信息
        """
        # 热门股票列表（14只）
        hot_stocks = [
            "300474", "002371", "002049",  # AI算力硬件
            "300750",  # 新能源
            "600519", "000858",  # 白酒
            "600118", "600879", "000901",  # 商业航天
            "300502", "300394", "300308",  # CPO板块
            "002415", "000001"  # 其他
        ]

        if date is None:
            # 检查最近7天
            end_date = datetime.now().strftime('%Y-%m-%d')
            start_date = (datetime.now() - timedelta(days=6)).strftime('%Y-%m-%d')
            date_range_results = []

            start = datetime.strptime(start_date, '%Y-%m-%d')
            end = datetime.strptime(end_date, '%Y-%m-%d')
            delta = end - start

            for i in range(delta.days + 1):
                check_date = (start + timedelta(days=i)).strftime('%Y-%m-%d')
                coverage = await self._check_hot_stocks_coverage(hot_stocks, check_date)
                date_range_results.append({
                    'date': check_date,
                    'coverage': coverage
                })

            # 计算总体覆盖率
            total_days = len(date_range_results)
            avg_kline_coverage = sum(r['coverage']['kline_coverage'] for r in date_range_results) / total_days
            avg_flow_coverage = sum(r['coverage']['flow_coverage'] for r in date_range_results) / total_days

            return {
                'date_range': f"{start_date} 至 {end_date}",
                'total_hot_stocks': len(hot_stocks),
                'total_days': total_days,
                'avg_kline_coverage': round(avg_kline_coverage, 4),
                'avg_flow_coverage': round(avg_flow_coverage, 4),
                'daily_results': date_range_results,
                'is_complete': avg_kline_coverage >= 0.95 and avg_flow_coverage >= 0.95
            }

        else:
            # 检查指定日期
            coverage = await self._check_hot_stocks_coverage(hot_stocks, date)
            return {
                'date': date,
                'total_hot_stocks': len(hot_stocks),
                'kline_coverage': coverage['kline_coverage'],
                'flow_coverage': coverage['flow_coverage'],
                'missing_kline': coverage['missing_kline'],
                'missing_flow': coverage['missing_flow'],
                'is_complete': coverage['kline_coverage'] >= 0.95 and coverage['flow_coverage'] >= 0.95
            }

    async def _check_hot_stocks_coverage(
        self,
        hot_stocks: List[str],
        date: str
    ) -> Dict[str, any]:
        """检查热门股票覆盖率"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 检查K线数据
                kline_missing = []
                for stock_code in hot_stocks:
                    cursor = await db.execute("""
                        SELECT COUNT(*) FROM klines
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, date))
                    has_kline = (await cursor.fetchone())[0] > 0
                    if not has_kline:
                        kline_missing.append(stock_code)

                # 检查资金流向数据
                flow_missing = []
                for stock_code in hot_stocks:
                    cursor = await db.execute("""
                        SELECT COUNT(*) FROM fund_flow
                        WHERE stock_code = ? AND date = ?
                    """, (stock_code, date))
                    has_flow = (await cursor.fetchone())[0] > 0
                    if not has_flow:
                        flow_missing.append(stock_code)

                kline_coverage = (len(hot_stocks) - len(kline_missing)) / len(hot_stocks)
                flow_coverage = (len(hot_stocks) - len(flow_missing)) / len(hot_stocks)

                return {
                    'kline_coverage': kline_coverage,
                    'flow_coverage': flow_coverage,
                    'missing_kline': kline_missing,
                    'missing_flow': flow_missing
                }

        except Exception as e:
            logger.error(f"检查热门股票覆盖率失败 {date}: {e}")
            return {
                'kline_coverage': 0.0,
                'flow_coverage': 0.0,
                'missing_kline': hot_stocks,
                'missing_flow': hot_stocks
            }

    async def generate_quality_report(
        self,
        start_date: str = None,
        end_date: str = None
    ) -> Dict[str, any]:
        """
        生成数据质量报告

        Args:
            start_date: 开始日期，如果为None则使用最近7天
            end_date: 结束日期，如果为None则使用今天

        Returns:
            数据质量报告
        """
        if end_date is None:
            end_date = datetime.now().strftime('%Y-%m-%d')

        if start_date is None:
            start_date = (datetime.now() - timedelta(days=6)).strftime('%Y-%m-%d')

        try:
            # 1. 日期范围完整性检查
            date_range_results = await self.verify_date_range_completeness(
                start_date, end_date, min_coverage=0.8
            )

            # 2. 热门股票覆盖率检查
            hot_sector_results = await self.verify_hot_sector_coverage()

            # 3. 计算总体评分
            total_days = len(date_range_results)
            avg_kline_coverage = sum(r['kline_coverage'] for r in date_range_results) / total_days
            avg_flow_coverage = sum(r['fund_flow_coverage'] for r in date_range_results) / total_days

            # 评分算法（满分100分）
            # - 数据覆盖率：40分（K线和资金流向各20分）
            # - 热门股票覆盖率：30分（K线和资金流向各15分）
            # - 数据一致性：30分（K线和资金流向匹配度）
            coverage_score = (avg_kline_coverage * 20 + avg_flow_coverage * 20)
            hot_sector_score = (hot_sector_results['avg_kline_coverage'] * 15 +
                               hot_sector_results['avg_flow_coverage'] * 15)

            # 计算数据一致性（K线和资金流向都有数据的股票比例）
            consistency_scores = []
            for result in date_range_results:
                if result['total_stocks'] > 0:
                    both_data_stocks = min(result['kline_stocks'], result['fund_flow_stocks'])
                    consistency = both_data_stocks / result['total_stocks']
                    consistency_scores.append(consistency)

            avg_consistency = sum(consistency_scores) / len(consistency_scores) if consistency_scores else 0
            consistency_score = avg_consistency * 30

            total_score = coverage_score + hot_sector_score + consistency_score

            # 4. 生成报告
            report = {
                'report_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'date_range': f"{start_date} 至 {end_date}",
                'total_days': total_days,
                'overall_score': round(total_score, 2),
                'score_breakdown': {
                    'coverage_score': round(coverage_score, 2),
                    'hot_sector_score': round(hot_sector_score, 2),
                    'consistency_score': round(consistency_score, 2)
                },
                'coverage_metrics': {
                    'avg_kline_coverage': round(avg_kline_coverage, 4),
                    'avg_flow_coverage': round(avg_flow_coverage, 4),
                    'avg_consistency': round(avg_consistency, 4)
                },
                'hot_sector_metrics': hot_sector_results,
                'daily_results': date_range_results,
                'quality_level': self._get_quality_level(total_score)
            }

            return report

        except Exception as e:
            logger.error(f"生成质量报告失败: {e}")
            return {
                'error': str(e),
                'report_date': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'quality_level': 'ERROR'
            }

    def _get_quality_level(self, score: float) -> str:
        """根据评分获取质量等级"""
        if score >= 95:
            return '优秀'
        elif score >= 85:
            return '良好'
        elif score >= 70:
            return '一般'
        elif score >= 60:
            return '及格'
        else:
            return '不及格'


# 测试函数
async def run_validation_tests():
    """运行验证测试"""
    print("测试数据验证工具模块...")

    validator = DataValidator()

    try:
        # 测试单只股票验证
        print("\n1. 测试单只股票验证:")
        result = await validator.verify_stock_data_integrity("000001", "2025-12-09")
        print(f"   000001 数据完整性: {result}")

        # 测试日期完整性验证
        print("\n2. 测试日期完整性验证:")
        today = datetime.now().strftime('%Y-%m-%d')
        result = await validator.verify_date_data_completeness(today)
        print(f"   {today} 数据完整性:")
        print(f"     股票总数: {result['total_stocks']}")
        print(f"     K线覆盖率: {result['kline_coverage']:.1%}")
        print(f"     资金流向覆盖率: {result['fund_flow_coverage']:.1%}")

        # 测试热门股票覆盖率
        print("\n3. 测试热门股票覆盖率:")
        result = await validator.verify_hot_sector_coverage(today)
        print(f"   热门股票覆盖率:")
        print(f"     K线覆盖率: {result['kline_coverage']:.1%}")
        print(f"     资金流向覆盖率: {result['flow_coverage']:.1%}")

        # 测试缺失数据查找
        print("\n4. 测试缺失数据查找:")
        missing_kline = await validator.find_missing_data(today, 'kline')
        missing_flow = await validator.find_missing_data(today, 'fund_flow')
        print(f"   缺失K线数据的股票: {len(missing_kline)} 只")
        print(f"   缺失资金流向数据的股票: {len(missing_flow)} 只")

        print("\n所有测试完成!")

    except Exception as e:
        print(f"测试失败: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_validation_tests())