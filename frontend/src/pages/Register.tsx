import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Typography, message, Checkbox, Divider, Spin, Progress } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../services/authService';
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import './AuthPages.css';

const { Title, Text, Paragraph } = Typography;

// 密码强度计算
const getPasswordStrength = (password: string): { score: number; text: string; color: string } => {
  if (!password) return { score: 0, text: '', color: '' };

  let score = 0;
  if (password.length >= 6) score += 20;
  if (password.length >= 8) score += 10;
  if (password.length >= 12) score += 10;
  if (/[a-z]/.test(password)) score += 15;
  if (/[A-Z]/.test(password)) score += 15;
  if (/[0-9]/.test(password)) score += 15;
  if (/[^a-zA-Z0-9]/.test(password)) score += 15;

  if (score <= 30) return { score, text: '弱', color: '#ff4d4f' };
  if (score <= 60) return { score, text: '中', color: '#faad14' };
  if (score <= 80) return { score, text: '强', color: '#52c41a' };
  return { score: 100, text: '非常强', color: '#1890ff' };
};

const Register: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const { doRegister, firstAllowedPath, user, loading: authLoading } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState<{ score: number; text: string; color: string }>({
    score: 0,
    text: '',
    color: '',
  });
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      navigate(firstAllowedPath(), { replace: true });
    }
  }, [authLoading, user, navigate, firstAllowedPath]);

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPasswordStrength(getPasswordStrength(e.target.value));
  };

  const onFinish = async (values: { username: string; password: string; confirm: string }) => {
    if (!agreedToTerms) {
      message.warning('请先阅读并同意用户协议');
      return;
    }

    setSubmitting(true);
    try {
      await doRegister(values.username, values.password);
      message.success('注册成功！');
      navigate(firstAllowedPath(), { replace: true });
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 409) {
        message.warning('用户名已存在，请直接登录');
        navigate(`/login?username=${encodeURIComponent(values.username)}`, { replace: true });
        return;
      }
      message.error(e?.message || '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="auth-loading">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="auth-container">
      {/* 左侧品牌展示区 */}
      <div className="auth-brand-section">
        <div className="auth-brand-content">
          <div className="auth-brand-logo">
            <img src="/logo.png" alt="QuantWhale Logo" className="auth-logo-img" />
            <Title level={1} className="auth-brand-title">
              量鲸 QuantWhale
            </Title>
          </div>
          <Paragraph className="auth-brand-slogan">
            智能量化选股平台
          </Paragraph>
          <div className="auth-register-benefits">
            <Title level={4} className="auth-benefits-title">注册即享</Title>
            <div className="auth-benefit-item">
              <CheckCircleOutlined className="auth-benefit-icon" />
              <Text>免费使用基础选股功能</Text>
            </div>
            <div className="auth-benefit-item">
              <CheckCircleOutlined className="auth-benefit-icon" />
              <Text>每日智能选股推荐</Text>
            </div>
            <div className="auth-benefit-item">
              <CheckCircleOutlined className="auth-benefit-icon" />
              <Text>技术分析与基本面数据</Text>
            </div>
            <div className="auth-benefit-item">
              <CheckCircleOutlined className="auth-benefit-icon" />
              <Text>自定义股票自选列表</Text>
            </div>
            <div className="auth-benefit-item">
              <CheckCircleOutlined className="auth-benefit-icon" />
              <Text>实时市场资讯推送</Text>
            </div>
          </div>
        </div>
        <div className="auth-brand-footer">
          <Text type="secondary">© 2024 QuantWhale. All rights reserved.</Text>
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="auth-form-section">
        <div className="auth-form-container">
          <div className="auth-form-header">
            <Title level={2} className="auth-form-title">创建账户</Title>
            <Text type="secondary" className="auth-form-subtitle">
              加入量鲸，探索智能量化投资的无限可能
            </Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
            className="auth-form"
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
                { max: 20, message: '用户名最多20个字符' },
                { pattern: /^[a-zA-Z0-9_]+$/, message: '用户名只能包含字母、数字和下划线' },
              ]}
            >
              <Input
                prefix={<UserOutlined className="auth-input-icon" />}
                placeholder="请输入用户名（3-20个字符）"
                className="auth-input"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6位' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="auth-input-icon" />}
                placeholder="请设置登录密码（至少6位）"
                className="auth-input"
                onChange={handlePasswordChange}
              />
            </Form.Item>

            {passwordStrength.text && (
              <div className="auth-password-strength">
                <Text type="secondary" style={{ marginRight: 8 }}>密码强度：</Text>
                <Progress
                  percent={passwordStrength.score}
                  size="small"
                  strokeColor={passwordStrength.color}
                  format={() => <Text style={{ color: passwordStrength.color }}>{passwordStrength.text}</Text>}
                  style={{ width: 180 }}
                />
              </div>
            )}

            <Form.Item
              name="confirm"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value || getFieldValue('password') === value) {
                      return Promise.resolve();
                    }
                    return Promise.reject(new Error('两次输入的密码不一致'));
                  },
                }),
              ]}
            >
              <Input.Password
                prefix={<SafetyCertificateOutlined className="auth-input-icon" />}
                placeholder="请再次输入密码"
                className="auth-input"
              />
            </Form.Item>

            <Form.Item>
              <Checkbox
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="auth-terms-checkbox"
              >
                <Text type="secondary">
                  我已阅读并同意{' '}
                  <a onClick={(e) => { e.preventDefault(); window.open('/user-agreement', '_blank'); }}>
                    《用户服务协议》
                  </a>
                  {' '}和{' '}
                  <a onClick={(e) => { e.preventDefault(); window.open('/privacy-policy', '_blank'); }}>
                    《隐私政策》
                  </a>
                </Text>
              </Checkbox>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                disabled={!agreedToTerms}
                className="auth-submit-btn"
              >
                {submitting ? '注册中...' : '立即注册'}
              </Button>
            </Form.Item>
          </Form>

          <Divider plain className="auth-divider">
            <Text type="secondary">快速注册</Text>
          </Divider>

          <div className="auth-social-btns">
            <Button
              className="auth-social-btn"
              onClick={() => message.info('企业微信注册功能开发中')}
            >
              企业微信
            </Button>
            <Button
              className="auth-social-btn"
              onClick={() => message.info('钉钉注册功能开发中')}
            >
              钉钉
            </Button>
          </div>

          <div className="auth-switch-prompt">
            <Text type="secondary">已有账号？</Text>
            <a onClick={() => navigate('/login')} className="auth-switch-link">
              立即登录
            </a>
          </div>
        </div>
      </div>

      {/* 动态背景粒子效果 */}
      <div className="auth-bg-particles">
        <div className="auth-particle auth-particle-1"></div>
        <div className="auth-particle auth-particle-2"></div>
        <div className="auth-particle auth-particle-3"></div>
        <div className="auth-particle auth-particle-4"></div>
        <div className="auth-particle auth-particle-5"></div>
      </div>
    </div>
  );
};

export default Register;
