import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Card,
  Col,
  Empty,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ApiOutlined,
  AreaChartOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  FireOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ColumnsType } from 'antd/es/table';
import {
  type AnalyticsApiStatsItem,
  type AnalyticsPageRankingItem,
  type AnalyticsRealtimeItem,
  type AnalyticsSummary,
  type AnalyticsTimeDistributionItem,
  type AnalyticsTrendItem,
  type AnalyticsUserActivityItem,
  fetchSiteAnalyticsDashboard,
  type SiteAnalyticsDashboardData,
} from '../services/analyticsService';

const { Title, Text } = Typography;

const REFRESH_INTERVAL_MS = 60_000;
const DAY_OPTIONS = [
  { value: 7, label: '最近 7 天' },
  { value: 30, label: '最近 30 天' },
  { value: 90, label: '最近 90 天' },
];

const EMPTY_SUMMARY: AnalyticsSummary = {
  today_uv: 0,
  today_pv: 0,
  today_api_calls: 0,
  avg_response_time_ms: 0,
  week_uv: 0,
  week_pv: 0,
  month_uv: 0,
  month_pv: 0,
};

function formatDateLabel(date: string): string {
  if (!date) return '-';
  return date.length >= 10 ? date.slice(5, 10) : date;
}

function formatDateTime(dateTime: string): string {
  if (!dateTime) return '-';
  const normalized = dateTime.includes('T') ? dateTime : dateTime.replace(' ', 'T');
  const withTimezone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(normalized) ? normalized : `${normalized}Z`;
  const date = new Date(withTimezone);

  if (Number.isNaN(date.getTime())) {
    return dateTime;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false,
  });
}

function normalizeErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    if (err.message.includes('401') || err.message.includes('403')) {
      return '仅管理员可访问网站统计，请使用管理员账号登录。';
    }
    return err.message;
  }

  return '加载网站统计数据失败';
}

const SiteAnalytics: React.FC = () => {
  const [days, setDays] = useState<number>(7);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [dashboard, setDashboard] = useState<SiteAnalyticsDashboardData | null>(null);
  const hasLoadedRef = useRef<boolean>(false);

  const loadDashboard = useCallback(async () => {
    const isFirstLoad = !hasLoadedRef.current;
    setErrorMessage('');
    if (isFirstLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    try {
      const data = await fetchSiteAnalyticsDashboard(days);
      setDashboard(data);
    } catch (err) {
      setErrorMessage(normalizeErrorMessage(err));
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      loadDashboard();
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  const summary = dashboard?.summary || EMPTY_SUMMARY;
  const trend = dashboard?.trend || [];
  const pageRanking = dashboard?.pageRanking || [];
  const apiStats = dashboard?.apiStats || [];
  const timeDistribution = dashboard?.timeDistribution || [];
  const userActivity = dashboard?.userActivity || [];
  const realtime = dashboard?.realtime || [];

  const pageRankingColumns: ColumnsType<AnalyticsPageRankingItem> = useMemo(() => [
    {
      title: '排名',
      key: 'rank',
      width: 64,
      render: (_value, _record, index) => <Tag color={index < 3 ? 'gold' : 'default'}>{index + 1}</Tag>,
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
      sorter: (a, b) => a.view_count - b.view_count,
    },
    {
      title: 'UV',
      dataIndex: 'unique_visitors',
      key: 'unique_visitors',
      width: 80,
    },
  ], []);

  const apiStatsColumns: ColumnsType<AnalyticsApiStatsItem> = useMemo(() => [
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
      width: 110,
      sorter: (a, b) => a.call_count - b.call_count,
    },
    {
      title: '平均耗时',
      dataIndex: 'avg_response_time_ms',
      key: 'avg_response_time_ms',
      width: 110,
      render: (value: number) => `${value}ms`,
    },
    {
      title: '错误率',
      dataIndex: 'error_rate',
      key: 'error_rate',
      width: 100,
      render: (value: number) => {
        const color = value > 10 ? 'red' : value > 1 ? 'orange' : 'green';
        return <Tag color={color}>{value.toFixed(1)}%</Tag>;
      },
    },
  ], []);

  const userActivityColumns: ColumnsType<AnalyticsUserActivityItem> = useMemo(() => [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '页面访问',
      dataIndex: 'page_views',
      key: 'page_views',
      width: 120,
    },
    {
      title: 'API 调用',
      dataIndex: 'api_calls',
      key: 'api_calls',
      width: 120,
    },
    {
      title: '最后活跃',
      dataIndex: 'last_active',
      key: 'last_active',
      width: 190,
      render: (value: string) => formatDateTime(value),
    },
  ], []);

  const realtimeColumns: ColumnsType<AnalyticsRealtimeItem> = useMemo(() => [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 190,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '页面',
      dataIndex: 'page_path',
      key: 'page_path',
      ellipsis: true,
    },
    {
      title: '访问者',
      dataIndex: 'username',
      key: 'username',
      width: 140,
      render: (value: string | null) => value || <Text type="secondary">匿名访问</Text>,
    },
  ], []);

  if (loading && !dashboard) {
    return (
      <div style={{ minHeight: 360, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" tip="正在加载网站统计数据..." />
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 1600, margin: '0 auto' }}>
      <div
        style={{
          marginBottom: 24,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <Space>
          <AreaChartOutlined style={{ fontSize: 28, color: 'var(--sq-primary)' }} />
          <Title level={3} style={{ margin: 0 }}>
            网站统计
          </Title>
        </Space>

        <Space>
          <Select
            value={days}
            onChange={setDays}
            style={{ width: 132 }}
            options={DAY_OPTIONS}
          />
          <Tooltip title="刷新数据">
            <ReloadOutlined
              style={{
                fontSize: 18,
                cursor: 'pointer',
                color: 'var(--sq-primary)',
              }}
              spin={refreshing}
              onClick={loadDashboard}
            />
          </Tooltip>
        </Space>
      </div>

      {errorMessage && (
        <Alert
          style={{ marginBottom: 16 }}
          type="error"
          showIcon
          message="网站统计加载失败"
          description={errorMessage}
        />
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="今日 UV"
              value={summary.today_uv}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="今日 PV"
              value={summary.today_pv}
              prefix={<EyeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="今日 API 调用"
              value={summary.today_api_calls}
              prefix={<ApiOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card hoverable>
            <Statistic
              title="平均响应耗时"
              value={summary.avg_response_time_ms}
              suffix="ms"
              prefix={<ClockCircleOutlined />}
              valueStyle={{ color: summary.avg_response_time_ms > 500 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
      </Row>

      <Card title="访问趋势" style={{ marginBottom: 24 }}>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="trendPv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1890ff" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#1890ff" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="trendUv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#52c41a" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#52c41a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
              <XAxis dataKey="date" tickFormatter={formatDateLabel} stroke="rgba(148, 163, 184, 0.85)" />
              <YAxis stroke="rgba(148, 163, 184, 0.85)" />
              <RechartsTooltip
                labelFormatter={(label) => `日期: ${label}`}
                formatter={(value) => [String(value), '次数']}
              />
              <Legend />
              <Area type="monotone" dataKey="pv" name="PV" stroke="#1890ff" fill="url(#trendPv)" />
              <Area type="monotone" dataKey="uv" name="UV" stroke="#52c41a" fill="url(#trendUv)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="暂无趋势数据" />
        )}
      </Card>

      <Card title="24 小时访问分布" style={{ marginBottom: 24 }}>
        {timeDistribution.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={timeDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148, 163, 184, 0.25)" />
              <XAxis dataKey="hour" tickFormatter={(value) => `${value}:00`} stroke="rgba(148, 163, 184, 0.85)" />
              <YAxis stroke="rgba(148, 163, 184, 0.85)" />
              <RechartsTooltip
                labelFormatter={(label) => `${label}:00 - ${label}:59`}
                formatter={(value) => [String(value), '访问量']}
              />
              <Bar dataKey="count" fill="#722ed1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <Empty description="暂无时段分布数据" />
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col xs={24} lg={12}>
          <Card
            title={(
              <Space>
                <FireOutlined style={{ color: '#ff4d4f' }} />
                <span>页面热度排行</span>
              </Space>
            )}
          >
            <Table
              columns={pageRankingColumns}
              dataSource={pageRanking}
              rowKey="page_path"
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty description="暂无页面排行数据" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={(
              <Space>
                <ApiOutlined style={{ color: '#722ed1' }} />
                <span>API 调用排行</span>
              </Space>
            )}
          >
            <Table
              columns={apiStatsColumns}
              dataSource={apiStats}
              rowKey="endpoint"
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty description="暂无 API 统计数据" /> }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card
            title={(
              <Space>
                <UserOutlined style={{ color: '#52c41a' }} />
                <span>用户活跃排行</span>
              </Space>
            )}
          >
            <Table
              columns={userActivityColumns}
              dataSource={userActivity}
              rowKey={(record) => String(record.user_id)}
              pagination={false}
              size="small"
              locale={{ emptyText: <Empty description="暂无用户活跃数据" /> }}
            />
          </Card>
        </Col>

        <Col xs={24} lg={12}>
          <Card
            title={(
              <Space>
                <ClockCircleOutlined style={{ color: '#1890ff' }} />
                <span>实时访问流</span>
                <Tag color="processing">Live</Tag>
              </Space>
            )}
          >
            <Table
              columns={realtimeColumns}
              dataSource={realtime}
              rowKey={(record) => String(record.id)}
              pagination={false}
              size="small"
              scroll={{ y: 320 }}
              locale={{ emptyText: <Empty description="暂无实时访问数据" /> }}
            />
          </Card>
        </Col>
      </Row>

      <div style={{ marginTop: 16 }}>
        <Text type="secondary">
          周累计 UV/PV: {summary.week_uv}/{summary.week_pv}，月累计 UV/PV: {summary.month_uv}/{summary.month_pv}
        </Text>
      </div>
    </div>
  );
};

export default SiteAnalytics;

