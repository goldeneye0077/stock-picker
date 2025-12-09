/**
 * 热点板块交叉分析卡片
 * 显示既有资金流入又有成交量异动的热点板块及其龙头股票
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Collapse, Table, Tag, Space, Statistic, Row, Col, Empty, Button, Tooltip, message, Badge, Pagination } from 'antd';
import {
  RiseOutlined,
  FallOutlined,
  FireOutlined,
  TrophyOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  StarFilled
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { fetchHotSectorStocksData } from '../../services/analysisService';

const { Panel } = Collapse;

interface Stock {
  stockCode: string;
  stockName: string;
  price: number;
  volume: number;
  changePercent: number;
  volumeRatio: number;
  mainFundFlow: number;
  score: number;
  rank: number;
}

interface HotSector {
  sectorName: string;
  sectorMoneyFlow: number;
  sectorPctChange: number;
  stocks: Stock[];
}

const HotSectorStocksCardComponent: React.FC = () => {
  const [data, setData] = useState<HotSector[]>([]);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  
  // 分页状态
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // 获取热点板块数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchHotSectorStocksData({ days: 1, limit: 10 });

      if (result.sectors && Array.isArray(result.sectors)) {
        setData(result.sectors);
        setSummary(result.summary);
        message.success(`已加载 ${result.summary.totalSectors} 个热点板块`);
      }
    } catch (error) {
      console.error('Error fetching hot sector stocks data:', error);
      message.error('获取热点板块数据失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 初始加载数据
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 计算当前页数据
  const currentData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // 股票表格列定义
  const stockColumns: ColumnsType<Stock> = [
    {
      title: '排名',
      dataIndex: 'rank',
      key: 'rank',
      width: 60,
      render: (rank: number) => (
        <span style={{ fontWeight: 'bold', color: rank <= 3 ? '#faad14' : '#8c8c8c' }}>
          {rank <= 3 && <StarFilled style={{ marginRight: 4 }} />}
          {rank}
        </span>
      )
    },
    {
      title: '代码',
      dataIndex: 'stockCode',
      key: 'stockCode',
      width: 90
    },
    {
      title: '名称',
      dataIndex: 'stockName',
      key: 'stockName',
      width: 100,
      render: (text: string) => <strong>{text}</strong>
    },
    {
      title: '价格',
      dataIndex: 'price',
      key: 'price',
      width: 80,
      render: (value: number) => `¥${value.toFixed(2)}`
    },
    {
      title: '涨跌幅',
      dataIndex: 'changePercent',
      key: 'changePercent',
      width: 90,
      render: (value: number) => (
        <Tag color={value > 0 ? 'red' : value < 0 ? 'green' : 'default'}>
          {value > 0 ? '+' : ''}{value.toFixed(2)}%
        </Tag>
      ),
      sorter: (a, b) => a.changePercent - b.changePercent
    },
    {
      title: '量比',
      dataIndex: 'volumeRatio',
      key: 'volumeRatio',
      width: 80,
      render: (value: number) => (
        <span style={{ color: value > 2 ? '#cf1322' : '#666' }}>
          {value.toFixed(2)}
        </span>
      ),
      sorter: (a, b) => a.volumeRatio - b.volumeRatio
    },
    {
      title: '主力资金',
      dataIndex: 'mainFundFlow',
      key: 'mainFundFlow',
      width: 100,
      render: (value: number) => (
        <span style={{ color: value > 0 ? '#cf1322' : value < 0 ? '#3f8600' : '#666' }}>
          {value > 0 ? '+' : ''}{(value / 10000).toFixed(0)}万
        </span>
      ),
      sorter: (a, b) => a.mainFundFlow - b.mainFundFlow
    },
    {
      title: '综合评分',
      dataIndex: 'score',
      key: 'score',
      width: 90,
      render: (value: number) => (
        <Tag color={value > 5 ? 'red' : value > 3 ? 'orange' : 'blue'}>
          {value.toFixed(1)}
        </Tag>
      ),
      sorter: (a, b) => a.score - b.score
    }
  ];

  return (
    <Card
      title={
        <Space>
          <FireOutlined style={{ color: '#ff4d4f' }} />
          热点板块龙头股票
          <Tooltip
            title={
              <div style={{ fontSize: '12px' }}>
                <div><strong>功能说明：</strong></div>
                <div>• 交叉分析：同时满足资金流入 + 成交量异动的板块</div>
                <div>• 龙头股票：板块内综合评分最高的前10只股票</div>
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #444' }}>
                  <strong>综合评分算法：</strong><br/>
                  • 涨跌幅权重：40%<br/>
                  • 量比权重：30%<br/>
                  • 主力资金权重：30%<br/>
                  评分越高表示该股越活跃
                </div>
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
      {summary && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Statistic
              title="热点板块数"
              value={summary.totalSectors}
              suffix="个"
              valueStyle={{ color: '#ff4d4f' }}
              prefix={<FireOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="龙头股票数"
              value={summary.totalStocks}
              suffix="只"
              valueStyle={{ color: '#1890ff' }}
              prefix={<TrophyOutlined />}
            />
          </Col>
          <Col span={8}>
            <Statistic
              title="平均资金流入"
              value={(summary.avgSectorMoneyFlow / 100000000).toFixed(2)}
              suffix="亿"
              valueStyle={{ color: '#52c41a' }}
              prefix={<RiseOutlined />}
            />
          </Col>
        </Row>
      )}

      {/* 板块列表 */}
      {data.length > 0 ? (
        <>
          <Collapse
            accordion
            ghost
            expandIcon={({ isActive }) => isActive ? <FireOutlined /> : <TrophyOutlined />}
          >
            {currentData.map((sector, index) => (
              <Panel
                header={
                  <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space>
                      <Badge count={(currentPage - 1) * pageSize + index + 1} style={{ backgroundColor: '#1890ff' }} />
                      <strong style={{ fontSize: '16px' }}>{sector.sectorName}</strong>
                    </Space>
                    <Space>
                      <Tag color="blue">
                        涨跌: {sector.sectorPctChange > 0 ? '+' : ''}{sector.sectorPctChange.toFixed(2)}%
                      </Tag>
                      <Tag color={sector.sectorMoneyFlow > 0 ? 'red' : 'green'}>
                        资金: {(sector.sectorMoneyFlow / 100000000).toFixed(2)}亿
                      </Tag>
                    </Space>
                  </Space>
                }
                key={sector.sectorName}
              >
                <Table
                  columns={stockColumns}
                  dataSource={sector.stocks.map((stock, idx) => ({ ...stock, key: idx }))}
                  pagination={false}
                  size="small"
                  scroll={{ x: 800 }}
                />
              </Panel>
            ))}
          </Collapse>
          
          {/* 分页器 */}
          <Pagination
            current={currentPage}
            total={data.length}
            pageSize={pageSize}
            onChange={(page, size) => {
              setCurrentPage(page);
              if (size) setPageSize(size);
            }}
            onShowSizeChange={(current, size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            style={{ marginTop: 16, textAlign: 'right' }}
            showSizeChanger
            pageSizeOptions={['5', '10', '20']}
            showTotal={(total) => `共 ${total} 个板块`}
          />
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={loading ? '正在加载数据...' : '暂无热点板块数据'}
        />
      )}
    </Card>
  );
};

// 使用命名导出以保持与项目其他组件的一致性
export const HotSectorStocksCard = HotSectorStocksCardComponent;
