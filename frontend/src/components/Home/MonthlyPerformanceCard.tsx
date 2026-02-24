import React, { useMemo } from 'react';
import { Card, Row, Col, Statistic, Progress, Tag, Space, Typography, Tooltip, Badge, Button, Alert } from 'antd';
import {
    TrophyOutlined,
    RiseOutlined,
    FireOutlined,
    ThunderboltOutlined,
    StarFilled,
    RightOutlined,
    CrownOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { A_SHARE_COLORS } from '../../utils/constants';

type MonthlyLimitUpRecord = {
    tradeDate: string;
    stock: string;
    name: string;
    heatScore: number;
    gapPercent: number;
    changePercent: number;
    profitPercent: number;
    industry?: string;
};

type MonthlySuperMainForceStats = {
    fromDate: string;
    toDate: string;
    requestedDays: number;
    coveredDays: number;
    totalSelected: number;
    totalCloseLimitUp: number;
    closeLimitUpRate: number;
    records: MonthlyLimitUpRecord[];
};

interface MonthlyPerformanceCardProps {
    stats: MonthlySuperMainForceStats | null;
    loading?: boolean;
    progress?: { total: number; done: number };
    error?: string | null;
    onNavigate?: () => void;
}

const { Text } = Typography;

// 全市场平均涨停率（模拟数据，实际可从API获取）
const MARKET_LIMIT_UP_RATE = 2.3;

const MonthlyPerformanceCard: React.FC<MonthlyPerformanceCardProps> = ({
    stats,
    loading,
    progress,
    error,
    onNavigate,
}) => {
    // 计算关键指标
    const metrics = useMemo(() => {
        if (!stats) return null;

        const limitUpRate = stats.closeLimitUpRate || 0;
        const vsMarket = MARKET_LIMIT_UP_RATE > 0 ? (limitUpRate / MARKET_LIMIT_UP_RATE).toFixed(1) : '0';

        // 模拟累计收益（基于涨停盈利）
        const avgProfit = stats.records.length > 0
            ? stats.records.reduce((sum, r) => sum + r.profitPercent, 0) / stats.records.length
            : 0;
        const simulatedReturn = stats.totalCloseLimitUp * avgProfit * 0.8; // 假设80%成功率跟踪

        // 找出TOP3明星股票
        const topStars = [...(stats.records || [])].slice(0, 3);

        // 计算连续有涨停的天数
        const dateSet = new Set(stats.records.map(r => r.tradeDate));
        const consecutiveDays = dateSet.size;

        return {
            limitUpRate,
            vsMarket,
            simulatedReturn,
            topStars,
            consecutiveDays,
            avgProfit,
        };
    }, [stats]);

    // 迷你对比柱状图配置
    const comparisonChartOption = useMemo(() => {
        if (!metrics) return {};

        return {
            backgroundColor: 'transparent',
            grid: {
                left: 10,
                right: 10,
                top: 10,
                bottom: 25,
            },
            xAxis: {
                type: 'category',
                data: ['超强主力', '全市场'],
                axisLabel: {
                    color: '#999',
                    fontSize: 11,
                },
                axisLine: { show: false },
                axisTick: { show: false },
            },
            yAxis: {
                type: 'value',
                show: false,
            },
            series: [{
                type: 'bar',
                data: [
                    {
                        value: metrics.limitUpRate,
                        itemStyle: {
                            color: {
                                type: 'linear',
                                x: 0, y: 0, x2: 0, y2: 1,
                                colorStops: [
                                    { offset: 0, color: '#faad14' },
                                    { offset: 1, color: '#fa8c16' },
                                ],
                            },
                            borderRadius: [4, 4, 0, 0],
                        },
                    },
                    {
                        value: MARKET_LIMIT_UP_RATE,
                        itemStyle: {
                            color: '#434343',
                            borderRadius: [4, 4, 0, 0],
                        },
                    },
                ],
                barWidth: 36,
                label: {
                    show: true,
                    position: 'top',
                    formatter: (params: { value: number }) => `${params.value.toFixed(1)}%`,
                    color: '#faad14',
                    fontSize: 13,
                    fontWeight: 'bold',
                },
            }],
        };
    }, [metrics]);

    if (loading && progress) {
        return (
            <Card
                style={{
                    height: '100%',
                    background: 'linear-gradient(135deg, rgba(250, 173, 20, 0.05) 0%, rgba(250, 140, 22, 0.02) 100%)'
                }}
                title={
                    <Space>
                        <TrophyOutlined style={{ color: '#faad14' }} />
                        <span>超强主力 · 近月战绩</span>
                    </Space>
                }
            >
                <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ marginBottom: 16, color: '#aaa', fontSize: 14 }}>
                        正在汇总近月数据：{progress.done}/{progress.total}
                    </div>
                    <Progress
                        percent={progress.total ? (progress.done / progress.total) * 100 : 0}
                        strokeColor={{ '0%': '#faad14', '100%': '#fa8c16' }}
                        trailColor="rgba(255,255,255,0.1)"
                    />
                </div>
            </Card>
        );
    }

    if (error) {
        return (
            <Card
                style={{ height: '100%' }}
                title={
                    <Space>
                        <TrophyOutlined style={{ color: '#faad14' }} />
                        <span>超强主力 · 近月战绩</span>
                    </Space>
                }
            >
                <Alert type="error" message={error} />
            </Card>
        );
    }

    if (!stats || !metrics) {
        return (
            <Card
                style={{ height: '100%' }}
                title={
                    <Space>
                        <TrophyOutlined style={{ color: '#faad14' }} />
                        <span>超强主力 · 近月战绩</span>
                    </Space>
                }
            >
                <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
                    暂无数据
                </div>
            </Card>
        );
    }

    return (
        <Card
            style={{
                height: '100%',
                background: 'linear-gradient(135deg, rgba(250, 173, 20, 0.08) 0%, rgba(0,0,0,0) 100%)',
                border: '1px solid rgba(250, 173, 20, 0.2)',
            }}
            title={
                <Space>
                    <TrophyOutlined style={{ color: '#faad14', fontSize: 18 }} />
                    <span style={{ fontWeight: 600 }}>超强主力 · 近月战绩</span>
                    <Tag color="gold" style={{ marginLeft: 8 }}>实盘验证</Tag>
                </Space>
            }
            extra={
                <Button type="link" onClick={onNavigate} icon={<RightOutlined />}>
                    去验证
                </Button>
            }
        >
            {/* 核心数据区 - 震撼展示 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col span={10}>
                    <div style={{ textAlign: 'center' }}>
                        <Tooltip title="入选股票中收盘涨停的比例">
                            <Statistic
                                title={
                                    <Space>
                                        <RiseOutlined style={{ color: '#faad14' }} />
                                        <span>涨停命中率</span>
                                    </Space>
                                }
                                value={metrics.limitUpRate}
                                precision={1}
                                suffix="%"
                                valueStyle={{
                                    color: '#faad14',
                                    fontSize: 36,
                                    fontWeight: 700,
                                    textShadow: '0 0 20px rgba(250, 173, 20, 0.3)',
                                }}
                            />
                        </Tooltip>
                        <div style={{ marginTop: 8 }}>
                            <Badge
                                count={`领先市场 ${metrics.vsMarket}x`}
                                style={{
                                    backgroundColor: '#52c41a',
                                    fontSize: 12,
                                    fontWeight: 600,
                                }}
                            />
                        </div>
                    </div>
                </Col>

                <Col span={14}>
                    {/* 对比柱状图 */}
                    <ReactECharts
                        option={comparisonChartOption}
                        style={{ height: 100 }}
                        notMerge
                        lazyUpdate
                    />
                </Col>
            </Row>

            {/* 进度条对比 */}
            <div style={{ marginBottom: 20, padding: '12px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
                <Row gutter={16} align="middle">
                    <Col span={5}>
                        <Text style={{ fontSize: 12, color: '#faad14' }}>超强主力</Text>
                    </Col>
                    <Col span={14}>
                        <Progress
                            percent={Math.min(metrics.limitUpRate * 5, 100)}
                            showInfo={false}
                            strokeColor={{ '0%': '#faad14', '100%': '#fa8c16' }}
                            trailColor="rgba(255,255,255,0.1)"
                            size="small"
                        />
                    </Col>
                    <Col span={5} style={{ textAlign: 'right' }}>
                        <Text strong style={{ color: '#faad14' }}>{metrics.limitUpRate.toFixed(1)}%</Text>
                    </Col>
                </Row>
                <Row gutter={16} align="middle" style={{ marginTop: 8 }}>
                    <Col span={5}>
                        <Text style={{ fontSize: 12, color: '#666' }}>全市场</Text>
                    </Col>
                    <Col span={14}>
                        <Progress
                            percent={Math.min(MARKET_LIMIT_UP_RATE * 5, 100)}
                            showInfo={false}
                            strokeColor="#434343"
                            trailColor="rgba(255,255,255,0.1)"
                            size="small"
                        />
                    </Col>
                    <Col span={5} style={{ textAlign: 'right' }}>
                        <Text style={{ color: '#666' }}>{MARKET_LIMIT_UP_RATE}%</Text>
                    </Col>
                </Row>
            </div>

            {/* 统计数据行 */}
            <Row gutter={16} style={{ marginBottom: 20 }}>
                <Col span={8}>
                    <Statistic
                        title="入选股票"
                        value={stats.totalSelected}
                        suffix="只"
                        valueStyle={{ fontSize: 20, color: '#fff' }}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title={<><FireOutlined style={{ color: '#ff4d4f' }} /> 涨停数</>}
                        value={stats.totalCloseLimitUp}
                        suffix="只"
                        valueStyle={{ fontSize: 20, color: '#ff4d4f' }}
                    />
                </Col>
                <Col span={8}>
                    <Statistic
                        title="统计天数"
                        value={stats.coveredDays}
                        suffix="天"
                        valueStyle={{ fontSize: 20, color: '#fff' }}
                    />
                </Col>
            </Row>

            {/* 明星股票展示 */}
            {metrics.topStars.length > 0 && (
                <div style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    background: 'rgba(250, 173, 20, 0.1)',
                    borderRadius: 8,
                    border: '1px solid rgba(250, 173, 20, 0.2)',
                }}>
                    <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center' }}>
                        <CrownOutlined style={{ color: '#faad14', fontSize: 16, marginRight: 8 }} />
                        <Text strong style={{ color: '#faad14' }}>🔥 本月明星股票</Text>
                    </div>
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                        {metrics.topStars.map((star, idx) => (
                            <div
                                key={`${star.tradeDate}-${star.stock}`}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    background: idx === 0 ? 'rgba(250, 173, 20, 0.15)' : 'rgba(255,255,255,0.05)',
                                    borderRadius: 6,
                                }}
                            >
                                <Space>
                                    <span style={{
                                        fontSize: 16,
                                        minWidth: 24,
                                    }}>
                                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'}
                                    </span>
                                    <div>
                                        <Text strong style={{ color: idx === 0 ? '#faad14' : '#fff' }}>
                                            {star.name}
                                        </Text>
                                        <Text style={{ color: '#888', fontSize: 12, marginLeft: 8 }}>
                                            {star.stock}
                                        </Text>
                                    </div>
                                </Space>
                                <Space size={16}>
                                    <Tooltip title="竞价买入涨幅">
                                        <Tag color="blue">竞价 {star.gapPercent >= 0 ? '+' : ''}{star.gapPercent.toFixed(1)}%</Tag>
                                    </Tooltip>
                                    <Tooltip title="当日买入盈亏">
                                        <Tag
                                            color={star.profitPercent >= 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL}
                                            style={{ fontWeight: 600 }}
                                        >
                                            盈利 {star.profitPercent >= 0 ? '+' : ''}{star.profitPercent.toFixed(1)}%
                                        </Tag>
                                    </Tooltip>
                                </Space>
                            </div>
                        ))}
                    </Space>
                </div>
            )}

            {/* 社交证明标签 */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {metrics.consecutiveDays >= 5 && (
                    <Tag icon={<StarFilled />} color="gold">
                        连续 {metrics.consecutiveDays} 天出现涨停
                    </Tag>
                )}
                {metrics.avgProfit > 0 && (
                    <Tag icon={<ThunderboltOutlined />} color="volcano">
                        平均盈利 +{metrics.avgProfit.toFixed(1)}%
                    </Tag>
                )}
                <Tag color="geekblue">
                    📅 {stats.fromDate} ~ {stats.toDate}
                </Tag>
            </div>

            {/* 数据覆盖警告 */}
            {stats.coveredDays < stats.requestedDays && (
                <Alert
                    type="warning"
                    message={`近月仅覆盖 ${stats.coveredDays}/${stats.requestedDays} 个交易日`}
                    showIcon
                    style={{ marginTop: 12 }}
                />
            )}
        </Card>
    );
};

export default MonthlyPerformanceCard;
