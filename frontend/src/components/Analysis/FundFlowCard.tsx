/**
 * 资金流向卡片组件
 * 显示主力资金、机构资金、散户资金的流向情况
 * 性能优化：使用 useCallback 和 React.memo
 */

import React, { useCallback } from 'react';
import { Card, List, Progress, Space, Button, Typography } from 'antd';
import { FundOutlined, SyncOutlined } from '@ant-design/icons';
import { useFundFlow } from '../../hooks/useFundFlow';

const { Title } = Typography;

const FundFlowCardComponent: React.FC = () => {
  const { data, loading, fetchData } = useFundFlow({ days: 30 });

  // 使用 useCallback 优化 renderItem，避免每次渲染都创建新函数
  const renderItem = useCallback((item: any) => (
    <List.Item>
      <div style={{ width: '100%' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 8
        }}>
          <span>{item.type}</span>
          <span style={{ fontWeight: 'bold' }}>{item.amount}</span>
        </div>
        <Progress
          percent={item.percent}
          strokeColor={item.color}
          showInfo={false}
        />
      </div>
    </List.Item>
  ), []);

  return (
    <Card
      title={
        <Space>
          <FundOutlined />
          <Title level={5} style={{ margin: 0 }}>资金流向分析</Title>
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
      <List
        loading={loading}
        dataSource={data}
        renderItem={renderItem}
      />
    </Card>
  );
};

// 使用 React.memo 优化组件性能，避免不必要的重新渲染
export const FundFlowCard = React.memo(FundFlowCardComponent);
