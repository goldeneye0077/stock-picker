#!/usr/bin/env python3
"""
检查数据库数据质量
"""

import sqlite3
import pandas as pd
from datetime import datetime, timedelta
import sys
from pathlib import Path

def check_database_stats():
    """检查数据库统计信息"""
    print("=== 数据库数据质量检查 ===\n")

    db_path = "data/stock_picker.db"
    conn = sqlite3.connect(db_path)

    try:
        cursor = conn.cursor()

        # 1. 检查各表数据量
        print("1. 各表数据量统计:")
        print("-" * 40)

        tables = ['stocks', 'klines', 'fund_flow', 'daily_basic', 'volume_analysis']

        for table in tables:
            cursor.execute(f"SELECT COUNT(*) FROM {table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count:,} 条记录")

        print()

        # 2. 检查数据时间范围
        print("2. 数据时间范围:")
        print("-" * 40)

        # K线数据时间范围
        cursor.execute("SELECT MIN(date), MAX(date) FROM klines")
        min_date, max_date = cursor.fetchone()
        print(f"  K线数据: {min_date} 至 {max_date}")

        # 资金流向数据时间范围
        cursor.execute("SELECT MIN(date), MAX(date) FROM fund_flow")
        min_date, max_date = cursor.fetchone()
        print(f"  资金流向: {min_date} 至 {max_date}")

        print()

        # 3. 检查热门板块股票数据
        print("3. 热门板块股票数据检查:")
        print("-" * 40)

        hot_stocks = [
            ("300474", "景嘉微"),
            ("002371", "北方华创"),
            ("002049", "紫光国微"),
            ("300750", "宁德时代"),
            ("600519", "贵州茅台"),
            ("600118", "中国卫星"),
            ("600879", "航天电子"),
            ("000901", "航天科技"),
            ("300502", "新易盛"),
            ("300394", "天孚通信"),
            ("300308", "中际旭创"),
            ("000858", "五粮液"),
            ("002415", "海康威视"),
            ("000001", "平安银行"),
        ]

        for stock_code, stock_name in hot_stocks:
            # 检查K线数据
            cursor.execute("""
                SELECT COUNT(*) FROM klines
                WHERE stock_code = ? AND date >= date('now', '-10 days')
            """, (stock_code,))
            kline_count = cursor.fetchone()[0]

            # 检查资金流向数据
            cursor.execute("""
                SELECT COUNT(*) FROM fund_flow
                WHERE stock_code = ? AND date >= date('now', '-10 days')
            """, (stock_code,))
            flow_count = cursor.fetchone()[0]

            # 检查基本面数据
            cursor.execute("""
                SELECT COUNT(*) FROM daily_basic
                WHERE stock_code = ?
            """, (stock_code,))
            basic_count = cursor.fetchone()[0]

            status = []
            if kline_count > 0:
                status.append(f"K线({kline_count})")
            if flow_count > 0:
                status.append(f"资金({flow_count})")
            if basic_count > 0:
                status.append(f"基本面({basic_count})")

            if status:
                print(f"  {stock_name}({stock_code}): {', '.join(status)}")
            else:
                print(f"  {stock_name}({stock_code}): 无数据")

        print()

        # 4. 检查数据完整性
        print("4. 数据完整性检查:")
        print("-" * 40)

        # 检查有K线数据但无资金流向数据的股票
        cursor.execute("""
            SELECT COUNT(DISTINCT k.stock_code)
            FROM klines k
            LEFT JOIN fund_flow f ON k.stock_code = f.stock_code AND k.date = f.date
            WHERE k.date >= date('now', '-7 days')
            AND f.stock_code IS NULL
        """)
        missing_flow = cursor.fetchone()[0]
        print(f"  有K线但无资金流向的股票: {missing_flow} 只")

        # 检查有资金流向但无K线数据的股票
        cursor.execute("""
            SELECT COUNT(DISTINCT f.stock_code)
            FROM fund_flow f
            LEFT JOIN klines k ON f.stock_code = k.stock_code AND f.date = k.date
            WHERE f.date >= date('now', '-7 days')
            AND k.stock_code IS NULL
        """)
        missing_kline = cursor.fetchone()[0]
        print(f"  有资金流向但无K线的股票: {missing_kline} 只")

        print()

        # 5. 检查数据重复性
        print("5. 数据重复性检查:")
        print("-" * 40)

        # 检查K线数据重复
        cursor.execute("""
            SELECT stock_code, date, COUNT(*) as cnt
            FROM klines
            WHERE date >= date('now', '-7 days')
            GROUP BY stock_code, date
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT 5
        """)
        duplicate_klines = cursor.fetchall()

        if duplicate_klines:
            print(f"  K线数据重复记录: {len(duplicate_klines)} 条")
            for stock_code, date, cnt in duplicate_klines:
                print(f"    {stock_code} {date}: {cnt} 次")
        else:
            print("  K线数据: 无重复记录")

        # 检查资金流向数据重复
        cursor.execute("""
            SELECT stock_code, date, COUNT(*) as cnt
            FROM fund_flow
            WHERE date >= date('now', '-7 days')
            GROUP BY stock_code, date
            HAVING cnt > 1
            ORDER BY cnt DESC
            LIMIT 5
        """)
        duplicate_flows = cursor.fetchall()

        if duplicate_flows:
            print(f"  资金流向重复记录: {len(duplicate_flows)} 条")
            for stock_code, date, cnt in duplicate_flows:
                print(f"    {stock_code} {date}: {cnt} 次")
        else:
            print("  资金流向数据: 无重复记录")

        print()

        # 6. 检查数据采集覆盖率
        print("6. 数据采集覆盖率:")
        print("-" * 40)

        # 获取股票总数
        cursor.execute("SELECT COUNT(*) FROM stocks")
        total_stocks = cursor.fetchone()[0]

        # 获取最近7天有数据的股票数
        cursor.execute("""
            SELECT COUNT(DISTINCT stock_code)
            FROM klines
            WHERE date >= date('now', '-7 days')
        """)
        stocks_with_klines = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(DISTINCT stock_code)
            FROM fund_flow
            WHERE date >= date('now', '-7 days')
        """)
        stocks_with_flow = cursor.fetchone()[0]

        print(f"  股票总数: {total_stocks} 只")
        print(f"  有K线数据的股票: {stocks_with_klines} 只 ({stocks_with_klines/total_stocks*100:.1f}%)")
        print(f"  有资金流向的股票: {stocks_with_flow} 只 ({stocks_with_flow/total_stocks*100:.1f}%)")

        # 计算同时有K线和资金流向的股票
        cursor.execute("""
            SELECT COUNT(DISTINCT k.stock_code)
            FROM klines k
            JOIN fund_flow f ON k.stock_code = f.stock_code AND k.date = f.date
            WHERE k.date >= date('now', '-7 days')
        """)
        stocks_with_both = cursor.fetchone()[0]
        print(f"  同时有K线和资金流向的股票: {stocks_with_both} 只 ({stocks_with_both/total_stocks*100:.1f}%)")

        print()

        # 7. 数据质量评分
        print("7. 数据质量评分:")
        print("-" * 40)

        quality_score = 0
        max_score = 100

        # 覆盖率评分 (40分)
        coverage_ratio = stocks_with_both / total_stocks
        coverage_score = min(40, coverage_ratio * 40)
        quality_score += coverage_score
        print(f"  覆盖率评分: {coverage_score:.1f}/40 ({coverage_ratio*100:.1f}%)")

        # 完整性评分 (30分)
        completeness_ratio = 1 - (missing_flow + missing_kline) / (stocks_with_klines + stocks_with_flow)
        completeness_score = min(30, completeness_ratio * 30)
        quality_score += completeness_score
        print(f"  完整性评分: {completeness_score:.1f}/30 ({completeness_ratio*100:.1f}%)")

        # 重复性评分 (20分)
        duplicate_penalty = (len(duplicate_klines) + len(duplicate_flows)) * 0.5
        duplicate_score = max(0, 20 - duplicate_penalty)
        quality_score += duplicate_score
        print(f"  重复性评分: {duplicate_score:.1f}/20")

        # 热门股票覆盖评分 (10分)
        hot_stocks_covered = sum(1 for _, _ in hot_stocks if any([
            kline_count > 0 for stock_code, stock_name in hot_stocks
        ]))
        hot_stocks_ratio = hot_stocks_covered / len(hot_stocks)
        hot_stocks_score = hot_stocks_ratio * 10
        quality_score += hot_stocks_score
        print(f"  热门股票评分: {hot_stocks_score:.1f}/10 ({hot_stocks_ratio*100:.1f}%)")

        print(f"\n  数据质量总分: {quality_score:.1f}/100")

        if quality_score >= 80:
            print("  评级: 优秀")
        elif quality_score >= 60:
            print("  评级: 良好")
        elif quality_score >= 40:
            print("  评级: 一般")
        else:
            print("  评级: 较差")

        print()

        # 8. 优化建议
        print("8. 优化建议:")
        print("-" * 40)

        if coverage_ratio < 0.8:
            print(f"  - 提高数据覆盖率: 当前仅 {coverage_ratio*100:.1f}% 的股票有完整数据")
            print("  - 建议: 检查数据采集脚本，确保覆盖所有股票")

        if completeness_ratio < 0.9:
            print(f"  - 提高数据完整性: {missing_flow} 只有K线无资金流向，{missing_kline} 只有资金流向无K线")
            print("  - 建议: 修复数据采集逻辑，确保K线和资金流向数据同步")

        if duplicate_penalty > 5:
            print(f"  - 减少数据重复: 发现 {len(duplicate_klines)} 条K线重复，{len(duplicate_flows)} 条资金流向重复")
            print("  - 建议: 使用 INSERT OR REPLACE 或检查数据采集逻辑")

        if hot_stocks_ratio < 1.0:
            print(f"  - 热门股票覆盖不足: 仅 {hot_stocks_ratio*100:.1f}% 的热门股票有数据")
            print("  - 建议: 确保热门板块股票在数据采集脚本中被优先处理")

        if quality_score < 60:
            print("  - 整体数据质量需要提升")
            print("  - 建议: 重新运行完整的数据采集流程")

    except Exception as e:
        print(f"检查数据质量时出错: {e}")
        import traceback
        traceback.print_exc()

    finally:
        conn.close()

def analyze_data_collection_performance():
    """分析数据采集性能"""
    print("\n=== 数据采集性能分析 ===\n")

    # 这里可以添加对数据采集脚本的性能分析
    # 例如：API调用次数、采集时间、成功率等

    print("数据采集脚本性能指标:")
    print("-" * 40)

    # 从之前的运行日志中提取信息
    print("  - 批量采集: 7天数据，约15次API调用")
    print("  - 单日K线数据: 约5,400条/天")
    print("  - 单日资金流向: 约5,150条/天")
    print("  - 热门股票补充: 14只股票")
    print("  - 预计总耗时: 2-3分钟")

    print("\n优化建议:")
    print("-" * 40)
    print("  1. 增加错误重试机制")
    print("  2. 实现增量更新，避免重复采集")
    print("  3. 添加数据验证步骤")
    print("  4. 优化热门股票采集逻辑")
    print("  5. 添加数据质量监控")

def main():
    """主函数"""
    try:
        check_database_stats()
        analyze_data_collection_performance()

        print("\n=== 总结 ===")
        print("数据质量检查完成，请根据建议优化数据采集流程。")

    except Exception as e:
        print(f"执行失败: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()