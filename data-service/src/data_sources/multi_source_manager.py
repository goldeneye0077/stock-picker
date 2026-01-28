#!/usr/bin/env python3
"""
多数据源管理器
管理多个数据源，实现故障切换和数据一致性验证
"""

import asyncio
import time
from typing import Optional, List, Dict, Any, Callable
import pandas as pd
from loguru import logger
from datetime import datetime, timedelta
import numpy as np

from .base import DataSource, DataSourceError


class DataSourceHealth:
    """数据源健康状态"""

    def __init__(self, source_name: str):
        self.source_name = source_name
        self.status = "unknown"  # healthy, degraded, unavailable
        self.success_rate = 0.0
        self.avg_latency = 0.0
        self.last_check_time = None
        self.error_message = ""
        self.data_freshness = 0.0  # 数据新鲜度
        self.total_requests = 0
        self.successful_requests = 0
        self.failed_requests = 0
        self.no_data_requests = 0

    def update(self, success: bool, latency: float = 0.0, error_msg: str = "", result_type: str | None = None):
        """更新健康状态"""
        self.total_requests += 1
        if result_type is None:
            result_type = "success" if success else "error"

        if result_type == "success":
            self.successful_requests += 1
        elif result_type == "no_data":
            self.no_data_requests += 1
        else:
            self.failed_requests += 1

        # 计算成功率
        effective_total = self.successful_requests + self.failed_requests
        if effective_total > 0:
            self.success_rate = self.successful_requests / effective_total
        else:
            self.success_rate = 0.0

        # 更新平均延迟（指数移动平均）
        if latency > 0:
            if self.avg_latency == 0:
                self.avg_latency = latency
            else:
                self.avg_latency = 0.7 * self.avg_latency + 0.3 * latency

        if error_msg:
            self.error_message = error_msg

        self.last_check_time = datetime.now()

        # 更新状态
        if effective_total == 0:
            self.status = "degraded" if self.no_data_requests > 0 else "unknown"
            return

        if self.success_rate >= 0.95:
            self.status = "healthy"
        elif self.success_rate >= 0.80:
            self.status = "degraded"
        else:
            self.status = "unavailable"

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "source_name": self.source_name,
            "status": self.status,
            "success_rate": round(self.success_rate, 4),
            "avg_latency": round(self.avg_latency, 4),
            "last_check_time": self.last_check_time.isoformat() if self.last_check_time else None,
            "error_message": self.error_message,
            "data_freshness": round(self.data_freshness, 4),
            "total_requests": self.total_requests,
            "successful_requests": self.successful_requests,
            "failed_requests": self.failed_requests,
            "no_data_requests": self.no_data_requests
        }


class MultiSourceManager:
    """多数据源管理器"""

    def __init__(self):
        self.sources: Dict[str, DataSource] = {}
        self.health_status: Dict[str, DataSourceHealth] = {}
        self.preferred_source: Optional[str] = None
        self.fallback_order: List[str] = []
        self.cache: Dict[str, Any] = {}
        self.cache_ttl = 300  # 缓存有效期（秒）

    def register_source(self, source: DataSource):
        """注册数据源"""
        name = source.get_source_name()
        self.sources[name] = source
        self.health_status[name] = DataSourceHealth(name)
        logger.info(f"注册数据源: {name}")

    def unregister_source(self, source_name: str):
        """注销数据源"""
        if source_name in self.sources:
            del self.sources[source_name]
            del self.health_status[source_name]
            logger.info(f"注销数据源: {source_name}")

    def set_preferred_source(self, source_name: str):
        """设置首选数据源"""
        if source_name in self.sources:
            self.preferred_source = source_name
            logger.info(f"设置首选数据源: {source_name}")
        else:
            logger.warning(f"数据源不存在: {source_name}")

    def set_fallback_order(self, order: List[str]):
        """设置备用数据源顺序"""
        # 验证所有数据源都存在
        valid_order = []
        for name in order:
            if name in self.sources:
                valid_order.append(name)
            else:
                logger.warning(f"备用数据源不存在: {name}")

        self.fallback_order = valid_order
        logger.info(f"设置备用顺序: {valid_order}")

    async def get_with_fallback(self, method_name: str, *args, **kwargs) -> Optional[Any]:
        """
        带故障切换的数据获取

        Args:
            method_name: 方法名，如 'get_daily_data'
            *args, **kwargs: 方法参数

        Returns:
            数据或None（所有数据源都失败）
        """
        # 生成缓存键
        cache_key = self._generate_cache_key(method_name, *args, **kwargs)

        # 检查缓存
        cached_result = self._get_from_cache(cache_key)
        if cached_result is not None:
            logger.debug(f"使用缓存数据: {cache_key}")
            return cached_result

        # 1. 尝试首选数据源
        if self.preferred_source and self.preferred_source in self.sources:
            source = self.sources[self.preferred_source]
            result = await self._try_source(source, method_name, *args, **kwargs)
            if result is not None:
                self._save_to_cache(cache_key, result)
                return result

        # 2. 按备用顺序尝试
        for source_name in self.fallback_order:
            if source_name in self.sources:
                source = self.sources[source_name]
                result = await self._try_source(source, method_name, *args, **kwargs)
                if result is not None:
                    self._save_to_cache(cache_key, result)
                    return result

        # 3. 尝试所有数据源（按健康状态排序）
        healthy_sources = self._get_healthy_sources()
        for source_name in healthy_sources:
            if source_name != self.preferred_source and source_name not in self.fallback_order:
                source = self.sources[source_name]
                result = await self._try_source(source, method_name, *args, **kwargs)
                if result is not None:
                    self._save_to_cache(cache_key, result)
                    return result

        logger.error(f"所有数据源都失败: {method_name}")
        return None

    async def _try_source(self, source: DataSource, method_name: str, *args, **kwargs) -> Optional[Any]:
        """尝试从单个数据源获取数据"""
        start_time = time.time()
        health = self.health_status[source.get_source_name()]

        try:
            # 检查数据源是否可用
            if not source.is_available():
                health.update(success=False, error_msg="数据源不可用")
                return None

            # 获取方法
            method = getattr(source, method_name)
            if not callable(method):
                health.update(success=False, error_msg=f"方法不可调用: {method_name}")
                return None

            # 执行方法
            result = await method(*args, **kwargs)

            latency = time.time() - start_time

            if result is not None:
                # 检查结果是否有效
                if isinstance(result, pd.DataFrame):
                    if result.empty:
                        health.update(success=True, latency=latency, error_msg="返回空DataFrame", result_type="no_data")
                        return None
                elif isinstance(result, (list, dict)):
                    if not result:
                        health.update(success=True, latency=latency, error_msg="返回空数据", result_type="no_data")
                        return None

                # 更新健康状态
                health.update(success=True, latency=latency)
                logger.debug(f"数据源 {source.get_source_name()} 成功: {method_name}, 耗时: {latency:.2f}s")
                return result
            else:
                health.update(success=True, latency=latency, error_msg="返回None", result_type="no_data")
                logger.warning(f"数据源 {source.get_source_name()} 返回空数据: {method_name}")
                return None

        except DataSourceError as e:
            latency = time.time() - start_time
            health.update(success=False, latency=latency, error_msg=str(e))
            logger.warning(f"数据源 {source.get_source_name()} 数据源错误: {e}")
            return None

        except Exception as e:
            latency = time.time() - start_time
            health.update(success=False, latency=latency, error_msg=str(e))
            logger.error(f"数据源 {source.get_source_name()} 异常: {e}")
            return None

    def _get_healthy_sources(self) -> List[str]:
        """获取健康的数据源列表（按健康状态排序）"""
        healthy_sources = []

        for name, health in self.health_status.items():
            if health.status == "healthy":
                healthy_sources.append((name, health.success_rate))
            elif health.status == "degraded":
                healthy_sources.append((name, health.success_rate - 0.5))  # 降低优先级

        # 按成功率排序
        healthy_sources.sort(key=lambda x: x[1], reverse=True)
        return [name for name, _ in healthy_sources]

    def _generate_cache_key(self, method_name: str, *args, **kwargs) -> str:
        """生成缓存键"""
        # 简单实现：使用方法和参数的字符串表示
        key_parts = [method_name]

        # 添加位置参数
        for arg in args:
            if isinstance(arg, (str, int, float, bool)):
                key_parts.append(str(arg))
            elif isinstance(arg, (list, tuple)):
                key_parts.append(",".join(str(x) for x in arg))

        # 添加关键字参数
        for key, value in sorted(kwargs.items()):
            if isinstance(value, (str, int, float, bool)):
                key_parts.append(f"{key}:{value}")

        return "|".join(key_parts)

    def _get_from_cache(self, cache_key: str) -> Optional[Any]:
        """从缓存获取数据"""
        if cache_key in self.cache:
            cached_data = self.cache[cache_key]
            if time.time() - cached_data["timestamp"] < self.cache_ttl:
                return cached_data["data"]
            else:
                # 缓存过期
                del self.cache[cache_key]

        return None

    def _save_to_cache(self, cache_key: str, data: Any):
        """保存数据到缓存"""
        self.cache[cache_key] = {
            "data": data,
            "timestamp": time.time()
        }

        # 限制缓存大小
        if len(self.cache) > 1000:
            # 删除最旧的缓存项
            oldest_key = min(self.cache.keys(), key=lambda k: self.cache[k]["timestamp"])
            del self.cache[oldest_key]

    async def run_health_check(self, timeout_sec: float = 8.0):
        """运行健康检查"""
        logger.info("开始数据源健康检查...")

        for name, source in self.sources.items():
            health = self.health_status[name]

            try:
                # 测试基本功能
                start_time = time.time()

                # 测试股票列表获取
                test_result = await asyncio.wait_for(source.get_stock_basic(), timeout=timeout_sec)
                latency = time.time() - start_time

                if test_result is not None and not test_result.empty:
                    health.update(success=True, latency=latency)
                    health.data_freshness = 1.0  # 假设数据新鲜
                    logger.info(f"数据源 {name} 健康检查通过: 获取到 {len(test_result)} 只股票")
                else:
                    health.update(success=True, latency=latency, error_msg="测试返回空数据", result_type="no_data")
                    logger.warning(f"数据源 {name} 健康检查失败: 返回空数据")

            except asyncio.TimeoutError:
                health.update(success=False, error_msg="健康检查超时")
                logger.warning(f"数据源 {name} 健康检查超时")

            except Exception as e:
                health.update(success=False, error_msg=str(e))
                logger.error(f"数据源 {name} 健康检查异常: {e}")

        logger.info("健康检查完成")

    def get_status_report(self) -> Dict[str, Any]:
        """获取状态报告"""
        report = {
            "preferred_source": self.preferred_source,
            "fallback_order": self.fallback_order,
            "total_sources": len(self.sources),
            "cache_size": len(self.cache),
            "cache_ttl": self.cache_ttl,
            "sources": {}
        }

        for name, source in self.sources.items():
            health = self.health_status[name]
            report["sources"][name] = {
                "available": source.is_available(),
                "health": health.to_dict(),
                "source_info": source.get_health_status()
            }

        return report

    def clear_cache(self):
        """清空缓存"""
        self.cache.clear()
        logger.info("缓存已清空")

    def set_cache_ttl(self, ttl_seconds: int):
        """设置缓存有效期"""
        self.cache_ttl = ttl_seconds
        logger.info(f"设置缓存有效期: {ttl_seconds}秒")


class DataConsistencyValidator:
    """数据一致性验证器"""

    def __init__(self, tolerance: float = 0.01):
        self.tolerance = tolerance  # 允许的误差范围

    async def validate_consistency(self, data1: pd.DataFrame, data2: pd.DataFrame,
                                  data_type: str) -> Dict[str, Any]:
        """
        验证两个数据源的数据一致性

        Args:
            data1: 数据源1的数据
            data2: 数据源2的数据
            data_type: 数据类型，如 'daily', 'moneyflow'

        Returns:
            一致性验证结果
        """
        if data1 is None or data2 is None:
            return {
                "consistent": False,
                "reason": "其中一个数据源返回空数据",
                "match_rate": 0.0,
                "data1_count": 0,
                "data2_count": 0
            }

        # 1. 检查数据形状
        data1_count = len(data1)
        data2_count = len(data2)

        if data1_count == 0 or data2_count == 0:
            return {
                "consistent": False,
                "reason": "其中一个数据源返回空DataFrame",
                "match_rate": 0.0,
                "data1_count": data1_count,
                "data2_count": data2_count
            }

        # 2. 找到共同的数据（基于ts_code和trade_date）
        common_data = []
        data1_dict = {}
        data2_dict = {}

        # 构建数据1的字典
        for _, row in data1.iterrows():
            key = f"{row.get('ts_code', '')}_{row.get('trade_date', '')}"
            data1_dict[key] = row

        # 构建数据2的字典
        for _, row in data2.iterrows():
            key = f"{row.get('ts_code', '')}_{row.get('trade_date', '')}"
            data2_dict[key] = row

        # 找到共同键
        common_keys = set(data1_dict.keys()) & set(data2_dict.keys())

        if not common_keys:
            return {
                "consistent": False,
                "reason": "没有共同的数据记录",
                "match_rate": 0.0,
                "data1_count": data1_count,
                "data2_count": data2_count,
                "common_count": 0
            }

        # 3. 数值一致性检查
        numeric_columns = []
        for col in data1.columns:
            if pd.api.types.is_numeric_dtype(data1[col]):
                numeric_columns.append(col)

        match_results = []
        for col in numeric_columns:
            if col in data2.columns:
                col_values1 = []
                col_values2 = []

                for key in common_keys:
                    val1 = data1_dict[key].get(col)
                    val2 = data2_dict[key].get(col)

                    if pd.notna(val1) and pd.notna(val2):
                        col_values1.append(float(val1))
                        col_values2.append(float(val2))

                if col_values1 and col_values2:
                    # 计算相对误差
                    col_values1 = np.array(col_values1)
                    col_values2 = np.array(col_values2)

                    diff = np.abs(col_values1 - col_values2)
                    rel_error = diff / (np.abs(col_values1) + 1e-10)  # 避免除零

                    match_rate = np.mean(rel_error <= self.tolerance)
                    avg_error = np.mean(rel_error)

                    match_results.append({
                        "column": col,
                        "match_rate": float(match_rate),
                        "avg_error": float(avg_error),
                        "sample_count": len(col_values1)
                    })

        # 4. 计算总体匹配率
        if match_results:
            overall_match_rate = np.mean([r["match_rate"] for r in match_results])
            sample_sizes = [r["sample_count"] for r in match_results]
            avg_sample_size = np.mean(sample_sizes) if sample_sizes else 0
        else:
            overall_match_rate = 0.0
            avg_sample_size = 0

        return {
            "consistent": overall_match_rate >= 0.95,
            "match_rate": float(overall_match_rate),
            "column_results": match_results,
            "data1_count": data1_count,
            "data2_count": data2_count,
            "common_count": len(common_keys),
            "avg_sample_size": float(avg_sample_size),
            "timestamp": datetime.now().isoformat()
        }


class ConsistencyMonitor:
    """一致性监控器"""

    def __init__(self, multi_source_manager: MultiSourceManager):
        self.manager = multi_source_manager
        self.validator = DataConsistencyValidator()
        self.validation_results = []

    async def run_validation(self, test_date: str = None):
        """运行一致性验证"""
        logger.info("开始数据一致性验证...")

        if test_date is None:
            test_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

        sources = list(self.manager.sources.keys())
        if len(sources) < 2:
            logger.warning("至少需要2个数据源才能进行一致性验证")
            return

        self.validation_results = []

        # 对每对数据源进行验证
        for i in range(len(sources)):
            for j in range(i + 1, len(sources)):
                source1_name = sources[i]
                source2_name = sources[j]

                result = await self._validate_pair(source1_name, source2_name, test_date)
                self.validation_results.append(result)

                if result["consistent"]:
                    logger.info(f"{source1_name} vs {source2_name}: 一致 (匹配率: {result['match_rate']:.1%})")
                else:
                    logger.warning(f"{source1_name} vs {source2_name}: 不一致 (匹配率: {result['match_rate']:.1%})")

        logger.info(f"一致性验证完成，共验证 {len(self.validation_results)} 对数据源")

    async def _validate_pair(self, source1_name: str, source2_name: str, test_date: str):
        """验证一对数据源"""
        source1 = self.manager.sources[source1_name]
        source2 = self.manager.sources[source2_name]

        # 获取数据
        data1 = await source1.get_daily_data_by_date(test_date)
        data2 = await source2.get_daily_data_by_date(test_date)

        # 验证一致性
        result = await self.validator.validate_consistency(data1, data2, "daily")

        return {
            "source1": source1_name,
            "source2": source2_name,
            "test_date": test_date,
            **result
        }

    def get_validation_report(self) -> Dict[str, Any]:
        """获取验证报告"""
        if not self.validation_results:
            return {
                "total_validations": 0,
                "consistent_pairs": 0,
                "inconsistent_pairs": 0,
                "avg_match_rate": 0.0,
                "results": []
            }

        consistent_pairs = sum(1 for r in self.validation_results if r["consistent"])
        match_rates = [r["match_rate"] for r in self.validation_results]

        return {
            "total_validations": len(self.validation_results),
            "consistent_pairs": consistent_pairs,
            "inconsistent_pairs": len(self.validation_results) - consistent_pairs,
            "avg_match_rate": float(np.mean(match_rates)) if match_rates else 0.0,
            "min_match_rate": float(np.min(match_rates)) if match_rates else 0.0,
            "max_match_rate": float(np.max(match_rates)) if match_rates else 0.0,
            "results": self.validation_results,
            "timestamp": datetime.now().isoformat()
        }


# 测试函数
async def test_multi_source_manager():
    """测试多数据源管理器"""
    print("测试多数据源管理器...")

    # 创建管理器
    manager = MultiSourceManager()

    # 注册数据源（这里使用模拟数据源）
    from .tushare_client import TushareClient
    from .akshare_client import AKShareClient

    tushare_client = TushareClient()
    akshare_client = AKShareClient()

    manager.register_source(tushare_client)
    manager.register_source(akshare_client)

    # 设置首选和备用
    manager.set_preferred_source("tushare")
    manager.set_fallback_order(["akshare"])

    # 运行健康检查
    await manager.run_health_check()

    # 获取状态报告
    status_report = manager.get_status_report()
    print(f"\n状态报告:")
    print(f"  数据源数量: {status_report['total_sources']}")
    print(f"  首选数据源: {status_report['preferred_source']}")
    print(f"  备用顺序: {status_report['fallback_order']}")

    for name, source_info in status_report['sources'].items():
        print(f"\n  数据源 {name}:")
        print(f"    可用: {source_info['available']}")
        print(f"    状态: {source_info['health']['status']}")
        print(f"    成功率: {source_info['health']['success_rate']:.1%}")

    # 测试数据获取
    print("\n测试数据获取...")
    test_date = (datetime.now() - timedelta(days=1)).strftime('%Y%m%d')

    # 使用多数据源获取日线数据
    daily_data = await manager.get_with_fallback("get_daily_data_by_date", test_date)
    if daily_data is not None:
        print(f"  获取到 {len(daily_data)} 条日线数据")
    else:
        print("  获取失败")

    # 测试一致性验证
    print("\n测试一致性验证...")
    monitor = ConsistencyMonitor(manager)
    await monitor.run_validation(test_date)

    report = monitor.get_validation_report()
    print(f"  验证对数: {report['total_validations']}")
    print(f"  一致对数: {report['consistent_pairs']}")
    print(f"  平均匹配率: {report['avg_match_rate']:.1%}")

    print("\n测试完成!")


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_multi_source_manager())
