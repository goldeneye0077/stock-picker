/**
 * 成交量异动卡片组件
 * 显示成交量异动股票列表及筛选功能
 * 性能优化：使用 useCallback 和 React.memo
 */

import React, { useCallback } from 'react';
import { Card, List, Tag, Space, Button, Typography } from 'antd';
import { FireOutlined, SyncOutlined } from '@ant-design/icons';
import { useVolumeAnalysis } from '../../hooks/useVolumeAnalysis';
import { FilterBar } from './FilterBar';

const { Title, Text } = Typography;

const VolumeAnalysisCardComponent: React.FC = () => {
  const { data, loading, params, fetchData, updateParams, resetParams } = useVolumeAnalysis();

  // 使用 useCallback 优化 renderItem，避免每次渲染都创建新函数
  const renderItem = useCallback((item: any) => (
    <List.Item>
      <List.Item.Meta
        title={
          <Space>
            <Text strong>{item.stock}</Text>
            <Text>{item.name}</Text>
          </Space>
        }
        description={
          <Space wrap>
            <Tag color="red">量比: {item.volumeRatio?.toFixed(2)}</Tag>
            <Tag color={item.changePercent >= 0 ? 'green' : 'red'}>
              涨幅: {item.changePercent >= 0 ? '+' : ''}{item.changePercent?.toFixed(2)}%
            </Tag>
            {item.price && (
              <Tag color="blue">价格: ¥{item.price?.toFixed(2)}</Tag>
            )}
            {item.date && (
              <Text type="secondary">{item.date}</Text>
            )}
          </Space>
        }
      />
    </List.Item>
  ), []);

  return (
    <Card
      title={
        <Space>
          <FireOutlined />
          <Title level={5} style={{ margin: 0 }}>成交量异动分析</Title>
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
      <FilterBar
        params={params}
        onUpdate={updateParams}
        onReset={resetParams}
        showBoard={true}
        showExchange={true}
        showStockSearch={true}
        showDays={true}
      />

      <List
        loading={loading}
        dataSource={data}
        renderItem={renderItem}
        locale={{ emptyText: '暂无成交量异动数据' }}
        pagination={data.length > 10 ? { pageSize: 10, showSizeChanger: true } : false}
      />
    </Card>
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const VolumeAnalysisCard = React.memo(VolumeAnalysisCardComponent);
