"""
一键数据更新脚本
包含数据采集和分析的完整流程
"""
import subprocess
import sys
from loguru import logger

logger.info("=" * 60)
logger.info("开始数据更新流程")
logger.info("=" * 60)

# 步骤1：采集数据
logger.info("\n[步骤 1/2] 批量采集最近7天数据...")
result = subprocess.run([sys.executable, "download_7days_all_stocks.py"], cwd=".")
if result.returncode != 0:
    logger.error("数据采集失败，退出")
    sys.exit(1)

logger.info("✓ 数据采集完成")

# 步骤2：分析数据
logger.info("\n[步骤 2/3] 批量分析成交量数据...")
result = subprocess.run([sys.executable, "analyze_all_stocks.py"], cwd=".")
if result.returncode != 0:
    logger.error("数据分析失败，退出")
    sys.exit(1)

logger.info("✓ 数据分析完成")

# 步骤3：生成买入信号
logger.info("\n[步骤 3/3] 生成买入信号...")
result = subprocess.run([sys.executable, "generate_buy_signals.py"], cwd=".")
if result.returncode != 0:
    logger.error("信号生成失败，退出")
    sys.exit(1)

logger.info("✓ 信号生成完成")

logger.info("\n" + "=" * 60)
logger.info("数据更新流程全部完成！")
logger.info("=" * 60)
logger.info("提示：现在可以刷新前端页面查看最新数据")
