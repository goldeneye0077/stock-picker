/**
 * 股票搜索栏组件
 * 提供搜索、日期筛选和刷新功能
 */

import React from 'react';
import { Space, Input, DatePicker, Button, AutoComplete } from 'antd';
import { SearchOutlined, ReloadOutlined, CalendarOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

interface StockSearchBarProps {
  searchQuery: string;
  searchOptions: any[];
  selectedDate: string | null;
  loading: boolean;
  onSearch: (value: string) => void;
  onSearchChange: (value: string) => void;
  onDateChange: (date: any, dateString: string) => void;
  onReset: () => void;
  onRefresh: () => void;
}

export const StockSearchBar: React.FC<StockSearchBarProps> = ({
  searchQuery,
  searchOptions,
  selectedDate,
  loading,
  onSearch,
  onSearchChange,
  onDateChange,
  onReset,
  onRefresh
}) => {
  return (
    <Space wrap style={{ marginBottom: 16 }}>
      <AutoComplete
        value={searchQuery}
        options={searchOptions}
        onSearch={onSearchChange}
        onSelect={onSearch}
        style={{ width: 250 }}
      >
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索股票代码或名称"
          onPressEnter={(e) => onSearch((e.target as HTMLInputElement).value)}
          allowClear
        />
      </AutoComplete>

      <DatePicker
        value={selectedDate ? dayjs(selectedDate) : null}
        onChange={onDateChange}
        placeholder="选择日期"
        format="YYYY-MM-DD"
        prefix={<CalendarOutlined />}
        allowClear
      />

      {selectedDate && (
        <Button
          icon={<ReloadOutlined />}
          onClick={onReset}
        >
          重置日期
        </Button>
      )}

      <Button
        type="primary"
        icon={<ReloadOutlined spin={loading} />}
        onClick={onRefresh}
        loading={loading}
      >
        刷新数据
      </Button>
    </Space>
  );
};
