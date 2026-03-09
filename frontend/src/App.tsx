import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { BrowserRouter as Router, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { ConfigProvider, Result, Spin, theme } from 'antd'
import TopBanner from './components/DateTimeBanner'
import GlobalDisclaimer from './components/GlobalDisclaimer'
import FigmaShellLayout from './components/FigmaShellLayout'
import { AuthProvider, useAuth } from './context/AuthContext'
import { usePageTracking } from './hooks/usePageTracking'

const { darkAlgorithm, defaultAlgorithm } = theme

const Home = lazy(() => import('./pages/Home'))
const StockList = lazy(() => import('./pages/StockList'))
const Settings = lazy(() => import('./pages/Settings'))
const SmartSelection = lazy(() => import('./pages/SmartSelection'))
const SuperMainForce = lazy(() => import('./pages/SuperMainForce'))
const Login = lazy(() => import('./pages/Login'))
const Register = lazy(() => import('./pages/Register'))
const UserManagement = lazy(() => import('./pages/UserManagement'))
const ContactManagement = lazy(() => import('./pages/ContactManagement'))
const Contact = lazy(() => import('./pages/Contact'))
const UserAgreement = lazy(() => import('./pages/UserAgreement'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const SiteAnalytics = lazy(() => import('./pages/SiteAnalytics'))

const ROUTE_LABELS: Record<string, string> = {
  '/': '首页',
  '/home': '首页',
  '/login': '登录',
  '/register': '注册',
  '/contact': '联系',
  '/user-agreement': '用户协议',
  '/privacy-policy': '隐私政策',
  '/forbidden': '无权限',
  '/super-main-force': '超强主力',
  '/smart-selection': '精选智选',
  '/stocks': '股票列表',
  '/watchlist': '自选股',
  '/settings': '系统设置',
  '/user-management': '用户管理',
  '/site-analytics': '网站统计',
  '/contact-management': '留言管理',
}

const FIGMA_SHELL_ROOT_PATHS = new Set([
  '/super-main-force',
  '/smart-selection',
  '/stocks',
  '/watchlist',
  '/settings',
  '/site-analytics',
  '/contact-management',
  '/user-management',
])

function RouteLoading() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spin size="large" />
    </div>
  )
}

function isFigmaShellRoutePath(pathname: string): boolean {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length === 0) {
    return false
  }

  return FIGMA_SHELL_ROOT_PATHS.has(`/${segments[0]}`)
}

function RequireAuth({ path, children }: { path: string; children: React.ReactNode }) {
  const location = useLocation()
  const { loading, user, canAccess } = useAuth()

  if (path === '/home' || path === '/') {
    return <>{children}</>
  }

  if (loading) {
    return <RouteLoading />
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (['/user-management', '/site-analytics', '/contact-management'].includes(path) && !user.isAdmin) {
    return <Navigate to="/forbidden" replace />
  }

  if (!canAccess(path)) {
    return <Navigate to="/forbidden" replace />
  }

  return <>{children}</>
}

function ForbiddenPage() {
  const navigate = useNavigate()
  const { firstAllowedPath } = useAuth()

  return (
    <Result
      status="403"
      title="403"
      subTitle="无权限访问该页面"
      extra={
        <a
          onClick={() => {
            navigate(firstAllowedPath(), { replace: true })
          }}
        >
          返回可访问首页
        </a>
      }
    />
  )
}

function AppRouteFallback() {
  const { loading, firstAllowedPath } = useAuth()

  if (loading) {
    return <RouteLoading />
  }

  return <Navigate to={firstAllowedPath()} replace />
}

type AppFrameProps = {
  themeMode: 'dark' | 'light'
  isGrayscale: boolean
  onToggleThemeMode: () => void
  onToggleGrayscale: () => void
}

function AppFrame({ themeMode, isGrayscale, onToggleThemeMode, onToggleGrayscale }: AppFrameProps) {
  const location = useLocation()
  const shouldUseGlobalTopPadding = !isFigmaShellRoutePath(location.pathname)

  usePageTracking()

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <TopBanner
        themeMode={themeMode}
        onToggleThemeMode={onToggleThemeMode}
        isGrayscale={isGrayscale}
        onToggleGrayscale={onToggleGrayscale}
        routeLabels={ROUTE_LABELS}
      />
      <div
        style={{
          height: '100%',
          paddingTop: shouldUseGlobalTopPadding ? 48 : 0,
          paddingBottom: 56,
          boxSizing: 'border-box',
          overflow: 'auto',
        }}
      >
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route
              path="/home"
              element={
                <RequireAuth path="/home">
                  <Home />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/user-agreement" element={<UserAgreement />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/forbidden" element={<ForbiddenPage />} />
            <Route element={<FigmaShellLayout />}>
              <Route
                path="/super-main-force"
                element={
                  <RequireAuth path="/super-main-force">
                    <SuperMainForce />
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
                path="/stocks"
                element={
                  <RequireAuth path="/stocks">
                    <StockList mode="all" />
                  </RequireAuth>
                }
              />
              <Route
                path="/watchlist"
                element={
                  <RequireAuth path="/watchlist">
                    <StockList mode="watchlist" />
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
                path="/site-analytics"
                element={
                  <RequireAuth path="/site-analytics">
                    <SiteAnalytics />
                  </RequireAuth>
                }
              />
              <Route
                path="/contact-management"
                element={
                  <RequireAuth path="/contact-management">
                    <ContactManagement />
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
            </Route>
            <Route path="*" element={<AppRouteFallback />} />
          </Routes>
        </Suspense>
      </div>
      <GlobalDisclaimer />
    </div>
  )
}

function App() {
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>(() => {
    const raw = window.localStorage.getItem('sq_theme_mode')
    return raw === 'light' ? 'light' : 'dark'
  })

  const [isGrayscale, setIsGrayscale] = useState<boolean>(() => {
    return window.localStorage.getItem('sq_grayscale_mode') === 'true'
  })

  useEffect(() => {
    window.localStorage.setItem('sq_theme_mode', themeMode)
    document.documentElement.setAttribute('data-theme', themeMode)
  }, [themeMode])

  useEffect(() => {
    window.localStorage.setItem('sq_grayscale_mode', isGrayscale.toString())
    document.documentElement.setAttribute('data-grayscale', isGrayscale.toString())
  }, [isGrayscale])

  const themeConfig = useMemo(() => {
    if (themeMode === 'light') {
      return {
        algorithm: defaultAlgorithm,
        token: {
          colorPrimary: '#2e90fa',
          colorBgBase: '#ffffff',
          colorBgLayout: '#f5f6f8',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e5e7eb',
          colorText: 'rgba(0, 0, 0, 0.88)',
          colorTextSecondary: 'rgba(0, 0, 0, 0.65)',
          colorTextTertiary: 'rgba(0, 0, 0, 0.45)',
          borderRadius: 8,
          fontFamily:
            'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
          fontFamilyCode:
            'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
        },
        components: {
          Table: {
            headerBg: '#ffffff',
            headerColor: 'rgba(0, 0, 0, 0.65)',
          },
          Tag: {
            borderRadiusSM: 2,
          },
        },
      }
    }

    return {
      algorithm: darkAlgorithm,
      token: {
        colorPrimary: '#1D61FF',
        colorInfo: '#1D61FF',
        colorSuccess: '#10B981',
        colorWarning: '#F59E0B',
        colorError: '#EF4444',
        colorLink: '#1D61FF',
        colorBgBase: '#0B0F19',
        colorBgLayout: '#0B0F19',
        colorBgContainer: '#101524',
        colorBgElevated: '#161b2e',
        colorBorder: 'rgba(148, 163, 184, 0.15)',
        colorText: '#FFFFFF',
        colorTextSecondary: '#94A3B8',
        colorTextTertiary: '#64748B',
        borderRadius: 10,
        fontFamily:
          'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
        fontFamilyCode:
          'ui-monospace, "JetBrains Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      },
      components: {
        Card: {
          paddingLG: 20,
        },
        Table: {
          headerBg: '#0f172b',
          headerColor: '#90a1b9',
        },
        Modal: {
          contentBg: '#0f172b',
          headerBg: '#0f172b',
        },
        Tag: {
          borderRadiusSM: 2,
        },
      },
    }
  }, [themeMode])

  return (
    <ConfigProvider theme={themeConfig}>
      <AuthProvider>
        <Router>
          <AppFrame
            themeMode={themeMode}
            isGrayscale={isGrayscale}
            onToggleThemeMode={() => setThemeMode((mode) => (mode === 'dark' ? 'light' : 'dark'))}
            onToggleGrayscale={() => setIsGrayscale((value) => !value)}
          />
        </Router>
      </AuthProvider>
    </ConfigProvider>
  )
}

export default App
