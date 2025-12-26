#!/usr/bin/env python3
"""
数据质量监控工具
第三阶段核心功能：建立持续的数据质量保障机制
"""

import asyncio
import aiosqlite
from datetime import datetime, timedelta
from typing import List, Dict, Tuple, Optional, Any
import logging
import json
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class MetricType(Enum):
    """监控指标类型"""
    COVERAGE = "coverage"           # 覆盖率指标
    COMPLETENESS = "completeness"   # 完整性指标
    CONSISTENCY = "consistency"     # 一致性指标
    TIMELINESS = "timeliness"       # 时效性指标
    ACCURACY = "accuracy"           # 准确性指标


class AlertLevel(Enum):
    """报警级别"""
    INFO = "info"       # 信息
    WARNING = "warning" # 警告
    ERROR = "error"     # 错误
    CRITICAL = "critical" # 严重


@dataclass
class QualityMetric:
    """数据质量指标"""
    name: str
    value: float
    metric_type: MetricType
    threshold: float
    unit: str = "%"
    description: str = ""

    def is_healthy(self) -> bool:
        """检查指标是否健康"""
        if self.metric_type in [MetricType.COVERAGE, MetricType.COMPLETENESS, MetricType.CONSISTENCY, MetricType.ACCURACY]:
            return self.value >= self.threshold
        elif self.metric_type == MetricType.TIMELINESS:
            return self.value <= self.threshold  # 时效性指标越小越好
        return True

    def get_alert_level(self) -> AlertLevel:
        """获取报警级别"""
        if not self.is_healthy():
            deviation = abs(self.value - self.threshold) / self.threshold
            if deviation > 0.3:
                return AlertLevel.CRITICAL
            elif deviation > 0.2:
                return AlertLevel.ERROR
            elif deviation > 0.1:
                return AlertLevel.WARNING
        return AlertLevel.INFO


@dataclass
class QualityAlert:
    """质量报警"""
    metric_name: str
    alert_level: AlertLevel
    current_value: float
    threshold: float
    message: str
    timestamp: str
    suggested_action: str = ""


class DataQualityMonitor:
    """数据质量监控器"""

    def __init__(self, db_path: str = "data/stock_picker.db"):
        self.db_path = db_path

        # 默认监控指标配置
        self.metric_configs = {
            # 覆盖率指标
            "stock_coverage": {
                "type": MetricType.COVERAGE,
                "threshold": 0.95,  # 95%
                "description": "股票数据覆盖率"
            },
            "kline_coverage": {
                "type": MetricType.COVERAGE,
                "threshold": 0.90,  # 90%
                "description": "K线数据覆盖率"
            },
            "flow_coverage": {
                "type": MetricType.COVERAGE,
                "threshold": 0.90,  # 90%
                "description": "资金流向数据覆盖率"
            },
            "hot_stock_coverage": {
                "type": MetricType.COVERAGE,
                "threshold": 1.00,  # 100%
                "description": "热门股票覆盖率"
            },

            # 完整性指标
            "missing_rate": {
                "type": MetricType.COMPLETENESS,
                "threshold": 0.05,  # 5%
                "description": "数据缺失率"
            },
            "error_rate": {
                "type": MetricType.COMPLETENESS,
                "threshold": 0.01,  # 1%
                "description": "数据错误率"
            },

            # 一致性指标
            "data_consistency": {
                "type": MetricType.CONSISTENCY,
                "threshold": 0.85,  # 85%
                "description": "数据一致性（K线和资金流向匹配度）"
            },
            "time_range_consistency": {
                "type": MetricType.CONSISTENCY,
                "threshold": 0.90,  # 90%
                "description": "时间范围一致性"
            },

            # 时效性指标
            "collection_delay": {
                "type": MetricType.TIMELINESS,
                "threshold": 24,  # 24小时
                "unit": "小时",
                "description": "数据采集延迟"
            },
            "update_frequency": {
                "type": MetricType.TIMELINESS,
                "threshold": 1,  # 1天
                "unit": "天",
                "description": "数据更新频率"
            },

            # 准确性指标
            "data_accuracy": {
                "type": MetricType.ACCURACY,
                "threshold": 0.98,  # 98%
                "description": "数据准确性"
            }
        }

        # 报警配置
        self.alert_config = {
            "enable_email": False,
            "enable_slack": False,
            "enable_webhook": False,
            "check_interval_hours": 1,
            "alert_cooldown_hours": 6
        }

    async def calculate_all_metrics(self, days: int = 7) -> List[QualityMetric]:
        """
        计算所有监控指标

        Args:
            days: 计算最近N天的指标

        Returns:
            质量指标列表
        """
        metrics = []

        try:
            # 1. 计算覆盖率指标
            coverage_metrics = await self._calculate_coverage_metrics(days)
            metrics.extend(coverage_metrics)

            # 2. 计算完整性指标
            completeness_metrics = await self._calculate_completeness_metrics(days)
            metrics.extend(completeness_metrics)

            # 3. 计算一致性指标
            consistency_metrics = await self._calculate_consistency_metrics(days)
            metrics.extend(consistency_metrics)

            # 4. 计算时效性指标
            timeliness_metrics = await self._calculate_timeliness_metrics()
            metrics.extend(timeliness_metrics)

            # 5. 计算准确性指标
            accuracy_metrics = await self._calculate_accuracy_metrics(days)
            metrics.extend(accuracy_metrics)

            # 6. 计算总体评分
            overall_score = await self._calculate_overall_score(metrics)
            metrics.append(QualityMetric(
                name="overall_score",
                value=overall_score,
                metric_type=MetricType.ACCURACY,
                threshold=85.0,
                unit="分",
                description="数据质量总体评分"
            ))

            logger.info(f"计算完成 {len(metrics)} 个质量指标")

        except Exception as e:
            logger.error(f"计算质量指标失败: {e}")

        return metrics

    async def _calculate_coverage_metrics(self, days: int) -> List[QualityMetric]:
        """计算覆盖率指标"""
        metrics = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 1. 股票覆盖率
                cursor = await db.execute("SELECT COUNT(*) FROM stocks")
                total_stocks = (await cursor.fetchone())[0]

                if total_stocks > 0:
                    # 最近N天有数据的股票数
                    cursor = await db.execute("""
                        SELECT COUNT(DISTINCT stock_code) FROM klines
                        WHERE date >= date('now', ?)
                    """, (f'-{days} days',))
                    active_stocks = (await cursor.fetchone())[0]

                    stock_coverage = active_stocks / total_stocks
                    metrics.append(QualityMetric(
                        name="stock_coverage",
                        value=stock_coverage * 100,
                        metric_type=MetricType.COVERAGE,
                        threshold=self.metric_configs["stock_coverage"]["threshold"] * 100,
                        description="最近活跃股票覆盖率"
                    ))

                # 2. K线覆盖率
                cursor = await db.execute("""
                    SELECT COUNT(DISTINCT stock_code) as stock_count,
                           COUNT(*) as record_count
                    FROM klines
                    WHERE date >= date('now', ?)
                """, (f'-{days} days',))
                kline_stats = await cursor.fetchone()

                if kline_stats and kline_stats[0] > 0:
                    # 平均每个股票的数据天数
                    avg_days_per_stock = kline_stats[1] / kline_stats[0]
                    expected_days = min(days, 7)  # 期望每个股票有最近7天的数据
                    kline_coverage = min(avg_days_per_stock / expected_days, 1.0)

                    metrics.append(QualityMetric(
                        name="kline_coverage",
                        value=kline_coverage * 100,
                        metric_type=MetricType.COVERAGE,
                        threshold=self.metric_configs["kline_coverage"]["threshold"] * 100,
                        description="K线数据时间覆盖率"
                    ))

                # 3. 资金流向覆盖率
                cursor = await db.execute("""
                    SELECT COUNT(DISTINCT stock_code) as stock_count,
                           COUNT(*) as record_count
                    FROM fund_flow
                    WHERE date >= date('now', ?)
                """, (f'-{days} days',))
                flow_stats = await cursor.fetchone()

                if flow_stats and flow_stats[0] > 0:
                    avg_days_per_stock = flow_stats[1] / flow_stats[0]
                    expected_days = min(days, 7)
                    flow_coverage = min(avg_days_per_stock / expected_days, 1.0)

                    metrics.append(QualityMetric(
                        name="flow_coverage",
                        value=flow_coverage * 100,
                        metric_type=MetricType.COVERAGE,
                        threshold=self.metric_configs["flow_coverage"]["threshold"] * 100,
                        description="资金流向数据时间覆盖率"
                    ))

                # 4. 热门股票覆盖率
                hot_stocks = [
                    "300474", "002371", "002049", "300750",
                    "600519", "000858", "600118", "600879",
                    "000901", "300502", "300394", "300308",
                    "002415", "000001"
                ]

                hot_stock_coverage = await self._calculate_hot_stock_coverage(db, hot_stocks, days)
                metrics.append(QualityMetric(
                    name="hot_stock_coverage",
                    value=hot_stock_coverage * 100,
                    metric_type=MetricType.COVERAGE,
                    threshold=self.metric_configs["hot_stock_coverage"]["threshold"] * 100,
                    description="热门股票数据覆盖率"
                ))

        except Exception as e:
            logger.error(f"计算覆盖率指标失败: {e}")

        return metrics

    async def _calculate_hot_stock_coverage(self, db, hot_stocks: List[str], days: int) -> float:
        """计算热门股票覆盖率"""
        try:
            total_coverage = 0
            for stock_code in hot_stocks:
                # 检查K线数据
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM klines
                    WHERE stock_code = ? AND date >= date('now', ?)
                """, (stock_code, f'-{days} days'))
                kline_count = (await cursor.fetchone())[0]

                # 检查资金流向数据
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM fund_flow
                    WHERE stock_code = ? AND date >= date('now', ?)
                """, (stock_code, f'-{days} days'))
                flow_count = (await cursor.fetchone())[0]

                # 计算该股票的覆盖率（K线和资金流向都有数据的天数比例）
                stock_coverage = min(kline_count, flow_count) / days
                total_coverage += stock_coverage

            return total_coverage / len(hot_stocks) if hot_stocks else 0

        except Exception as e:
            logger.error(f"计算热门股票覆盖率失败: {e}")
            return 0

    async def _calculate_completeness_metrics(self, days: int) -> List[QualityMetric]:
        """计算完整性指标"""
        metrics = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 1. 数据缺失率
                cursor = await db.execute("""
                    SELECT
                        COUNT(DISTINCT s.code) as total_stocks,
                        SUM(CASE WHEN k.stock_code IS NULL THEN 1 ELSE 0 END) as missing_kline,
                        SUM(CASE WHEN f.stock_code IS NULL THEN 1 ELSE 0 END) as missing_flow
                    FROM stocks s
                    LEFT JOIN klines k ON s.code = k.stock_code AND k.date >= date('now', ?)
                    LEFT JOIN fund_flow f ON s.code = f.stock_code AND f.date >= date('now', ?)
                """, (f'-{days} days', f'-{days} days'))

                stats = await cursor.fetchone()
                if stats and stats[0] > 0:
                    missing_rate = (stats[1] + stats[2]) / (stats[0] * 2)  # 两种数据类型
                    metrics.append(QualityMetric(
                        name="missing_rate",
                        value=missing_rate * 100,
                        metric_type=MetricType.COMPLETENESS,
                        threshold=self.metric_configs["missing_rate"]["threshold"] * 100,
                        description="数据缺失率"
                    ))

                # 2. 数据错误率（通过验证异常值来估算）
                error_rate = await self._estimate_error_rate(db, days)
                metrics.append(QualityMetric(
                    name="error_rate",
                    value=error_rate * 100,
                    metric_type=MetricType.COMPLETENESS,
                    threshold=self.metric_configs["error_rate"]["threshold"] * 100,
                    description="数据错误率（估算）"
                ))

        except Exception as e:
            logger.error(f"计算完整性指标失败: {e}")

        return metrics

    async def _estimate_error_rate(self, db, days: int) -> float:
        """估算数据错误率（通过检查异常值）"""
        try:
            # 检查K线数据中的异常值
            cursor = await db.execute("""
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN open <= 0 OR high <= 0 OR low <= 0 OR close <= 0 OR volume <= 0 THEN 1 ELSE 0 END) as errors
                FROM klines
                WHERE date >= date('now', ?)
            """, (f'-{days} days',))

            kline_stats = await cursor.fetchone()

            # 检查资金流向数据中的异常值
            cursor = await db.execute("""
                SELECT COUNT(*) as total,
                       SUM(CASE WHEN main_fund_flow = 0 AND retail_fund_flow = 0 AND institutional_flow = 0 THEN 1 ELSE 0 END) as errors
                FROM fund_flow
                WHERE date >= date('now', ?)
            """, (f'-{days} days',))

            flow_stats = await cursor.fetchone()

            total_records = (kline_stats[0] if kline_stats else 0) + (flow_stats[0] if flow_stats else 0)
            total_errors = (kline_stats[1] if kline_stats else 0) + (flow_stats[1] if flow_stats else 0)

            return total_errors / total_records if total_records > 0 else 0

        except Exception as e:
            logger.error(f"估算错误率失败: {e}")
            return 0

    async def _calculate_consistency_metrics(self, days: int) -> List[QualityMetric]:
        """计算一致性指标"""
        metrics = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT
                        COUNT(DISTINCT s.code) as total_stocks,
                        COUNT(DISTINCT CASE WHEN k.stock_code IS NOT NULL AND f.stock_code IS NOT NULL THEN s.code END) as matched_stocks
                    FROM stocks s
                    LEFT JOIN klines k ON s.code = k.stock_code AND k.date >= date('now', ?)
                    LEFT JOIN fund_flow f ON s.code = f.stock_code AND f.date >= date('now', ?)
                """, (f'-{days} days', f'-{days} days'))

                stats = await cursor.fetchone()
                if stats and stats[0] > 0:
                    consistency = stats[1] / stats[0]
                    metrics.append(QualityMetric(
                        name="data_consistency",
                        value=consistency * 100,
                        metric_type=MetricType.CONSISTENCY,
                        threshold=self.metric_configs["data_consistency"]["threshold"] * 100,
                        description="K线和资金流向数据一致性"
                    ))

                cursor = await db.execute("""
                    SELECT
                        MIN(date) as min_date,
                        MAX(date) as max_date,
                        COUNT(DISTINCT date) as distinct_days
                    FROM klines
                    WHERE date >= date('now', ?)
                """, (f'-{days} days',))

                kline_dates = await cursor.fetchone()

                cursor = await db.execute("""
                    SELECT
                        MIN(date) as min_date,
                        MAX(date) as max_date,
                        COUNT(DISTINCT date) as distinct_days
                    FROM fund_flow
                    WHERE date >= date('now', ?)
                """, (f'-{days} days',))

                flow_dates = await cursor.fetchone()

                if (
                    kline_dates
                    and flow_dates
                    and kline_dates[0]
                    and kline_dates[1]
                    and flow_dates[0]
                    and flow_dates[1]
                ):
                    kline_start = datetime.fromisoformat(kline_dates[0])
                    kline_end = datetime.fromisoformat(kline_dates[1])
                    flow_start = datetime.fromisoformat(flow_dates[0])
                    flow_end = datetime.fromisoformat(flow_dates[1])

                    start = max(kline_start, flow_start)
                    end = min(kline_end, flow_end)

                    if start <= end:
                        intersection_days = (end - start).days + 1
                        total_days = (kline_end - kline_start).days + 1
                        time_consistency = intersection_days / total_days if total_days > 0 else 0
                    else:
                        time_consistency = 0

                    metrics.append(QualityMetric(
                        name="time_range_consistency",
                        value=time_consistency * 100,
                        metric_type=MetricType.CONSISTENCY,
                        threshold=self.metric_configs["time_range_consistency"]["threshold"] * 100,
                        description="K线和资金流向时间范围一致性"
                    ))

        except Exception as e:
            logger.error(f"计算一致性指标失败: {e}")

        return metrics

    async def _calculate_timeliness_metrics(self) -> List[QualityMetric]:
        """计算时效性指标"""
        metrics = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 1. 数据采集延迟
                cursor = await db.execute("""
                    SELECT MAX(created_at) FROM collection_history
                    WHERE status = 'completed'
                """)
                last_collection = await cursor.fetchone()

                if last_collection and last_collection[0]:
                    last_time = datetime.fromisoformat(last_collection[0].replace('Z', '+00:00'))
                    delay_hours = (datetime.now() - last_time).total_seconds() / 3600

                    metrics.append(QualityMetric(
                        name="collection_delay",
                        value=delay_hours,
                        metric_type=MetricType.TIMELINESS,
                        threshold=self.metric_configs["collection_delay"]["threshold"],
                        unit="小时",
                        description="距离上次成功采集的时间"
                    ))

                # 2. 数据更新频率
                cursor = await db.execute("""
                    SELECT COUNT(*) FROM collection_history
                    WHERE status = 'completed' AND created_at >= date('now', '-7 days')
                """)
                weekly_collections = (await cursor.fetchone())[0]

                update_frequency = 7 / weekly_collections if weekly_collections > 0 else 7
                metrics.append(QualityMetric(
                    name="update_frequency",
                    value=update_frequency,
                    metric_type=MetricType.TIMELINESS,
                    threshold=self.metric_configs["update_frequency"]["threshold"],
                    unit="天",
                    description="平均更新间隔"
                ))

        except Exception as e:
            logger.error(f"计算时效性指标失败: {e}")

        return metrics

    async def _calculate_accuracy_metrics(self, days: int) -> List[QualityMetric]:
        """计算准确性指标"""
        metrics = []

        try:
            async with aiosqlite.connect(self.db_path) as db:
                cursor = await db.execute("""
                    SELECT
                        COUNT(*) as total,
                        SUM(
                            CASE
                                WHEN open > 0
                                 AND close > 0
                                 AND high >= low
                                 AND high >= open
                                 AND high >= close
                                 AND low > 0
                                 AND volume >= 0
                                 AND amount >= 0
                                THEN 1
                                ELSE 0
                            END
                        ) as valid
                    FROM klines
                    WHERE date >= date('now', ?)
                """, (f'-{days} days',))
                kline_stats = await cursor.fetchone()

                price_accuracy = None
                if kline_stats and kline_stats[0] > 0:
                    price_accuracy = (kline_stats[1] or 0) / kline_stats[0]

                cursor = await db.execute("""
                    SELECT
                        COUNT(*) as total,
                        SUM(
                            CASE
                                WHEN k.amount > 0
                                 AND (
                                     ABS(f.main_fund_flow)
                                     + ABS(f.retail_fund_flow)
                                     + ABS(f.institutional_flow)
                                 ) > 0
                                 AND (
                                     ABS(f.main_fund_flow)
                                     + ABS(f.retail_fund_flow)
                                     + ABS(f.institutional_flow)
                                 ) BETWEEN k.amount * 0.2 AND k.amount * 2.0
                                THEN 1
                                ELSE 0
                            END
                        ) as valid
                    FROM fund_flow f
                    JOIN klines k ON f.stock_code = k.stock_code AND f.date = k.date
                    WHERE f.date >= date('now', ?)
                """, (f'-{days} days',))
                flow_stats = await cursor.fetchone()

                flow_accuracy = None
                if flow_stats and flow_stats[0] > 0:
                    flow_accuracy = (flow_stats[1] or 0) / flow_stats[0]

                components = []
                if price_accuracy is not None:
                    components.append(price_accuracy)
                if flow_accuracy is not None:
                    components.append(flow_accuracy)

                data_accuracy = sum(components) / len(components) if components else 0

                metrics.append(QualityMetric(
                    name="data_accuracy",
                    value=data_accuracy * 100,
                    metric_type=MetricType.ACCURACY,
                    threshold=self.metric_configs["data_accuracy"]["threshold"] * 100,
                    description="数据准确性（价格与资金流匹配度）"
                ))

        except Exception as e:
            logger.error(f"计算准确性指标失败: {e}")

        return metrics

    async def _calculate_overall_score(self, metrics: List[QualityMetric]) -> float:
        """计算总体评分"""
        try:
            if not metrics:
                return 0

            # 权重配置
            weights = {
                "stock_coverage": 0.10,
                "kline_coverage": 0.15,
                "flow_coverage": 0.15,
                "hot_stock_coverage": 0.10,
                "missing_rate": 0.10,
                "error_rate": 0.10,
                "data_consistency": 0.10,
                "time_range_consistency": 0.05,
                "collection_delay": 0.05,
                "update_frequency": 0.05,
                "data_accuracy": 0.05
            }

            total_score = 0
            total_weight = 0

            for metric in metrics:
                if metric.name in weights:
                    # 归一化到0-100分
                    if metric.metric_type == MetricType.TIMELINESS:
                        # 时效性指标：越小越好，需要反向计算
                        normalized_score = max(0, 100 - (metric.value / metric.threshold * 100))
                    else:
                        # 其他指标：越大越好
                        normalized_score = min(100, metric.value / metric.threshold * 100)

                    total_score += normalized_score * weights[metric.name]
                    total_weight += weights[metric.name]

            return total_score / total_weight if total_weight > 0 else 0

        except Exception as e:
            logger.error(f"计算总体评分失败: {e}")
            return 0

    async def check_and_alert(self, metrics: List[QualityMetric]) -> List[QualityAlert]:
        """
        检查指标并生成报警

        Args:
            metrics: 质量指标列表

        Returns:
            报警列表
        """
        alerts = []

        try:
            for metric in metrics:
                if not metric.is_healthy():
                    alert_level = metric.get_alert_level()

                    if metric.metric_type == MetricType.TIMELINESS:
                        message = f"{metric.description}: {metric.value:.1f}{metric.unit} > 阈值 {metric.threshold}{metric.unit}"
                        suggested_action = "请检查数据采集任务是否正常运行"
                    else:
                        message = f"{metric.description}: {metric.value:.1f}{metric.unit} < 阈值 {metric.threshold}{metric.unit}"
                        suggested_action = "请检查数据采集完整性或重新采集数据"

                    alert = QualityAlert(
                        metric_name=metric.name,
                        alert_level=alert_level,
                        current_value=metric.value,
                        threshold=metric.threshold,
                        message=message,
                        timestamp=datetime.now().isoformat(),
                        suggested_action=suggested_action
                    )
                    alerts.append(alert)

                    logger.warning(f"质量报警: {message}")

            # 记录报警到数据库
            if alerts:
                await self._record_alerts_to_db(alerts)

        except Exception as e:
            logger.error(f"检查报警失败: {e}")

        return alerts

    async def _record_alerts_to_db(self, alerts: List[QualityAlert]):
        """记录报警到数据库"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                for alert in alerts:
                    await db.execute("""
                        INSERT INTO data_quality_monitor
                        (monitor_date, metric_name, metric_value, threshold, status, alert_message, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                    """, (
                        datetime.now().strftime('%Y-%m-%d'),
                        alert.metric_name,
                        alert.current_value,
                        alert.threshold,
                        alert.alert_level.value,
                        alert.message
                    ))

                await db.commit()
                logger.info(f"记录 {len(alerts)} 个报警到数据库")

        except Exception as e:
            logger.error(f"记录报警到数据库失败: {e}")

    async def generate_quality_report(self, days: int = 7) -> Dict[str, Any]:
        """
        生成数据质量报告

        Args:
            days: 报告覆盖的天数

        Returns:
            质量报告字典
        """
        try:
            # 计算所有指标
            metrics = await self.calculate_all_metrics(days)

            # 检查报警
            alerts = await self.check_and_alert(metrics)

            # 计算统计信息
            healthy_metrics = [m for m in metrics if m.is_healthy()]
            unhealthy_metrics = [m for m in metrics if not m.is_healthy()]

            # 查找总体评分
            overall_score = next((m.value for m in metrics if m.name == "overall_score"), 0)

            # 生成报告
            report = {
                "report_date": datetime.now().isoformat(),
                "report_range_days": days,
                "overall_score": round(overall_score, 2),
                "quality_level": self._get_quality_level(overall_score),
                "metrics_summary": {
                    "total_metrics": len(metrics),
                    "healthy_metrics": len(healthy_metrics),
                    "unhealthy_metrics": len(unhealthy_metrics),
                    "health_rate": len(healthy_metrics) / len(metrics) if metrics else 0
                },
                "alerts_summary": {
                    "total_alerts": len(alerts),
                    "critical_alerts": len([a for a in alerts if a.alert_level == AlertLevel.CRITICAL]),
                    "error_alerts": len([a for a in alerts if a.alert_level == AlertLevel.ERROR]),
                    "warning_alerts": len([a for a in alerts if a.alert_level == AlertLevel.WARNING])
                },
                "metrics": [asdict(m) for m in metrics],
                "alerts": [asdict(a) for a in alerts],
                "recommendations": self._generate_recommendations(alerts, metrics)
            }

            logger.info(f"生成质量报告完成，总体评分: {overall_score:.1f}分")
            return report

        except Exception as e:
            logger.error(f"生成质量报告失败: {e}")
            return {
                "error": str(e),
                "report_date": datetime.now().isoformat(),
                "quality_level": "ERROR"
            }

    def _get_quality_level(self, score: float) -> str:
        """获取质量等级"""
        if score >= 95:
            return "优秀"
        elif score >= 85:
            return "良好"
        elif score >= 70:
            return "一般"
        elif score >= 60:
            return "及格"
        else:
            return "不及格"

    def _generate_recommendations(self, alerts: List[QualityAlert], metrics: List[QualityMetric]) -> List[str]:
        """生成改进建议"""
        recommendations = []

        # 根据报警生成建议
        for alert in alerts:
            if alert.alert_level in [AlertLevel.CRITICAL, AlertLevel.ERROR]:
                recommendations.append(f"紧急: {alert.suggested_action}")
            elif alert.alert_level == AlertLevel.WARNING:
                recommendations.append(f"建议: {alert.suggested_action}")

        # 根据低分指标生成建议
        low_score_metrics = [m for m in metrics if m.value < m.threshold * 0.8]  # 低于阈值80%
        for metric in low_score_metrics:
            if metric.name == "hot_stock_coverage":
                recommendations.append("热门股票数据不完整，建议优先采集热门股票数据")
            elif metric.name == "collection_delay":
                recommendations.append("数据采集延迟过长，建议检查采集任务调度")
            elif "coverage" in metric.name:
                recommendations.append(f"{metric.description}不足，建议扩大数据采集范围")

        # 去重
        return list(set(recommendations))

    async def run_scheduled_check(self):
        """运行定时检查"""
        logger.info("开始定时数据质量检查...")

        try:
            # 生成报告
            report = await self.generate_quality_report(days=7)

            # 记录报告到数据库
            await self._record_report_to_db(report)

            # 如果有严重报警，可以触发通知
            if report.get("alerts_summary", {}).get("critical_alerts", 0) > 0:
                logger.warning("发现严重数据质量问题，建议立即处理")

            logger.info("定时检查完成")

        except Exception as e:
            logger.error(f"定时检查失败: {e}")

    async def _record_report_to_db(self, report: Dict[str, Any]):
        """记录报告到数据库"""
        try:
            async with aiosqlite.connect(self.db_path) as db:
                # 这里可以添加报告存储逻辑
                # 例如：将报告保存为JSON文件或存储到数据库表
                pass

        except Exception as e:
            logger.error(f"记录报告到数据库失败: {e}")


# 测试函数
async def run_monitor_tests():
    """运行监控测试"""
    print("测试数据质量监控工具...")

    monitor = DataQualityMonitor()

    try:
        # 测试指标计算
        print("\n1. 测试指标计算:")
        metrics = await monitor.calculate_all_metrics(days=7)
        print(f"   计算完成 {len(metrics)} 个指标")

        for metric in metrics[:5]:  # 显示前5个指标
            status = "✓" if metric.is_healthy() else "✗"
            print(f"   {status} {metric.name}: {metric.value:.1f}{metric.unit} (阈值: {metric.threshold}{metric.unit})")

        # 测试报警检查
        print("\n2. 测试报警检查:")
        alerts = await monitor.check_and_alert(metrics)
        print(f"   发现 {len(alerts)} 个报警")

        for alert in alerts[:3]:  # 显示前3个报警
            print(f"   {alert.alert_level.value.upper()}: {alert.message}")

        # 测试报告生成
        print("\n3. 测试报告生成:")
        report = await monitor.generate_quality_report(days=7)
        print(f"   报告生成完成，总体评分: {report.get('overall_score', 0):.1f}分")
        print(f"   质量等级: {report.get('quality_level', '未知')}")
        print(f"   健康指标: {report.get('metrics_summary', {}).get('healthy_metrics', 0)}/{report.get('metrics_summary', {}).get('total_metrics', 0)}")

        print("\n所有测试完成!")

    except Exception as e:
        print(f"测试失败: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_monitor_tests())
