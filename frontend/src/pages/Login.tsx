import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Typography, message, Checkbox, Divider, Spin } from 'antd';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  UserOutlined,
  LockOutlined,
  SafetyCertificateOutlined,
  RocketOutlined,
  ThunderboltOutlined,
  LineChartOutlined,
} from '@ant-design/icons';
import './AuthPages.css';

const { Title, Text, Paragraph } = Typography;

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const location = useLocation();
  const { doLogin, user, loading: authLoading } = useAuth();

  /* 状态定义 */
  const [submitting, setSubmitting] = useState(false);
  const [requiresCaptcha, setRequiresCaptcha] = useState(false);
  const [captchaCode, setCaptchaCode] = useState<string>(''); // 用于在UI显示的验证码
  const [errorMessage, setErrorMessage] = useState<string>(''); // 备用的行内错误提示

  // 刷新验证码
  const refreshCaptcha = async () => {
    try {
      const res = await fetch('/api/auth/captcha').then(r => r.json());
      if (res.success && res.data?.captcha) {
        setCaptchaCode(res.data.captcha);
        // 同时稍微提示一下，双重保障
        console.log('Captcha:', res.data.captcha);
      }
    } catch (e) {
      console.error('Failed to fetch captcha:', e);
    }
  };

  useEffect(() => {
    if (!authLoading && user) {
      navigate('/', { replace: true });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    const username = new URLSearchParams(location.search).get('username');
    if (username) {
      form.setFieldsValue({ username });
    }
  }, [location.search, form]);

  // 当需要验证码时，自动刷新一次
  useEffect(() => {
    if (requiresCaptcha) {
      refreshCaptcha();
    }
  }, [requiresCaptcha]);

  const onFinish = async (values: { username: string; password: string; captcha?: string }) => {
    setSubmitting(true);
    setErrorMessage(''); // 清除旧错误
    try {
      await doLogin(values.username, values.password, values.captcha);
      message.success('登录成功，欢迎回来！');
      navigate('/', { replace: true });
    } catch (e: any) {
      // 优先获取后端返回的具体错误消息，并回退到通用错误
      // 后端返回结构通常为 { success: false, message: "...", details: {...} }
      // ApiError 封装后可能是 e.message 或 e.body.message
      const msg = e?.body?.message || e?.message || '登录失败，请检查网络或重试';

      message.error(msg);
      setErrorMessage(msg); // 同时在表单下方显示红色错误文字，防止message被忽略

      // 检查是否需要验证码 (根据后端返回的details或错误码)
      // 后端逻辑: if (requiresCaptcha) throw new AppError(..., { requiresCaptcha: true })
      const details = e?.body?.details || e?.details;
      // 支持两种判断方式：后端明确标记 requiresCaptcha 或 HTTP 429
      if (details?.requiresCaptcha || e?.status === 429) {
        if (!requiresCaptcha) {
          setRequiresCaptcha(true);
          // 首次出现验证码时，清空密码让用户重输（安全考虑）
        }
        refreshCaptcha(); // 刷新验证码
        form.setFieldValue('captcha', '');
      }
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
          <div className="auth-features">
            <div className="auth-feature-item">
              <ThunderboltOutlined className="auth-feature-icon" />
              <div className="auth-feature-text">
                <Text strong>极速选股</Text>
                <Text type="secondary">毫秒级多维度筛选</Text>
              </div>
            </div>
            <div className="auth-feature-item">
              <LineChartOutlined className="auth-feature-icon" />
              <div className="auth-feature-text">
                <Text strong>智能分析</Text>
                <Text type="secondary">AI 驱动的技术分析</Text>
              </div>
            </div>
            <div className="auth-feature-item">
              <SafetyCertificateOutlined className="auth-feature-icon" />
              <div className="auth-feature-text">
                <Text strong>安全可靠</Text>
                <Text type="secondary">企业级数据安全</Text>
              </div>
            </div>
            <div className="auth-feature-item">
              <RocketOutlined className="auth-feature-icon" />
              <div className="auth-feature-text">
                <Text strong>持续进化</Text>
                <Text type="secondary">策略实时更新优化</Text>
              </div>
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
            <Title level={2} className="auth-form-title">欢迎回来</Title>
            <Text type="secondary" className="auth-form-subtitle">
              登录您的账户，开启智能选股之旅
            </Text>
          </div>

          <Form
            form={form}
            layout="vertical"
            onFinish={onFinish}
            autoComplete="off"
            size="large"
            className="auth-form"
            initialValues={{ remember: true }}
          >
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
              ]}
            >
              <Input
                prefix={<UserOutlined className="auth-input-icon" />}
                placeholder="请输入用户名"
                className="auth-input"
              />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
              ]}
            >
              <Input.Password
                prefix={<LockOutlined className="auth-input-icon" />}
                placeholder="请输入密码"
                className="auth-input"
              />
            </Form.Item>

            {requiresCaptcha && (
              <Form.Item
                label="安全验证"
                required
                style={{ marginBottom: 24 }}
              >
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <Form.Item
                    name="captcha"
                    noStyle
                    rules={[{ required: true, message: '请输入验证码' }]}
                  >
                    <Input
                      prefix={<SafetyCertificateOutlined className="auth-input-icon" />}
                      placeholder="输入验证码"
                      className="auth-input"
                      style={{ flex: 1 }}
                    />
                  </Form.Item>

                  {/* 模拟图形验证码与刷新按钮 */}
                  <div
                    onClick={refreshCaptcha}
                    style={{
                      width: 140,
                      height: 48,
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--sq-border)',
                      borderRadius: 10,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      userSelect: 'none',
                      position: 'relative',
                      overflow: 'hidden',
                      flexShrink: 0
                    }}
                    title="点击刷新验证码"
                  >
                    {captchaCode ? (
                      <div
                        dangerouslySetInnerHTML={{ __html: captchaCode }}
                        style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      />
                    ) : (
                      <Spin size="small" />
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 4, textAlign: 'right' }}>
                  <Text type="secondary" style={{ fontSize: 12, cursor: 'pointer' }} onClick={refreshCaptcha}>
                    看不清？换一张
                  </Text>
                </div>
              </Form.Item>
            )}

            {/* 行内错误提示，确保用户能看到 */}
            {errorMessage && (
              <div style={{
                marginBottom: 20,
                color: '#ff4d4f',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                background: 'rgba(255, 77, 79, 0.12)',
                border: '1px solid rgba(255, 77, 79, 0.2)',
                borderRadius: 8,
                fontSize: 14
              }}>
                <SafetyCertificateOutlined style={{ fontSize: 16 }} />
                <span>{errorMessage}</span>
              </div>
            )}

            <Form.Item>
              <div className="auth-form-options">
                <Form.Item name="remember" valuePropName="checked" noStyle>
                  <Checkbox>记住我</Checkbox>
                </Form.Item>
                <a className="auth-forgot-link" onClick={() => message.info('请联系管理员重置密码')}>
                  忘记密码？
                </a>
              </div>
            </Form.Item>

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={submitting}
                className="auth-submit-btn"
              >
                {submitting ? '登录中...' : '立即登录'}
              </Button>
            </Form.Item>
          </Form>

          <Divider plain className="auth-divider">
            <Text type="secondary">其他登录方式</Text>
          </Divider>

          <div className="auth-social-btns">
            <Button
              className="auth-social-btn"
              onClick={() => message.info('企业微信登录功能开发中')}
            >
              企业微信
            </Button>
            <Button
              className="auth-social-btn"
              onClick={() => message.info('钉钉登录功能开发中')}
            >
              钉钉
            </Button>
          </div>

          <div className="auth-switch-prompt">
            <Text type="secondary">还没有账号？</Text>
            <a onClick={() => navigate('/register')} className="auth-switch-link">
              立即注册
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

export default Login;
