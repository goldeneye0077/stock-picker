import React from 'react';
import { Card, Form, Switch, Slider, Select, Button, Divider, Space } from 'antd';
import { SaveOutlined, ReloadOutlined } from '@ant-design/icons';

const { Option } = Select;

const Settings: React.FC = () => {
  const [form] = Form.useForm();

  const onFinish = (values: any) => {
    console.log('Settings saved:', values);
  };

  return (
    <div style={{ padding: '24px' }}>
      <Card title="系统设置">
        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          initialValues={{
            enableNotifications: true,
            volumeThreshold: 2.0,
            fundThreshold: 100,
            dataSource: 'tushare',
            refreshInterval: 30,
            theme: 'dark',
          }}
        >
          <Divider>通知设置</Divider>
          <Form.Item
            name="enableNotifications"
            label="启用推送通知"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>

          <Divider>分析参数</Divider>
          <Form.Item
            name="volumeThreshold"
            label="成交量异动阈值（倍数）"
          >
            <Slider
              min={1.5}
              max={5.0}
              step={0.1}
              marks={{
                1.5: '1.5倍',
                2.0: '2.0倍',
                3.0: '3.0倍',
                5.0: '5.0倍',
              }}
            />
          </Form.Item>

          <Form.Item
            name="fundThreshold"
            label="主力资金阈值（万元）"
          >
            <Slider
              min={50}
              max={1000}
              step={50}
              marks={{
                50: '50万',
                100: '100万',
                500: '500万',
                1000: '1000万',
              }}
            />
          </Form.Item>

          <Divider>数据源设置</Divider>
          <Form.Item
            name="dataSource"
            label="数据源"
          >
            <Select>
              <Option value="tushare">Tushare Pro</Option>
              <Option value="sina">新浪财经</Option>
              <Option value="eastmoney">东方财富</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="refreshInterval"
            label="数据刷新间隔（秒）"
          >
            <Select>
              <Option value={10}>10秒</Option>
              <Option value={30}>30秒</Option>
              <Option value={60}>1分钟</Option>
              <Option value={300}>5分钟</Option>
            </Select>
          </Form.Item>

          <Divider>界面设置</Divider>
          <Form.Item
            name="theme"
            label="主题"
          >
            <Select>
              <Option value="dark">深色主题</Option>
              <Option value="light">浅色主题</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
                保存设置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => form.resetFields()}>
                重置
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default Settings;