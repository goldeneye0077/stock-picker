import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Descriptions,
  Empty,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { MailOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import {
  adminListContactMessages,
  adminUpdateContactMessageStatus,
  type ContactMessageItem,
  type ContactMessageStatus,
} from '../services/authService';
import FigmaPageHero from '../components/FigmaPageHero';
import FigmaCard from '../components/FigmaCard';
import { FigmaBorderRadius } from '../styles/FigmaDesignTokens';

const { Text, Paragraph } = Typography;

const STATUS_META: Record<ContactMessageStatus, { label: string; color: string }> = {
  new: { label: '新留言', color: 'blue' },
  in_progress: { label: '处理中', color: 'processing' },
  resolved: { label: '已解决', color: 'success' },
  archived: { label: '已归档', color: 'default' },
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', { hour12: false });
}

const ContactManagement: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [rows, setRows] = useState<ContactMessageItem[]>([]);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | ContactMessageStatus>('all');
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [activeRow, setActiveRow] = useState<ContactMessageItem | null>(null);

  const loadMessages = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await adminListContactMessages(token, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setRows(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch (err: any) {
      message.error(err?.message || '加载留言失败');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter, token]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const filteredRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((item) =>
      [item.name, item.email, item.subject || '', item.message, item.source_page || '']
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [keyword, rows]);

  const statusOptions = useMemo(
    () =>
      (Object.keys(STATUS_META) as ContactMessageStatus[]).map((status) => ({
        label: STATUS_META[status].label,
        value: status,
      })),
    []
  );

  const handleChangeStatus = async (row: ContactMessageItem, nextStatus: ContactMessageStatus) => {
    if (!token || row.status === nextStatus) return;
    setUpdatingId(row.id);
    try {
      await adminUpdateContactMessageStatus(token, row.id, nextStatus);
      message.success('留言状态已更新');
      await loadMessages();
    } catch (err: any) {
      message.error(err?.message || '更新留言状态失败');
    } finally {
      setUpdatingId(null);
    }
  };

  const columns: ColumnsType<ContactMessageItem> = [
    {
      title: '时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => <Text className="sq-mono">{formatDateTime(value)}</Text>,
    },
    {
      title: '留言人',
      dataIndex: 'name',
      width: 220,
      render: (_: string, row) => (
        <Space direction="vertical" size={2}>
          <Text strong>{row.name}</Text>
          <Text type="secondary">{row.email}</Text>
        </Space>
      ),
    },
    {
      title: '主题',
      dataIndex: 'subject',
      width: 220,
      render: (value: string | null) => value || <Text type="secondary">未填写</Text>,
    },
    {
      title: '留言内容',
      dataIndex: 'message',
      render: (value: string, row) => (
        <Space size={8} align="start">
          <Paragraph style={{ marginBottom: 0, maxWidth: 420 }} ellipsis={{ rows: 2, tooltip: value }}>
            {value}
          </Paragraph>
          <Button size="small" onClick={() => setActiveRow(row)}>
            详情
          </Button>
        </Space>
      ),
    },
    {
      title: '来源页',
      dataIndex: 'source_page',
      width: 180,
      render: (value: string | null) => (
        <Text type="secondary" className="sq-mono">
          {value || '-'}
        </Text>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 210,
      render: (value: ContactMessageStatus, row) => (
        <Space size={8}>
          <Tag color={STATUS_META[value].color}>{STATUS_META[value].label}</Tag>
          <Select
            size="small"
            value={value}
            options={statusOptions}
            style={{ width: 120 }}
            loading={updatingId === row.id}
            disabled={updatingId === row.id}
            onChange={(nextValue) => void handleChangeStatus(row, nextValue)}
          />
        </Space>
      ),
    },
  ];

  return (
    <div className="sq-figma-page">
      <FigmaPageHero
        icon={<MailOutlined style={{ fontSize: 18 }} />}
        title="留言管理"
        subTitle="集中处理用户留言，跟踪状态并快速响应。"
        actions={(
          <Space>
            <Select
              value={statusFilter}
              style={{ width: 140 }}
              options={[
                { label: '全部状态', value: 'all' },
                ...statusOptions,
              ]}
              onChange={(value) => {
                setStatusFilter(value);
                setPage(1);
              }}
            />
            <Button
              icon={<ReloadOutlined />}
              style={{ borderRadius: FigmaBorderRadius.lg }}
              onClick={() => void loadMessages()}
            >
              刷新
            </Button>
          </Space>
        )}
      />

      <FigmaCard style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            borderBottom: '1px solid color-mix(in srgb, var(--sq-border) 60%, transparent)',
          }}
        >
          <Space size={10} align="center">
            <Text style={{ color: 'var(--sq-text-secondary)' }}>当前记录</Text>
            <Text style={{ fontSize: 18, fontWeight: 700, color: 'var(--sq-primary)' }}>{filteredRows.length}</Text>
            <Text style={{ color: 'var(--sq-text-secondary)' }}>条（总计 {total} 条）</Text>
          </Space>
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--sq-text-tertiary)' }} />}
            placeholder="当前页搜索：姓名 / 邮箱 / 主题 / 内容"
            style={{ width: 360, maxWidth: '100%', borderRadius: FigmaBorderRadius.lg }}
          />
        </div>

        <Table<ContactMessageItem>
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={filteredRows}
          locale={{ emptyText: <Empty description="暂无留言数据" /> }}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            showTotal: (count) => `共 ${count} 条`,
            onChange: (nextPage, nextPageSize) => {
              setPage(nextPage);
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize);
                setPage(1);
              }
            },
          }}
        />
      </FigmaCard>

      <Modal
        title={activeRow ? `留言详情 #${activeRow.id}` : '留言详情'}
        open={!!activeRow}
        onCancel={() => setActiveRow(null)}
        footer={[
          <Button key="close" onClick={() => setActiveRow(null)}>
            关闭
          </Button>,
        ]}
        width={820}
      >
        {activeRow ? (
          <Descriptions bordered column={2} size="small">
            <Descriptions.Item label="姓名">{activeRow.name}</Descriptions.Item>
            <Descriptions.Item label="邮箱">{activeRow.email}</Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={STATUS_META[activeRow.status].color}>{STATUS_META[activeRow.status].label}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="来源页">
              <Text className="sq-mono">{activeRow.source_page || '-'}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">{formatDateTime(activeRow.created_at)}</Descriptions.Item>
            <Descriptions.Item label="更新时间">{formatDateTime(activeRow.updated_at)}</Descriptions.Item>
            <Descriptions.Item label="主题" span={2}>
              {activeRow.subject || <Text type="secondary">未填写</Text>}
            </Descriptions.Item>
            <Descriptions.Item label="留言内容" span={2}>
              <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{activeRow.message}</Paragraph>
            </Descriptions.Item>
          </Descriptions>
        ) : null}
      </Modal>
    </div>
  );
};

export default ContactManagement;
