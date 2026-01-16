import React, { useEffect } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/authService';

const { Title, Text, Link } = Typography;

const Register: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { doRegister, firstAllowedPath, user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate(firstAllowedPath(), { replace: true });
    }
  }, [loading, user, navigate, firstAllowedPath]);

  const onFinish = async (values: { username: string; password: string; confirm: string }) => {
    try {
      await doRegister(values.username, values.password);
      navigate(firstAllowedPath(), { replace: true });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        message.warning('用户名已存在，请直接登录');
        navigate(`/login?username=${encodeURIComponent(values.username)}`, { replace: true });
        return;
      }
      message.error(e?.message || '注册失败');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: 380 }}>
        <Title level={4} style={{ marginTop: 0 }}>注册</Title>
        <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }, { min: 6, message: '密码至少6位' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="确认密码"
            dependencies={['password']}
            rules={[
              { required: true, message: '请再次输入密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) return Promise.resolve();
                  return Promise.reject(new Error('两次输入的密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password placeholder="请再次输入密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block>注册</Button>
          </Form.Item>
        </Form>
        <Text type="secondary">
          已有账号？ <Link onClick={() => navigate('/login')}>去登录</Link>
        </Text>
      </Card>
    </div>
  );
};

export default Register;
