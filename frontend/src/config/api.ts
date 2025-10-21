// 使用环境变量或当前主机地址
const getApiUrl = (port: number) => {
  // 如果在浏览器环境
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    // 如果是 localhost，直接使用 localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:${port}`;
    }
    // 否则使用当前主机名（适用于远程访问）
    return `${window.location.protocol}//${hostname}:${port}`;
  }
  // 服务端渲染时的默认值
  return `http://localhost:${port}`;
};

export const API_BASE_URL = getApiUrl(3000);
export const DATA_SERVICE_URL = getApiUrl(8001);

export const API_ENDPOINTS = {
  STOCKS: '/api/stocks',
  ANALYSIS: '/api/analysis',
  SIGNALS: '/api/signals',
  DATA_COLLECTION: '/api/data',
};