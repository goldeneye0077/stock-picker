/**
 * 板块成交量异动分析卡片
 * 分析各行业板块的成交量变化趋势
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Table, Progress, Tag, Space, Statistic, Row, Col, Empty, Button, Tooltip, message } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  ThunderboltOutlined,
  SyncOutlined,
  QuestionCircleOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchSectorVolumeData } from '../../services/analysisService';
import { A_SHARE_COLORS } from '../../utils/constants';

interface SectorData {
  key: string;
  sector: string;
  volume: number;
  volumeChange: number;
  stockCount: number;
  upCount: number;
  downCount: number;
  avgChange: number;
  leadingStock: string;
  leadingStockChange: number;
}

const SectorVolumeCardComponent: React.FC = () => {
  const [data, setData] = useState<SectorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  // 获取板块成交量数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchSectorVolumeData({ days: 5 });

      if (result.sectors && Array.isArray(result.sectors)) {
        // 转换数据格式
        const formattedData: SectorData[] = result.sectors.map((item: any, index: number) => ({
          key: String(index + 1),
          sector: item.sector || '',
          volume: item.volume || 0,
          volumeChange: item.volume_change || 0,
          stockCount: item.stock_count || 0,
          upCount: item.up_count || 0,
          downCount: item.down_count || 0,
          avgChange: item.avg_change || 0,
          leadingStock: item.leading_stock || '',
          leadingStockChange: item.leading_stock_change || 0
        }));

        setData(formattedData);
        setSummary(result.summary);
        message.success('板块数据已刷新');
      }
    } catch (error) {
      console.error('Error fetching sector volume data:', error);
      message.error('获取板块数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const columns: ColumnsType<SectorData> = [
    {
      title: '板块名称',
      dataIndex: 'sector',
      key: 'sector',
      width: 120,
      fixed: 'left',
      render: (text: string) => (
        <Space>
          <FireOutlined style={{ color: '#ff4d4f' }} />
          <strong>{text}</strong>
        </Space>
      )
    },
    {
      title: '成交额',
      dataIndex: 'volume',
      key: 'volume',
      width: 100,
      render: (value: number) => `${(value / 100000000).toFixed(2)}亿`,
      sorter: (a, b) => a.volume - b.volume
    },
    {
      title: '量比变化',
      dataIndex: 'volumeChange',
      key: 'volumeChange',
      width: 120,
      render: (value: number) => (
        <Space>
          <span style={{
            color: value > 0 ? A_SHARE_COLORS.RISE : value < 0 ? A_SHARE_COLORS.FALL : '#666',
            fontWeight: 'bold'
          }}>
            {value > 0 ? '+' : ''}{value.toFixed(1)}%
          </span>
          {value > 0 ?
            <RiseOutlined style={{ color: A_SHARE_COLORS.RISE }} /> :
            <FallOutlined style={{ color: A_SHARE_COLORS.FALL }} />
          }
        </Space>
      ),
      sorter: (a, b) => a.volumeChange - b.volumeChange,
      defaultSortOrder: 'descend'
    },
    {
      title: '涨跌家数',
      key: 'upDownCount',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0} style={{ width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
            <span style={{ color: A_SHARE_COLORS.RISE }}>涨 {record.upCount}</span>
            <span style={{ color: A_SHARE_COLORS.FALL }}>跌 {record.downCount}</span>
          </div>
          <Progress
            percent={(record.upCount / record.stockCount) * 100}
            size="small"
            showInfo={false}
            strokeColor={A_SHARE_COLORS.RISE}
            trailColor={A_SHARE_COLORS.FALL}
          />
        </Space>
      )
    },
    {
      title: '平均涨幅',
      dataIndex: 'avgChange',
      key: 'avgChange',
      width: 100,
      render: (value: number) => (
        <Tag color={value > 0 ? A_SHARE_COLORS.RISE : value < 0 ? A_SHARE_COLORS.FALL : 'default'}>
          {value > 0 ? '+' : ''}{value.toFixed(1)}%
        </Tag>
      ),
      sorter: (a, b) => a.avgChange - b.avgChange
    },
    {
      title: '龙头股',
      key: 'leadingStock',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size={0}>
          <span style={{ fontWeight: 500 }}>{record.leadingStock}</span>
          <span style={{
            fontSize: '12px',
            color: record.leadingStockChange > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL
          }}>
            {record.leadingStockChange > 0 ? '+' : ''}{record.leadingStockChange.toFixed(2)}%
          </span>
        </Space>
      )
    }
  ];

  // 使用后端返回的统计数据，如果没有则计算
  const totalVolume = summary?.totalVolume || data.reduce((sum, item) => sum + item.volume, 0);
  const avgVolumeChange = summary?.avgVolumeChange || (data.length > 0
    ? data.reduce((sum, item) => sum + item.volumeChange, 0) / data.length
    : 0);
  const activeSectors = summary?.activeSectors || data.filter(item => item.volumeChange > 20).length;
  const weakSectors = summary?.weakSectors || data.filter(item => item.volumeChange < -10).length;

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1890ff' }} />
          板块成交量异动分析
          <Tooltip
            title={
              <div style={{ fontSize: '12px' }}>
                <div><strong>算法说明：</strong></div>
                <div>• 计算窗口：对比最近5日平均成交量</div>
                <div>• 量比变化：(今日总成交量 - 5日平均) / 5日平均 × 100%</div>
                <div>• 活跃板块：量比变化 &gt; 20%</div>
                <div>• 弱势板块：量比变化 &lt; -10%</div>
                <div>• 龙头股：板块内当日涨幅最高的股票</div>
              </div>
            }
            placement="right"
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
      variant="borderless"
      style={{ height: '100%' }}
    >
      {/* 统计概览 */}
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Statistic
            title="总成交额"
            value={(totalVolume / 100000000).toFixed(0)}
            suffix="亿"
            valueStyle={{ color: '#1890ff' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="平均量比"
            value={avgVolumeChange.toFixed(1)}
            suffix="%"
            prefix={avgVolumeChange > 0 ? <RiseOutlined /> : <FallOutlined />}
            valueStyle={{ color: avgVolumeChange > 0 ? A_SHARE_COLORS.RISE : A_SHARE_COLORS.FALL }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="活跃板块"
            value={activeSectors}
            suffix="个"
            valueStyle={{ color: A_SHARE_COLORS.RISE }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="弱势板块"
            value={weakSectors}
            suffix="个"
            valueStyle={{ color: A_SHARE_COLORS.FALL }}
          />
        </Col>
      </Row>

      {/* 板块列表 */}
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showQuickJumper: true,
          showTotal: (total) => `共 ${total} 个板块`,
          pageSizeOptions: ['10', '20', '50']
        }}
        size="small"
        scroll={{ x: 800, y: 400 }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无板块数据"
            />
          )
        }}
      />
    </Card>
  );
};

// 使用命名导出以保持与项目其他组件的一致性
export const SectorVolumeCard = SectorVolumeCardComponent;
