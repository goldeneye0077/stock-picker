/**
 * 板块成交量异动分析卡片
 * 分析各行业板块的成交量变化趋势
 */

import React, { useState, useEffect } from 'react';
import { Card, Table, Progress, Tag, Space, Statistic, Row, Col, Empty } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  ThunderboltOutlined
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';

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

  // 模拟数据 - 实际应该从API获取
  useEffect(() => {
    setLoading(true);

    // 模拟API调用延迟
    setTimeout(() => {
      const mockData: SectorData[] = [
        {
          key: '1',
          sector: '电子信息',
          volume: 1250000000,
          volumeChange: 45.8,
          stockCount: 156,
          upCount: 98,
          downCount: 58,
          avgChange: 3.2,
          leadingStock: '歌尔股份',
          leadingStockChange: 8.5
        },
        {
          key: '2',
          sector: '医药生物',
          volume: 980000000,
          volumeChange: 32.5,
          stockCount: 142,
          upCount: 89,
          downCount: 53,
          avgChange: 2.8,
          leadingStock: '迈瑞医疗',
          leadingStockChange: 6.2
        },
        {
          key: '3',
          sector: '新能源',
          volume: 1580000000,
          volumeChange: 28.3,
          stockCount: 98,
          upCount: 67,
          downCount: 31,
          avgChange: 4.1,
          leadingStock: '宁德时代',
          leadingStockChange: 5.7
        },
        {
          key: '4',
          sector: '半导体',
          volume: 750000000,
          volumeChange: 25.7,
          stockCount: 87,
          upCount: 54,
          downCount: 33,
          avgChange: 2.3,
          leadingStock: '中芯国际',
          leadingStockChange: 7.8
        },
        {
          key: '5',
          sector: '银行',
          volume: 1100000000,
          volumeChange: -12.3,
          stockCount: 42,
          upCount: 18,
          downCount: 24,
          avgChange: -0.8,
          leadingStock: '招商银行',
          leadingStockChange: 1.2
        },
        {
          key: '6',
          sector: '房地产',
          volume: 650000000,
          volumeChange: -18.5,
          stockCount: 68,
          upCount: 22,
          downCount: 46,
          avgChange: -1.5,
          leadingStock: '万科A',
          leadingStockChange: -2.3
        }
      ];

      setData(mockData);
      setLoading(false);
    }, 500);
  }, []);

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
            color: value > 0 ? '#cf1322' : value < 0 ? '#3f8600' : '#666',
            fontWeight: 'bold'
          }}>
            {value > 0 ? '+' : ''}{value.toFixed(1)}%
          </span>
          {value > 0 ?
            <RiseOutlined style={{ color: '#cf1322' }} /> :
            <FallOutlined style={{ color: '#3f8600' }} />
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
            <span style={{ color: '#cf1322' }}>涨 {record.upCount}</span>
            <span style={{ color: '#3f8600' }}>跌 {record.downCount}</span>
          </div>
          <Progress
            percent={(record.upCount / record.stockCount) * 100}
            size="small"
            showInfo={false}
            strokeColor="#cf1322"
            trailColor="#3f8600"
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
        <Tag color={value > 0 ? 'red' : value < 0 ? 'green' : 'default'}>
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
            color: record.leadingStockChange > 0 ? '#cf1322' : '#3f8600'
          }}>
            {record.leadingStockChange > 0 ? '+' : ''}{record.leadingStockChange.toFixed(2)}%
          </span>
        </Space>
      )
    }
  ];

  // 计算统计数据
  const totalVolume = data.reduce((sum, item) => sum + item.volume, 0);
  const avgVolumeChange = data.length > 0
    ? data.reduce((sum, item) => sum + item.volumeChange, 0) / data.length
    : 0;
  const activeSectors = data.filter(item => item.volumeChange > 20).length;
  const weakSectors = data.filter(item => item.volumeChange < -10).length;

  return (
    <Card
      title={
        <Space>
          <ThunderboltOutlined style={{ color: '#1890ff' }} />
          板块成交量异动分析
        </Space>
      }
      bordered={false}
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
            valueStyle={{ color: avgVolumeChange > 0 ? '#cf1322' : '#3f8600' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="活跃板块"
            value={activeSectors}
            suffix="个"
            valueStyle={{ color: '#cf1322' }}
          />
        </Col>
        <Col span={6}>
          <Statistic
            title="弱势板块"
            value={weakSectors}
            suffix="个"
            valueStyle={{ color: '#3f8600' }}
          />
        </Col>
      </Row>

      {/* 板块列表 */}
      <Table
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={false}
        size="small"
        scroll={{ x: 800, y: 300 }}
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
