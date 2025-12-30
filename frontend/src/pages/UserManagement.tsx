import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, Form, Input, Modal, Space, Switch, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, SettingOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import type { AuthUser } from '../services/authService';
import { adminCreateUser, adminListUsers, adminPages, adminUpdatePermissions, adminUpdateUser } from '../services/authService';

const { Title, Text } = Typography;

type UserRow = AuthUser & { createdAt?: string };

const UserManagement: React.FC = () => {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pages, setPages] = useState<string[]>([]);

  const [permModalOpen, setPermModalOpen] = useState(false);
  const [permUser, setPermUser] = useState<UserRow | null>(null);
  const [permPaths, setPermPaths] = useState<string[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [usersRes, pagesRes] = await Promise.all([adminListUsers(token), adminPages(token)]);
      setUsers(usersRes.data.users);
      setPages(pagesRes.data.pages);
    } catch (e: any) {
      message.error(e?.message || '加载用户数据失败');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const pageOptions = useMemo(() => pages.map((p) => ({ label: p, value: p })), [pages]);

  const openPermModal = (row: UserRow) => {
    setPermUser(row);
    setPermPaths(row.permissions || []);
    setPermModalOpen(true);
  };

  const savePermissions = async () => {
    if (!token || !permUser) return;
    try {
      await adminUpdatePermissions(token, permUser.id, permPaths);
      message.success('权限已更新');
      setPermModalOpen(false);
      setPermUser(null);
      await loadAll();
    } catch (e: any) {
      message.error(e?.message || '更新权限失败');
    }
  };

  const toggleActive = async (row: UserRow, checked: boolean) => {
    if (!token) return;
    try {
      await adminUpdateUser(token, row.id, { isActive: checked });
      setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, isActive: checked } : u)));
    } catch (e: any) {
      message.error(e?.message || '更新状态失败');
    }
  };

  const toggleAdmin = async (row: UserRow, checked: boolean) => {
    if (!token) return;
    try {
      await adminUpdateUser(token, row.id, { isAdmin: checked });
      setUsers((prev) => prev.map((u) => (u.id === row.id ? { ...u, isAdmin: checked } : u)));
    } catch (e: any) {
      message.error(e?.message || '更新管理员状态失败');
    }
  };

  const createUser = async () => {
    if (!token) return;
    try {
      const values = await createForm.validateFields();
      await adminCreateUser(token, {
        username: values.username,
        password: values.password,
        isAdmin: !!values.isAdmin,
        isActive: values.isActive !== false,
      });
      message.success('用户已创建');
      setCreateOpen(false);
      createForm.resetFields();
      await loadAll();
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '创建用户失败');
    }
  };

  const columns: ColumnsType<UserRow> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      width: 180,
    },
    {
      title: '管理员',
      dataIndex: 'isAdmin',
      key: 'isAdmin',
      width: 100,
      render: (val: boolean, row) => (
        <Switch checked={!!val} onChange={(checked) => toggleAdmin(row, checked)} size="small" />
      ),
    },
    {
      title: '启用',
      dataIndex: 'isActive',
      key: 'isActive',
      width: 100,
      render: (val: boolean, row) => (
        <Switch checked={!!val} onChange={(checked) => toggleActive(row, checked)} size="small" />
      ),
    },
    {
      title: '可访问页面',
      dataIndex: 'permissions',
      key: 'permissions',
      render: (val: string[], row) => (
        <Space size={[4, 4]} wrap>
          {(val || []).slice(0, 6).map((p) => (
            <Tag key={p} color="blue">{p}</Tag>
          ))}
          {(val || []).length > 6 && <Text type="secondary">+{(val || []).length - 6}</Text>}
          <Button size="small" icon={<SettingOutlined />} onClick={() => openPermModal(row)}>
            配置
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card
        title={<Title level={4} style={{ margin: 0 }}>用户管理</Title>}
        extra={
          <Button icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        }
      >
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={users}
          pagination={false}
        />
      </Card>

      <Modal
        title={`权限配置 - ${permUser?.username || ''}`}
        open={permModalOpen}
        onCancel={() => {
          setPermModalOpen(false);
          setPermUser(null);
        }}
        onOk={savePermissions}
        okText="保存"
      >
        <Checkbox.Group
          options={pageOptions}
          value={permPaths}
          onChange={(v) => setPermPaths(v as string[])}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        />
      </Modal>

      <Modal
        title="新建用户"
        open={createOpen}
        onCancel={() => {
          setCreateOpen(false);
          createForm.resetFields();
        }}
        onOk={createUser}
        okText="创建"
      >
        <Form form={createForm} layout="vertical" initialValues={{ isActive: true, isAdmin: false }}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="isAdmin" label="管理员" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="isActive" label="启用" valuePropName="checked">
            <Switch defaultChecked />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;

