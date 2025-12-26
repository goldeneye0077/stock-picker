import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import { ProLayout } from '@ant-design/pro-layout';
import {
  DashboardOutlined,
  StockOutlined,
  FundOutlined,
  SettingOutlined,
  CalculatorOutlined,
  LineChartOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import Dashboard from './pages/Dashboard';
import StockList from './pages/StockList';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';
import SmartSelection from './pages/SmartSelection';
import SuperMainForce from './pages/SuperMainForce';
import DateTimeBanner from './components/DateTimeBanner';

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
    path: '/smart-selection',
    name: '精算智选',
    icon: <CalculatorOutlined />,
  },
  {
    path: '/super-main-force',
    name: '超强主力',
    icon: <ThunderboltOutlined />,
  },
  {
    path: '/settings',
    name: '设置',
    icon: <SettingOutlined />,
  },
];

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <DateTimeBanner />
      <div style={{ flex: 1, overflow: 'auto' }}>
        <ProLayout
          title="智能选股系统"
          logo={<img src="/logo(1).png" alt="logo" style={{ height: '32px' }} />}
          route={{
            routes: menuItems,
          }}
          location={{
            pathname: location.pathname,
          }}
          selectedKeys={[location.pathname]}
          layout="side"
          siderWidth={200}
          contentStyle={{
            margin: 0,
            padding: 0,
            minHeight: '100%',
          }}
          menuItemRender={(item, dom) => (
            <a
              onClick={() => {
                navigate(item.path || '/');
              }}
            >
              {dom}
            </a>
          )}
        >
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/stocks" element={<StockList />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/smart-selection" element={<SmartSelection />} />
            <Route path="/super-main-force" element={<SuperMainForce />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </ProLayout>
      </div>
    </div>
  );
}

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
        <AppLayout />
      </Router>
    </ConfigProvider>
  );
}

export default App;
