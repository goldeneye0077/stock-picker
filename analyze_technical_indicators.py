#!/usr/bin/env python3
"""
技术指标批量分析脚本
从根目录运行，批量计算所有股票的技术指标
"""

import asyncio
import sys
import os
from pathlib import Path

# 添加data-service到Python路径
current_dir = Path(__file__).parent
data_service_dir = current_dir / "data-service"
sys.path.insert(0, str(data_service_dir))

from src.scripts.batch_technical_analysis import BatchTechnicalAnalyzer


async def main():
    """主函数"""
    print("=" * 60)
    print("技术指标批量分析工具")
    print("=" * 60)
    print()

    # 创建分析器
    analyzer = BatchTechnicalAnalyzer(batch_size=5)

    # 获取所有股票
    print("正在获取股票列表...")
    stocks = await analyzer.get_all_stocks()

    if not stocks:
        print("错误: 未找到股票数据，请先运行数据采集脚本")
        return

    print(f"找到 {len(stocks)} 只股票")
    print()

    # 确认是否继续
    confirm = input("是否开始批量技术分析？(y/n): ")
    if confirm.lower() != 'y':
        print("已取消")
        return

    print()
    print("开始批量技术分析...")
    print("-" * 60)

    # 批量分析
    results = await analyzer.analyze_batch(stocks)

    # 生成报告
    report = await analyzer.generate_summary_report(results)

    # 保存报告
    from datetime import datetime
    report_file = f"technical_analysis_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
    with open(report_file, 'w', encoding='utf-8') as f:
        f.write(report)

    print()
    print("=" * 60)
    print("分析完成！")
    print(f"报告已保存到: {report_file}")
    print("=" * 60)
    print()
    print(report)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n用户中断，程序退出")
    except Exception as e:
        print(f"\n\n程序运行出错: {e}")
        import traceback
        traceback.print_exc()