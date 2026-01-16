import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ConfigProvider, Result, Spin, theme } from 'antd';
import { ProLayout } from '@ant-design/pro-layout';
import {
  StockOutlined,
  SettingOutlined,
  CalculatorOutlined,
  ThunderboltOutlined,
  TeamOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import Home from './pages/Home';
import StockList from './pages/StockList';
import Settings from './pages/Settings';
import SmartSelection from './pages/SmartSelection';
import SuperMainForce from './pages/SuperMainForce';
import Login from './pages/Login';
import Register from './pages/Register';
import UserManagement from './pages/UserManagement';
import TopBanner from './components/DateTimeBanner';
import { AuthProvider, useAuth } from './context/AuthContext';

const { darkAlgorithm } = theme;

const menuItems = [
  {
    path: '/home',
    name: '首页',
    icon: <HomeOutlined />,
  },
  {
    path: '/super-main-force',
    name: '超强主力',
    icon: <ThunderboltOutlined />,
  },
  {
    path: '/smart-selection',
    name: '精算智选',
    icon: <CalculatorOutlined />,
  },
  {
    path: '/stocks',
    name: '股票列表',
    icon: <StockOutlined />,
  },
  {
    path: '/settings',
    name: '设置',
    icon: <SettingOutlined />,
  },
  {
    path: '/user-management',
    name: '用户管理',
    icon: <TeamOutlined />,
  },
];

function RequireAuth({ path, children }: { path: string; children: React.ReactNode }) {
  const location = useLocation();
  const { loading, user, canAccess } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (path === '/user-management' && !user.isAdmin) {
    return <Navigate to="/forbidden" replace />;
  }

  if (!canAccess(path)) {
    return <Navigate to="/forbidden" replace />;
  }

  return <>{children}</>;
}

function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, firstAllowedPath, canAccess, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  const visibleMenuItems = menuItems.filter((item) => {
    if (!item.path) return false;
    if (item.path === '/home') return true;
    return canAccess(item.path);
  });
  const menuItemsWithAdminGuard = visibleMenuItems.filter((item) => {
    if (!item.path) return false;
    if (item.path === '/user-management') return user.isAdmin;
    return true;
  });

  return (
    <ProLayout
      style={{ height: '100%' }}
      title="AI智能选股引擎"
      logo={<img src="/logo(1).png" alt="logo" style={{ height: '32px' }} />}
      route={{
        routes: menuItemsWithAdminGuard,
      }}
      location={{
        pathname: location.pathname,
      }}
      selectedKeys={[location.pathname]}
      layout="side"
      siderWidth={200}
      footerRender={() => (
        <div
          style={{
            height: 40,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 500,
            color: '#d9d9d9',
            background: '#141414',
            borderTop: '1px solid #303030',
          }}
        >
          本引擎仅供学习，不作为投资依据，严禁用作商业用途
        </div>
      )}
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
        <Route path="/" element={<Navigate to={firstAllowedPath()} replace />} />
        <Route
          path="/stocks"
          element={
            <RequireAuth path="/stocks">
              <StockList />
            </RequireAuth>
          }
        />
        <Route
          path="/smart-selection"
          element={
            <RequireAuth path="/smart-selection">
              <SmartSelection />
            </RequireAuth>
          }
        />
        <Route
          path="/super-main-force"
          element={
            <RequireAuth path="/super-main-force">
              <SuperMainForce />
            </RequireAuth>
          }
        />
        <Route
          path="/settings"
          element={
            <RequireAuth path="/settings">
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/user-management"
          element={
            <RequireAuth path="/user-management">
              <UserManagement />
            </RequireAuth>
          }
        />
        <Route
          path="/forbidden"
          element={
            <Result
              status="403"
              title="403"
              subTitle="无权限访问该页面"
              extra={
                <a
                  onClick={() => {
                    navigate(firstAllowedPath(), { replace: true });
                  }}
                >
                  返回可访问首页
                </a>
              }
            />
          }
        />
        <Route path="*" element={<Navigate to={firstAllowedPath()} replace />} />
      </Routes>
    </ProLayout>
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
      <AuthProvider>
        <Router>
          <div style={{ width: '100vw', height: '100vh' }}>
            <TopBanner />
            <div style={{ height: '100%', paddingTop: 48, boxSizing: 'border-box', overflow: 'auto' }}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/home" element={<Home />} />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/*" element={<AppLayout />} />
              </Routes>
            </div>
          </div>
        </Router>
      </AuthProvider>
    </ConfigProvider>
  );
}

export default App;
