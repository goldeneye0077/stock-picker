import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { ProLayout } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  StockOutlined,
  FundOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import StockList from './pages/StockList';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';

const { darkAlgorithm } = theme;

const menuItems = [
  {
    path: '/',
    name: '仪表盘',
    icon: <DashboardOutlined />,
  },
  {
    path: '/stocks',
    name: '股票列表',
    icon: <StockOutlined />,
  },
  {
    path: '/analysis',
    name: '资金分析',
    icon: <FundOutlined />,
  },
  {
    path: '/settings',
    name: '设置',
    icon: <SettingOutlined />,
  },
];

function App() {
  return (
    <ConfigProvider
      theme={{
        algorithm: darkAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          colorBgContainer: '#1f1f1f',
          colorBgLayout: '#141414',
        },
      }}
    >
      <Router>
        <ProLayout
          title="智能选股系统"
          logo="📈"
          route={{
            routes: menuItems,
          }}
          location={{
            pathname: window.location.pathname,
          }}
          menuItemRender={(item, dom) => (
            <a
              onClick={() => {
                window.history.pushState({}, '', item.path);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }}
            >
              {dom}
            </a>
          )}
          style={{ minHeight: '100vh' }}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stocks" element={<StockList />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </ProLayout>
      </Router>
    </ConfigProvider>
  );
}

export default App;
