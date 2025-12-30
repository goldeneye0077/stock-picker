import React, { useEffect } from 'react';
import { Button, Card, Form, Input, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const { Title, Text, Link } = Typography;

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { doLogin, firstAllowedPath, user, loading } = useAuth();

  useEffect(() => {
    if (!loading && user) {
      navigate(firstAllowedPath(), { replace: true });
    }
  }, [loading, user, navigate, firstAllowedPath]);

  const onFinish = async (values: { username: string; password: string }) => {
    try {
      await doLogin(values.username, values.password);
      navigate(firstAllowedPath(), { replace: true });
    } catch (e: any) {
      message.error(e?.message || '登录失败');
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <Card style={{ width: 380 }}>
        <Title level={4} style={{ marginTop: 0 }}>登录</Title>
        <Form form={form} layout="vertical" onFinish={onFinish} autoComplete="off">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="请输入用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="请输入密码" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block>登录</Button>
          </Form.Item>
        </Form>
        <Text type="secondary">
          没有账号？ <Link onClick={() => navigate('/register')}>去注册</Link>
        </Text>
      </Card>
    </div>
  );
};

export default Login;
