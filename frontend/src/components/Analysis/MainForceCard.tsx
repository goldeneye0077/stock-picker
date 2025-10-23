/**
 * 主力行为卡片组件
 * 显示主力资金行为分析数据和统计摘要
 * 性能优化：使用 useMemo 和 React.memo
 */

import React, { useMemo } from 'react';
import { Card, Table, Space, Button, Statistic, Row, Col, Tag, Tooltip } from 'antd';
import { TrophyOutlined, SyncOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useMainForce } from '../../hooks/useMainForce';
import type { ColumnsType } from 'antd/es/table';

interface MainForceItem {
  stock: string;
  name: string;
  behavior: string;
  strength: number;
  trend: string;
  date?: string;
}

const MainForceCardComponent: React.FC = () => {
  const { data, summary, loading, fetchData } = useMainForce({ days: 7, limit: 20 });

  // 使用 useMemo 缓存列定义，避免每次渲染都重新创建
  const columns: ColumnsType<MainForceItem> = useMemo(() => [
    {
      title: '股票',
      dataIndex: 'stock',
      key: 'stock',
      width: 120,
      render: (text: string, record: MainForceItem) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 'bold' }}>{text}</span>
          <span style={{ fontSize: '12px', color: '#888' }}>{record.name}</span>
        </Space>
      )
    },
    {
      title: '主力行为',
      dataIndex: 'behavior',
      key: 'behavior',
      width: 120,
      render: (text: string) => {
        let color = 'blue';
        if (text.includes('强势')) color = 'red';
        else if (text.includes('稳步')) color = 'orange';
        else if (text.includes('小幅')) color = 'green';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '资金强度',
      dataIndex: 'strength',
      key: 'strength',
      width: 120,
      render: (val: number) => `${val.toFixed(2)}亿`,
      sorter: (a: MainForceItem, b: MainForceItem) => a.strength - b.strength
    },
    {
      title: '趋势',
      dataIndex: 'trend',
      key: 'trend',
      width: 100,
      render: (text: string) => {
        const color = text.includes('上升') ? 'green' : text.includes('下降') ? 'red' : 'default';
        return <Tag color={color}>{text}</Tag>;
      }
    },
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 100,
      render: (text?: string) => text || '-'
    }
  ], []); // 列定义不依赖任何外部变量，可以设置为空依赖数组

  return (
    <Card
      title={
        <Space>
          <TrophyOutlined />
          <span style={{ fontSize: '16px', fontWeight: 'bold' }}>主力行为分析</span>
          <Tooltip
            title={
              <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>主力行为判断依据</div>
                <div style={{ marginBottom: '4px' }}>基于东方财富DC接口的资金流向数据（Tushare Pro），统计<strong>最近7个交易日</strong>的主力资金流入总额和平均大单占比：</div>
                <ul style={{ paddingLeft: '16px', margin: '8px 0' }}>
                  <li><strong>强势介入</strong>：总流入 &gt; 1亿元 且 大单占比 &gt; 30%</li>
                  <li><strong>稳步建仓</strong>：总流入 &gt; 5000万元 且 大单占比 &gt; 20%</li>
                  <li><strong>小幅流入</strong>：总流入 &gt; 0 元</li>
                  <li><strong>观望</strong>：总流入 ≤ 0 元（主力流出或持平）</li>
                </ul>
                <div style={{ fontSize: '12px', color: '#aaa', marginTop: '8px', borderTop: '1px solid #444', paddingTop: '8px' }}>
                  <strong>周期说明：</strong><br/>
                  • 7天周期：正好对应一个完整交易周，是行业主流的短中期观察窗口<br/>
                  • 既能过滤单日资金的偶然波动，又不会错过主力快速建仓的机会<br/>
                  • 主力资金 = 超大单 + 大单（通常为机构大额订单）<br/>
                  • 大单占比 = 主力净流入额 / 成交额<br/>
                  • 资金强度 = 总流入额 / 1000万（单位：千万元）
                </div>
              </div>
            }
            styles={{ root: { maxWidth: '500px' } }}
          >
            <QuestionCircleOutlined style={{ color: '#1890ff', cursor: 'help' }} />
          </Tooltip>
        </Space>
      }
      extra={
        <Button
          size="small"
          icon={<SyncOutlined spin={loading} />}
          onClick={fetchData}
          loading={loading}
        >
          刷新
        </Button>
      }
    >
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Statistic
              title="强势介入"
              value={summary.strongCount}
              suffix="只"
              valueStyle={{ color: '#cf1322' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="稳步建仓"
              value={summary.moderateCount}
              suffix="只"
              valueStyle={{ color: '#fa8c16' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="小幅流入"
              value={summary.weakCount}
              suffix="只"
              valueStyle={{ color: '#52c41a' }}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="平均强度"
              value={summary.avgStrength}
              suffix="亿"
              precision={2}
              valueStyle={{ color: '#1890ff' }}
            />
          </Col>
        </Row>
      )}

      <Table
        loading={loading}
        columns={columns}
        dataSource={data}
        rowKey="stock"
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 条记录`
        }}
        locale={{ emptyText: '暂无主力行为数据' }}
        size="middle"
      />
    </Card>
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const MainForceCard = React.memo(MainForceCardComponent);
