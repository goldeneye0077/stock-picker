#!/usr/bin/env python3
"""
错误重试工具模块
为数据采集提供带重试机制的通用函数
"""

import asyncio
import time
from typing import Callable, Any
import logging

logger = logging.getLogger(__name__)


async def collect_with_retry(
    func: Callable,
    *args,
    max_retries: int = 3,
    retry_delay: float = 2.0,
    retry_on_exceptions: tuple = (Exception,),
    **kwargs
) -> Any:
    """
    带重试的数据采集函数

    Args:
        func: 要执行的异步函数
        *args: 函数参数
        max_retries: 最大重试次数
        retry_delay: 重试延迟（秒）
        retry_on_exceptions: 需要重试的异常类型
        **kwargs: 函数关键字参数

    Returns:
        函数执行结果

    Raises:
        Exception: 达到最大重试次数后仍失败
    """
    last_exception = None

    for attempt in range(max_retries):
        try:
            result = await func(*args, **kwargs)
            if attempt > 0:
                logger.info(f"采集成功 (第{attempt+1}次尝试)")
            return result

        except retry_on_exceptions as e:
            last_exception = e

            if attempt == max_retries - 1:
                logger.error(f"采集失败，已达最大重试次数({max_retries}次): {e}")
                raise

            logger.warning(f"第{attempt+1}次采集失败，{retry_delay}秒后重试: {e}")
            await asyncio.sleep(retry_delay)

        except Exception as e:
            # 非重试异常直接抛出
            logger.error(f"采集遇到非重试异常: {e}")
            raise

    # 理论上不会执行到这里
    raise last_exception


def sync_collect_with_retry(
    func: Callable,
    *args,
    max_retries: int = 3,
    retry_delay: float = 2.0,
    retry_on_exceptions: tuple = (Exception,),
    **kwargs
) -> Any:
    """
    同步版本的带重试数据采集函数

    Args:
        func: 要执行的同步函数
        *args: 函数参数
        max_retries: 最大重试次数
        retry_delay: 重试延迟（秒）
        retry_on_exceptions: 需要重试的异常类型
        **kwargs: 函数关键字参数

    Returns:
        函数执行结果
    """
    last_exception = None

    for attempt in range(max_retries):
        try:
            result = func(*args, **kwargs)
            if attempt > 0:
                logger.info(f"采集成功 (第{attempt+1}次尝试)")
            return result

        except retry_on_exceptions as e:
            last_exception = e

            if attempt == max_retries - 1:
                logger.error(f"采集失败，已达最大重试次数({max_retries}次): {e}")
                raise

            logger.warning(f"第{attempt+1}次采集失败，{retry_delay}秒后重试: {e}")
            time.sleep(retry_delay)

        except Exception as e:
            # 非重试异常直接抛出
            logger.error(f"采集遇到非重试异常: {e}")
            raise

    # 理论上不会执行到这里
    raise last_exception


class RetryConfig:
    """重试配置类"""

    def __init__(
        self,
        max_retries: int = 3,
        retry_delay: float = 2.0,
        exponential_backoff: bool = True,
        max_delay: float = 30.0,
        retry_on_exceptions: tuple = (Exception,)
    ):
        """
        初始化重试配置

        Args:
            max_retries: 最大重试次数
            retry_delay: 基础重试延迟（秒）
            exponential_backoff: 是否使用指数退避
            max_delay: 最大延迟时间（秒）
            retry_on_exceptions: 需要重试的异常类型
        """
        self.max_retries = max_retries
        self.base_delay = retry_delay
        self.exponential_backoff = exponential_backoff
        self.max_delay = max_delay
        self.retry_on_exceptions = retry_on_exceptions

    def get_delay(self, attempt: int) -> float:
        """获取第attempt次重试的延迟时间"""
        if not self.exponential_backoff:
            return self.base_delay

        delay = self.base_delay * (2 ** attempt)
        return min(delay, self.max_delay)


class RetryCollector:
    """带重试机制的数据采集器"""

    def __init__(self, config: RetryConfig = None):
        self.config = config or RetryConfig()

    async def collect_async(self, func: Callable, *args, **kwargs) -> Any:
        """异步采集"""
        last_exception = None

        for attempt in range(self.config.max_retries):
            try:
                result = await func(*args, **kwargs)
                if attempt > 0:
                    logger.info(f"采集成功 (第{attempt+1}次尝试)")
                return result

            except self.config.retry_on_exceptions as e:
                last_exception = e

                if attempt == self.config.max_retries - 1:
                    logger.error(f"采集失败，已达最大重试次数({self.config.max_retries}次): {e}")
                    raise

                delay = self.config.get_delay(attempt)
                logger.warning(f"第{attempt+1}次采集失败，{delay:.1f}秒后重试: {e}")
                await asyncio.sleep(delay)

            except Exception as e:
                logger.error(f"采集遇到非重试异常: {e}")
                raise

        raise last_exception

    def collect_sync(self, func: Callable, *args, **kwargs) -> Any:
        """同步采集"""
        last_exception = None

        for attempt in range(self.config.max_retries):
            try:
                result = func(*args, **kwargs)
                if attempt > 0:
                    logger.info(f"采集成功 (第{attempt+1}次尝试)")
                return result

            except self.config.retry_on_exceptions as e:
                last_exception = e

                if attempt == self.config.max_retries - 1:
                    logger.error(f"采集失败，已达最大重试次数({self.config.max_retries}次): {e}")
                    raise

                delay = self.config.get_delay(attempt)
                logger.warning(f"第{attempt+1}次采集失败，{delay:.1f}秒后重试: {e}")
                time.sleep(delay)

            except Exception as e:
                logger.error(f"采集遇到非重试异常: {e}")
                raise

        raise last_exception


# 默认的重试采集器实例
default_retry_collector = RetryCollector()


async def default_collect_with_retry(func: Callable, *args, **kwargs) -> Any:
    """使用默认配置的异步重试采集"""
    return await default_retry_collector.collect_async(func, *args, **kwargs)


def default_sync_collect_with_retry(func: Callable, *args, **kwargs) -> Any:
    """使用默认配置的同步重试采集"""
    return default_retry_collector.collect_sync(func, *args, **kwargs)


# 测试函数
async def test_async_function(success_on_attempt: int = 1) -> str:
    """测试异步函数，模拟失败和成功"""
    test_async_function.attempt = getattr(test_async_function, 'attempt', 0) + 1

    if test_async_function.attempt < success_on_attempt:
        raise Exception(f"模拟失败 (第{test_async_function.attempt}次尝试)")

    return f"成功 (第{test_async_function.attempt}次尝试)"


def test_sync_function(success_on_attempt: int = 1) -> str:
    """测试同步函数，模拟失败和成功"""
    test_sync_function.attempt = getattr(test_sync_function, 'attempt', 0) + 1

    if test_sync_function.attempt < success_on_attempt:
        raise Exception(f"模拟失败 (第{test_sync_function.attempt}次尝试)")

    return f"成功 (第{test_sync_function.attempt}次尝试)"


async def run_tests():
    """运行测试"""
    print("Testing retry utilities module...")

    try:
        # 测试异步重试
        test_async_function.attempt = 0
        result = await collect_with_retry(test_async_function, success_on_attempt=3)
        print(f"Async retry test: {result}")

        # 测试同步重试
        test_sync_function.attempt = 0
        result = sync_collect_with_retry(test_sync_function, success_on_attempt=2)
        print(f"Sync retry test: {result}")

        # 测试RetryCollector类
        collector = RetryCollector(RetryConfig(max_retries=4, retry_delay=1.0))
        test_async_function.attempt = 0
        result = await collector.collect_async(test_async_function, success_on_attempt=4)
        print(f"RetryCollector test: {result}")

        print("All tests passed!")

    except Exception as e:
        print(f"Test failed: {e}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(run_tests())