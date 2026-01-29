/**
 * 股票搜索栏组件
 * 提供搜索、日期筛选和刷新功能
 */

import React from 'react';
import { Space, Input, DatePicker, Button, AutoComplete, Tooltip } from 'antd';
import { SearchOutlined, ReloadOutlined, CalendarOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';

interface StockSearchBarProps {
  searchQuery: string;
  searchOptions: any[];
  selectedDate: string | null;
  loading: boolean;
  onSearch: (value: string) => void;
  onSearchChange: (value: string) => void;
  onDateChange: (date: any, dateString: string | string[]) => void;
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

      <Button
        icon={<LeftOutlined />}
        disabled={!selectedDate}
        onClick={() => {
          if (!selectedDate) return;
          const d = dayjs(selectedDate).subtract(1, 'day');
          onDateChange(d, d.format('YYYY-MM-DD'));
        }}
      />

      <Button
        icon={<RightOutlined />}
        disabled={!selectedDate}
        onClick={() => {
          if (!selectedDate) return;
          const d = dayjs(selectedDate).add(1, 'day');
          onDateChange(d, d.format('YYYY-MM-DD'));
        }}
      />

      {selectedDate && (
        <Button
          icon={<ReloadOutlined />}
          onClick={onReset}
        >
          重置日期
        </Button>
      )}

      <Tooltip title="仅重新拉取列表数据；今日收盘数据需到「设置-数据采集管理」点击「立即更新数据」">
        <Button
          type="primary"
          icon={<ReloadOutlined spin={loading} />}
          onClick={onRefresh}
          loading={loading}
        >
          刷新数据
        </Button>
      </Tooltip>
    </Space>
  );
};
