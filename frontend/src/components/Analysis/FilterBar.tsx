/**
 * 筛选条件组件
 * 提供通用的筛选参数输入界面
 */

import React from 'react';
import { Form, InputNumber, Select, Input, Space, Button } from 'antd';
import { FilterOutlined, ReloadOutlined } from '@ant-design/icons';

const { Option } = Select;

interface FilterBarProps {
  params: any;
  onUpdate: (params: any) => void;
  onReset?: () => void;
  showBoard?: boolean;
  showExchange?: boolean;
  showStockSearch?: boolean;
  showDays?: boolean;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  params,
  onUpdate,
  onReset,
  showBoard = true,
  showExchange = true,
  showStockSearch = true,
  showDays = true
}) => {
  return (
    <div style={{ marginBottom: 16, padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
      <Space wrap>
        <FilterOutlined style={{ color: '#1890ff' }} />

        {showDays && (
          <Form.Item label="天数" style={{ marginBottom: 0 }}>
            <InputNumber
              min={1}
              max={365}
              value={params.days || 10}
              onChange={(value) => onUpdate({ days: value })}
              style={{ width: 100 }}
            />
          </Form.Item>
        )}

        {showBoard && (
          <Form.Item label="板块" style={{ marginBottom: 0 }}>
            <Select
              value={params.board || 'all'}
              onChange={(value) => onUpdate({ board: value === 'all' ? undefined : value })}
              style={{ width: 120 }}
            >
              <Option value="all">全部</Option>
              <Option value="主板">主板</Option>
              <Option value="创业板">创业板</Option>
              <Option value="科创板">科创板</Option>
            </Select>
          </Form.Item>
        )}

        {showExchange && (
          <Form.Item label="交易所" style={{ marginBottom: 0 }}>
            <Select
              value={params.exchange || 'all'}
              onChange={(value) => onUpdate({ exchange: value === 'all' ? undefined : value })}
              style={{ width: 120 }}
            >
              <Option value="all">全部</Option>
              <Option value="SH">上交所</Option>
              <Option value="SZ">深交所</Option>
            </Select>
          </Form.Item>
        )}

        {showStockSearch && (
          <Form.Item label="股票搜索" style={{ marginBottom: 0 }}>
            <Input
              placeholder="股票代码或名称"
              value={params.stockSearch || ''}
              onChange={(e) => onUpdate({ stockSearch: e.target.value || undefined })}
              style={{ width: 150 }}
              allowClear
            />
          </Form.Item>
        )}

        {onReset && (
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={onReset}
          >
            重置
          </Button>
        )}
      </Space>
    </div>
  );
};
