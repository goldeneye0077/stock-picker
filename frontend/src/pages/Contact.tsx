import React, { useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Typography, message } from 'antd';
import { MailOutlined, MessageOutlined, SendOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { submitContactMessage } from '../services/contactService';

const { Title, Text, Paragraph, Link } = Typography;
const { TextArea } = Input;

type ContactFormValues = {
  name: string;
  email: string;
  subject?: string;
  message: string;
};

const Contact: React.FC = () => {
  const { user } = useAuth();
  const [form] = Form.useForm<ContactFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [ticketId, setTicketId] = useState<number | null>(null);

  const contactEmail = 'awebiadmin@126.com';
  const mailtoHref = `mailto:${contactEmail}?subject=${encodeURIComponent('网站联系')}`;

  const onFinish = async (values: ContactFormValues) => {
    setSubmitting(true);
    setTicketId(null);
    try {
      const result = await submitContactMessage({
        name: values.name.trim(),
        email: values.email.trim(),
        subject: values.subject?.trim(),
        message: values.message.trim(),
        source_page: window.location.pathname,
      });

      setTicketId(result.data?.id || null);
      message.success('留言提交成功，我们会尽快处理');
      form.resetFields(['subject', 'message']);
      form.setFieldValue('name', values.name.trim());
      form.setFieldValue('email', values.email.trim());
    } catch (err) {
      const msg = err instanceof Error ? err.message : '提交失败，请稍后重试';
      message.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: '24px 16px' }}>
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            联系我
          </Title>
          <Text type="secondary">
            支持留言反馈和邮件联系。建议优先提交留言，便于跟踪处理状态。
          </Text>
        </div>

        {ticketId && (
          <Alert
            type="success"
            showIcon
            message="留言已提交"
            description={`留言编号：#${ticketId}。请保留该编号用于后续沟通。`}
          />
        )}

        <Card
          title={(
            <Space>
              <MessageOutlined />
              在线留言
            </Space>
          )}
        >
          <Form<ContactFormValues>
            form={form}
            layout="vertical"
            initialValues={{
              name: user?.username || '',
              email: '',
              subject: '',
              message: '',
            }}
            onFinish={onFinish}
          >
            <Form.Item
              label="姓名"
              name="name"
              rules={[
                { required: true, message: '请输入姓名' },
                { min: 1, max: 64, message: '姓名长度需在 1-64 字符之间' },
              ]}
            >
              <Input maxLength={64} placeholder="请输入你的姓名" />
            </Form.Item>

            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '请输入有效邮箱地址' },
                { max: 255, message: '邮箱长度不能超过 255' },
              ]}
            >
              <Input maxLength={255} placeholder="name@example.com" />
            </Form.Item>

            <Form.Item
              label="主题（可选）"
              name="subject"
              rules={[{ max: 120, message: '主题长度不能超过 120' }]}
            >
              <Input maxLength={120} placeholder="例如：功能建议 / Bug 反馈 / 商务合作" />
            </Form.Item>

            <Form.Item
              label="留言内容"
              name="message"
              rules={[
                { required: true, message: '请输入留言内容' },
                { min: 5, max: 5000, message: '内容长度需在 5-5000 字符之间' },
              ]}
            >
              <TextArea
                rows={8}
                maxLength={5000}
                showCount
                placeholder="请输入你的问题、建议或合作需求。"
              />
            </Form.Item>

            <Form.Item style={{ marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" loading={submitting} icon={<SendOutlined />}>
                提交留言
              </Button>
            </Form.Item>
          </Form>
        </Card>

        <Card
          title={(
            <Space>
              <MailOutlined />
              邮件联系
            </Space>
          )}
        >
          <Paragraph style={{ marginBottom: 8 }}>
            你也可以直接发邮件到：
            {' '}
            <Link href={mailtoHref}>{contactEmail}</Link>
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
};

export default Contact;
