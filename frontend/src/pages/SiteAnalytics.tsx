import React, { useEffect, useState, useCallback } from 'react';
import {
    Card,
    Row,
    Col,
    Statistic,
    Table,
    Spin,
    message,
    Select,
    Typography,
    Space,
    Tag,
    Tooltip,
    Empty,
} from 'antd';
import {
    AreaChartOutlined,
    EyeOutlined,
    UserOutlined,
    ApiOutlined,
    ClockCircleOutlined,
    FireOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Legend,
} from 'recharts';

const { Title, Text } = Typography;

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

interface SummaryData {
    today_uv: number;
    today_pv: number;
    today_api_calls: number;
    avg_response_time_ms: number;
    week_uv: number;
    week_pv: number;
    month_uv: number;
    month_pv: number;
}

interface PageRankingItem {
    page_path: string;
    view_count: number;
    unique_visitors: number;
}

interface ApiStatsItem {
    endpoint: string;
    call_count: number;
    avg_response_time_ms: number;
    error_rate: number;
}

interface TimeDistributionItem {
    hour: number;
    count: number;
}

interface UserActivityItem {
    user_id: number;
    username: string;
    page_views: number;
    api_calls: number;
    last_active: string;
}

interface RealtimeItem {
    id: number;
    page_path: string;
    user_id: number | null;
    username: string | null;
    ip_address: string | null;
    created_at: string;
}

interface TrendItem {
    date: string;
    pv: number;
    uv: number;
}

const getAuthHeaders = () => {
    const token = localStorage.getItem('sq_token');
    return {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
};

const fetchData = async <T,>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> => {
    const queryString = new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
    ).toString();
    const url = `${API_BASE}/analytics/${endpoint}${queryString ? `?${queryString}` : ''}`;
    const response = await fetch(url, { headers: getAuthHeaders() });
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
};

const SiteAnalytics: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [days, setDays] = useState(7);
    const [summary, setSummary] = useState<SummaryData | null>(null);
    const [trend, setTrend] = useState<TrendItem[]>([]);
    const [pageRanking, setPageRanking] = useState<PageRankingItem[]>([]);
    const [apiStats, setApiStats] = useState<ApiStatsItem[]>([]);
    const [timeDistribution, setTimeDistribution] = useState<TimeDistributionItem[]>([]);
    const [userActivity, setUserActivity] = useState<UserActivityItem[]>([]);
    const [realtime, setRealtime] = useState<RealtimeItem[]>([]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [
                summaryData,
                trendData,
                pageRankingData,
                apiStatsData,
                timeDistData,
                userActivityData,
                realtimeData,
            ] = await Promise.all([
                fetchData<SummaryData>('summary'),
                fetchData<TrendItem[]>('trend', { days }),
                fetchData<PageRankingItem[]>('page-ranking', { days, limit: 10 }),
                fetchData<ApiStatsItem[]>('api-stats', { days, limit: 10 }),
                fetchData<TimeDistributionItem[]>('time-distribution', { days }),
                fetchData<UserActivityItem[]>('user-activity', { days, limit: 10 }),
                fetchData<RealtimeItem[]>('realtime', { limit: 30 }),
            ]);

            setSummary(summaryData);
            setTrend(trendData);
            setPageRanking(pageRankingData);
            setApiStats(apiStatsData);
            setTimeDistribution(timeDistData);
            setUserActivity(userActivityData);
            setRealtime(realtimeData);
        } catch (error) {
            console.error('Failed to load analytics:', error);
            message.error('加载统计数据失败');
        } finally {
            setLoading(false);
        }
    }, [days]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // 自动刷新
    useEffect(() => {
        const interval = setInterval(loadData, 60000); // 每分钟刷新
        return () => clearInterval(interval);
    }, [loadData]);

    const pageRankingColumns = [
        {
            title: '排名',
            key: 'rank',
            width: 60,
            render: (_: unknown, __: unknown, index: number) => (
                <Tag color={index < 3 ? 'gold' : 'default'}>{index + 1}</Tag>
            ),
        },
        {
            title: '页面路径',
            dataIndex: 'page_path',
            key: 'page_path',
            ellipsis: true,
        },
        {
            title: '访问量',
            dataIndex: 'view_count',
            key: 'view_count',
            width: 100,
            sorter: (a: PageRankingItem, b: PageRankingItem) => a.view_count - b.view_count,
        },
        {
            title: 'UV',
            dataIndex: 'unique_visitors',
            key: 'unique_visitors',
            width: 80,
        },
    ];

    const apiStatsColumns = [
        {
            title: '接口',
            dataIndex: 'endpoint',
            key: 'endpoint',
            ellipsis: true,
        },
        {
            title: '调用次数',
            dataIndex: 'call_count',
            key: 'call_count',
            width: 100,
            sorter: (a: ApiStatsItem, b: ApiStatsItem) => a.call_count - b.call_count,
        },
        {
            title: '平均耗时',
            dataIndex: 'avg_response_time_ms',
            key: 'avg_response_time_ms',
            width: 100,
            render: (v: number) => `${v.toFixed(0)}ms`,
        },
        {
            title: '错误率',
            dataIndex: 'error_rate',
            key: 'error_rate',
            width: 80,
            render: (v: number) => (
                <Tag color={v > 10 ? 'red' : v > 1 ? 'orange' : 'green'}>
                    {v.toFixed(1)}%
                </Tag>
            ),
        },
    ];

    const userActivityColumns = [
        {
            title: '用户',
            dataIndex: 'username',
            key: 'username',
        },
        {
            title: '页面访问',
            dataIndex: 'page_views',
            key: 'page_views',
            width: 100,
        },
        {
            title: 'API 调用',
            dataIndex: 'api_calls',
            key: 'api_calls',
            width: 100,
        },
        {
            title: '最后活跃',
            dataIndex: 'last_active',
            key: 'last_active',
            width: 180,
            render: (v: string) => v ? new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').toLocaleString('zh-CN') : '-',
        },
    ];

    const realtimeColumns = [
        {
            title: '时间',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 180,
            render: (v: string) => new Date(v.includes('T') ? v : v.replace(' ', 'T') + 'Z').toLocaleString('zh-CN'),
        },
        {
            title: '页面',
            dataIndex: 'page_path',
            key: 'page_path',
            ellipsis: true,
        },
        {
            title: '用户',
            dataIndex: 'username',
            key: 'username',
            width: 120,
            render: (v: string | null) => v || <Text type="secondary">匿名</Text>,
        },
        {
            title: 'IP',
            dataIndex: 'ip_address',
            key: 'ip_address',
            width: 130,
            render: (v: string | null) => v || '-',
        },
    ];

    if (loading && !summary) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
                <Spin size="large" tip="加载统计数据..." />
            </div>
        );
    }

    return (
        <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
            {/* 页面标题 */}
            <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <AreaChartOutlined style={{ fontSize: 28, color: 'var(--sq-primary)' }} />
                    <Title level={3} style={{ margin: 0 }}>网站统计</Title>
                </Space>
                <Space>
                    <Select
                        value={days}
                        onChange={setDays}
                        style={{ width: 120 }}
                        options={[
                            { label: '最近 7 天', value: 7 },
                            { label: '最近 30 天', value: 30 },
                            { label: '最近 90 天', value: 90 },
                        ]}
                    />
                    <Tooltip title="刷新数据">
                        <ReloadOutlined
                            style={{ fontSize: 18, cursor: 'pointer', color: 'var(--sq-primary)' }}
                            onClick={loadData}
                            spin={loading}
                        />
                    </Tooltip>
                </Space>
            </div>

            {/* 核心指标卡片 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} sm={12} md={6}>
                    <Card hoverable>
                        <Statistic
                            title="今日 UV"
                            value={summary?.today_uv || 0}
                            prefix={<UserOutlined />}
                            valueStyle={{ color: '#3f8600' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card hoverable>
                        <Statistic
                            title="今日 PV"
                            value={summary?.today_pv || 0}
                            prefix={<EyeOutlined />}
                            valueStyle={{ color: '#1890ff' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card hoverable>
                        <Statistic
                            title="今日 API 调用"
                            value={summary?.today_api_calls || 0}
                            prefix={<ApiOutlined />}
                            valueStyle={{ color: '#722ed1' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} md={6}>
                    <Card hoverable>
                        <Statistic
                            title="平均响应时间"
                            value={summary?.avg_response_time_ms || 0}
                            suffix="ms"
                            prefix={<ClockCircleOutlined />}
                            valueStyle={{ color: summary && summary.avg_response_time_ms > 500 ? '#cf1322' : '#3f8600' }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 趋势图表 */}
            <Card title="📈 访问趋势" style={{ marginBottom: 24 }}>
                {trend.length > 0 ? (
                    <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={trend}>
                            <defs>
                                <linearGradient id="colorPv" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#52c41a" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.65)" />
                            <YAxis stroke="rgba(255,255,255,0.65)" />
                            <RechartsTooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(0,0,0,0.85)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: 8,
                                }}
                            />
                            <Legend />
                            <Area
                                type="monotone"
                                dataKey="pv"
                                name="PV"
                                stroke="#1890ff"
                                fillOpacity={1}
                                fill="url(#colorPv)"
                            />
                            <Area
                                type="monotone"
                                dataKey="uv"
                                name="UV"
                                stroke="#52c41a"
                                fillOpacity={1}
                                fill="url(#colorUv)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : (
                    <Empty description="暂无数据" />
                )}
            </Card>

            {/* 24 小时热力图 */}
            <Card title="🕐 24 小时访问分布" style={{ marginBottom: 24 }}>
                {timeDistribution.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={timeDistribution}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                            <XAxis dataKey="hour" stroke="rgba(255,255,255,0.65)" tickFormatter={(v) => `${v}时`} />
                            <YAxis stroke="rgba(255,255,255,0.65)" />
                            <RechartsTooltip
                                contentStyle={{
                                    backgroundColor: 'rgba(0,0,0,0.85)',
                                    border: '1px solid rgba(255,255,255,0.2)',
                                    borderRadius: 8,
                                }}
                                formatter={(value) => [`${value}`, '访问量']}
                                labelFormatter={(label) => `${label}:00 - ${label}:59`}
                            />
                            <Bar dataKey="count" fill="#722ed1" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                ) : (
                    <Empty description="暂无数据" />
                )}
            </Card>

            {/* 排行榜 */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <FireOutlined style={{ color: '#ff4d4f' }} />
                                <span>页面热度排行</span>
                            </Space>
                        }
                    >
                        <Table
                            columns={pageRankingColumns}
                            dataSource={pageRanking}
                            rowKey="page_path"
                            pagination={false}
                            size="small"
                            locale={{ emptyText: <Empty description="暂无数据" /> }}
                        />
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <ApiOutlined style={{ color: '#722ed1' }} />
                                <span>API 调用排行</span>
                            </Space>
                        }
                    >
                        <Table
                            columns={apiStatsColumns}
                            dataSource={apiStats}
                            rowKey="endpoint"
                            pagination={false}
                            size="small"
                            locale={{ emptyText: <Empty description="暂无数据" /> }}
                        />
                    </Card>
                </Col>
            </Row>

            {/* 用户活跃 & 实时访问 */}
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <UserOutlined style={{ color: '#52c41a' }} />
                                <span>用户活跃排行</span>
                            </Space>
                        }
                    >
                        <Table
                            columns={userActivityColumns}
                            dataSource={userActivity}
                            rowKey="user_id"
                            pagination={false}
                            size="small"
                            locale={{ emptyText: <Empty description="暂无数据" /> }}
                        />
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card
                        title={
                            <Space>
                                <ClockCircleOutlined style={{ color: '#1890ff' }} />
                                <span>实时访问流</span>
                                <Tag color="processing">Live</Tag>
                            </Space>
                        }
                    >
                        <Table
                            columns={realtimeColumns}
                            dataSource={realtime}
                            rowKey="id"
                            pagination={false}
                            size="small"
                            scroll={{ y: 300 }}
                            locale={{ emptyText: <Empty description="暂无数据" /> }}
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default SiteAnalytics;
