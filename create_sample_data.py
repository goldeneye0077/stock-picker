#!/usr/bin/env python3
"""
创建更多样本数据用于演示
"""
import sqlite3
import random
from datetime import datetime, timedelta

def create_sample_stocks():
    """创建一些知名股票的样本数据"""
    sample_stocks = [
        ('600036', '招商银行', 'SH', '银行'),
        ('600519', '贵州茅台', 'SH', '白酒'),
        ('000858', '五粮液', 'SZ', '白酒'),
        ('600276', '恒瑞医药', 'SH', '医药'),
        ('300059', '东方财富', 'SZ', '证券'),
        ('002415', '海康威视', 'SZ', '安防'),
        ('600887', '伊利股份', 'SH', '食品'),
        ('000001', '平安银行', 'SZ', '银行'),
        ('002230', '科大讯飞', 'SZ', '人工智能'),
        ('601318', '中国平安', 'SH', '保险'),
        ('000002', '万科A', 'SZ', '房地产'),
        ('002027', '分众传媒', 'SZ', '传媒'),
        ('300750', '宁德时代', 'SZ', '新能源'),
        ('600031', '三一重工', 'SH', '机械'),
        ('002594', '比亚迪', 'SZ', '汽车'),
        ('300142', '沃森生物', 'SZ', '疫苗'),
        ('603259', '药明康德', 'SH', '医药外包'),
        ('600900', '长江电力', 'SH', '电力'),
        ('000858', '五粮液', 'SZ', '白酒'),
        ('002304', '洋河股份', 'SZ', '白酒'),
    ]

    return sample_stocks

def generate_kline_data(stock_code, days=30):
    """为股票生成K线数据"""
    klines = []
    base_price = random.uniform(10, 200)  # 基础价格

    for i in range(days):
        date = (datetime.now() - timedelta(days=days-i-1)).strftime('%Y-%m-%d')

        # 模拟价格波动
        change_rate = random.uniform(-0.05, 0.05)  # -5%到+5%的变化
        base_price *= (1 + change_rate)

        open_price = base_price * random.uniform(0.98, 1.02)
        close_price = base_price
        high_price = max(open_price, close_price) * random.uniform(1.0, 1.03)
        low_price = min(open_price, close_price) * random.uniform(0.97, 1.0)

        volume = random.randint(100000, 10000000)  # 成交量
        amount = volume * close_price  # 成交额

        klines.append((
            stock_code, date, round(open_price, 2), round(high_price, 2),
            round(low_price, 2), round(close_price, 2), volume, round(amount, 2)
        ))

    return klines

def main():
    # 连接数据库
    conn = sqlite3.connect('data/stock_picker.db')
    cursor = conn.cursor()

    # 插入样本股票
    sample_stocks = create_sample_stocks()
    inserted_stocks = 0

    print("插入样本股票数据...")
    for code, name, exchange, industry in sample_stocks:
        try:
            cursor.execute("""
                INSERT OR REPLACE INTO stocks
                (code, name, exchange, industry, created_at, updated_at)
                VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
            """, (code, name, exchange, industry))
            inserted_stocks += 1
        except Exception as e:
            print(f"插入股票 {code} 时出错: {e}")

    print(f"成功插入 {inserted_stocks} 只样本股票")

    # 为每只股票生成K线数据
    print("\n生成K线数据...")
    total_klines = 0

    for code, name, _, _ in sample_stocks:
        print(f"生成 {code}({name}) 的K线数据...")
        klines = generate_kline_data(code, days=30)

        for kline in klines:
            try:
                cursor.execute("""
                    INSERT OR REPLACE INTO klines
                    (stock_code, date, open, high, low, close, volume, amount, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
                """, kline)
                total_klines += 1
            except Exception as e:
                print(f"  插入K线数据时出错: {e}")

    # 生成成交量分析数据
    print("\n生成成交量分析数据...")
    for code, name, _, _ in sample_stocks[:5]:  # 为前5只股票生成分析数据
        # 获取最近的K线数据
        cursor.execute("""
            SELECT volume, date FROM klines
            WHERE stock_code = ?
            ORDER BY date DESC LIMIT 20
        """, (code,))

        kline_data = cursor.fetchall()
        if len(kline_data) >= 20:
            volumes = [row[0] for row in kline_data]
            avg_volume = sum(volumes) / len(volumes)

            for i, (volume, date) in enumerate(kline_data[:5]):  # 最近5天
                volume_ratio = volume / avg_volume
                is_surge = volume_ratio > 2.0

                cursor.execute("""
                    INSERT OR REPLACE INTO volume_analysis
                    (stock_code, date, volume_ratio, avg_volume_20, is_volume_surge, analysis_result, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
                """, (
                    code, date, round(volume_ratio, 2), int(avg_volume),
                    is_surge, f"量比{volume_ratio:.2f}倍" + ("，异常放量" if is_surge else "")
                ))

    # 生成买入信号数据
    print("\n生成买入信号数据...")
    signal_types = ['突破买入', '低位放量', '主力建仓', '技术反弹', '政策利好']

    for code, name, _, _ in sample_stocks[:3]:  # 为前3只股票生成信号
        signal_type = random.choice(signal_types)
        confidence = random.uniform(0.7, 0.95)

        # 获取最新价格
        cursor.execute("""
            SELECT close FROM klines
            WHERE stock_code = ?
            ORDER BY date DESC LIMIT 1
        """, (code,))

        result = cursor.fetchone()
        if result:
            price = result[0]
            volume = random.randint(1000000, 5000000)

            cursor.execute("""
                INSERT INTO buy_signals
                (stock_code, signal_type, confidence, price, volume, analysis_data, created_at)
                VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            """, (
                code, signal_type, round(confidence, 2), price, volume,
                f'{{"analysis": "基于技术指标和资金流向分析", "reason": "{signal_type}"}}'
            ))

    conn.commit()
    conn.close()

    print(f"\n样本数据创建完成！")
    print(f"- 股票数据: {inserted_stocks} 只")
    print(f"- K线数据: {total_klines} 条")
    print(f"- 成交量分析: 25 条")
    print(f"- 买入信号: 3 条")

if __name__ == "__main__":
    main()