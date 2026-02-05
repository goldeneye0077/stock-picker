import React from 'react';
import { useNavigate } from 'react-router-dom';
import heroBg from '../assets/home/home_strategy_card_bg_2x.png';
import hotFundsBg from '../assets/home/home_hot_funds_bg.png';
import strategyBg from '../assets/home/home_strategy_bg.png';
import featureMarketBg from '../assets/home/home_feature_market_bg_2x.png';
import featureAiBg from '../assets/home/home_feature_ai_bg_2x.png';
import insightMainBg from '../assets/home/home_insight_main_bg_2x.png';
import insightThumbBg from '../assets/home/home_insight_thumb_2x.png';
import './Home.css';

type HotFundRow = {
  sector: string;
  isHot?: boolean;
  changePct: string;
  netInflow: string;
  leaderName: string;
  leaderCode: string;
};

const Home: React.FC = () => {
  const navigate = useNavigate();

  const hotFunds: HotFundRow[] = [
    { sector: 'CPO 概念', isHot: true, changePct: '+4.2%', netInflow: '+12.4亿', leaderName: '中际旭创', leaderCode: '300308' },
    { sector: '算力租赁', isHot: true, changePct: '+3.8%', netInflow: '+8.2亿', leaderName: '浪潮信息', leaderCode: '000977' },
    { sector: '消费电子', changePct: '+2.1%', netInflow: '-1.5亿', leaderName: '立讯精密', leaderCode: '002475' },
    { sector: '半导体', changePct: '-0.5%', netInflow: '-4.2亿', leaderName: '兆易创新', leaderCode: '603986' },
  ];

  const marketInsightCards = [
    {
      key: 'strategy',
      category: '策略分享',
      title: '量化交易策略深度解析',
      desc: '揭秘机构级量化策略背后的数学模型与风险控制...',
      time: '12 小时前',
    },
    {
      key: 'research',
      category: '市场研究',
      title: 'A 股市场结构性机会研判',
      desc: '当前市场环境下，价值与成长的平衡策略探讨...',
      time: '1 天前',
    },
    {
      key: 'ta',
      category: '技术分析',
      title: '技术指标组合实战案例',
      desc: 'MACD + RSI + BOLL 三重确认买卖点的实战应用...',
      time: '2 天前',
    },
  ];

  return (
    <main className="sq-home" role="main">
      <div className="sq-home__shell">
        <div className="sq-home__main-col">
          <div className="sq-home__content">
            <div className="sq-home__container">
              <section className="sq-home__hero-card" style={{ backgroundImage: `url(${heroBg})` }} aria-label="首页介绍">
                <div className="sq-home__hero-overlay" aria-hidden="true" />
                <div className="sq-home__hero-inner">
                  <div className="sq-home__hero-left">
                    <div className="sq-home__hero-badges">
                      <span className="sq-home__badge sq-home__badge--new">New v2.0</span>
                      <span className="sq-home__badge sq-home__badge--live">
                        <span className="sq-home__badge-dot" aria-hidden="true" />
                        实时数据更新中
                      </span>
                    </div>

                    <h1 className="sq-home__hero-title">
                      <span>智能量化</span>
                      <span>决策系统</span>
                    </h1>

                    <p className="sq-home__hero-desc">
                      基于多因子模型的超强主力追踪，帮助您在 4,000+ 股票中快速锁定交易机会。AI 驱动的策略回测，实时监控市场动态。
                    </p>

                    <div className="sq-home__hero-metrics" aria-label="平台指标">
                      <div className="sq-home__hero-metric">
                        <div className="sq-home__hero-metric-value">4,000+</div>
                        <div className="sq-home__hero-metric-label">覆盖股票</div>
                      </div>
                      <div className="sq-home__hero-metric">
                        <div className="sq-home__hero-metric-value">98.5%</div>
                        <div className="sq-home__hero-metric-label">数据准确率</div>
                      </div>
                      <div className="sq-home__hero-metric">
                        <div className="sq-home__hero-metric-value">&lt;100ms</div>
                        <div className="sq-home__hero-metric-label">响应延迟</div>
                      </div>
                    </div>

                    <div className="sq-home__hero-actions">
                      <button type="button" className="sq-home__btn sq-home__btn--primary" onClick={() => navigate('/super-main-force')}>
                        进入超强主力
                      </button>
                      <button type="button" className="sq-home__btn sq-home__btn--ghost" onClick={() => navigate('/stocks')}>
                        浏览全部股票
                      </button>
                    </div>
                  </div>

                  <div className="sq-home__hero-right" aria-label="策略曲线">
                    <div className="sq-home__chart-card">
                      <div className="sq-home__chart-head">
                        <div className="sq-home__chart-meta">
                          <div className="sq-home__chart-label">策略收益曲线</div>
                          <div className="sq-home__chart-value">+45.2%</div>
                        </div>
                        <div className="sq-home__chart-filters" aria-label="曲线范围">
                          <span className="sq-home__chip">30天</span>
                          <span className="sq-home__chip sq-home__chip--active">实时</span>
                        </div>
                      </div>
                      <div className="sq-home__chart-body" aria-hidden="true">
                        <svg viewBox="0 0 320 140" width="100%" height="140" preserveAspectRatio="none">
                          <defs>
                            <linearGradient id="sq-home-area" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="rgba(97,95,255,0.35)" />
                              <stop offset="100%" stopColor="rgba(97,95,255,0)" />
                            </linearGradient>
                          </defs>
                          <path
                            d="M0,120 C40,110 60,80 90,75 C120,70 130,88 160,62 C190,36 220,50 250,44 C280,38 300,22 320,18 L320,140 L0,140 Z"
                            fill="url(#sq-home-area)"
                          />
                          <path
                            d="M0,120 C40,110 60,80 90,75 C120,70 130,88 160,62 C190,36 220,50 250,44 C280,38 300,22 320,18"
                            fill="none"
                            stroke="rgba(0,210,255,0.9)"
                            strokeWidth="2"
                          />
                        </svg>
                      </div>
                      <div className="sq-home__chart-foot">
                        <div className="sq-home__chart-pill">
                          <span className="sq-home__chart-pill-value">↑ 12.3%</span>
                          <span className="sq-home__chart-pill-label">今日收益</span>
                        </div>
                        <div className="sq-home__chart-stat">
                          <span className="sq-home__chart-stat-label">夏普比率:</span>
                          <span className="sq-home__chart-stat-value">2.34</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="sq-home__kpis" aria-label="关键指标">
                <div className="sq-home__kpi sq-home__kpi--rose">
                  <div className="sq-home__kpi-head">
                    <div className="sq-home__kpi-title-row">
                      <div className="sq-home__kpi-title">今日入选</div>
                      <span className="sq-home__kpi-dot" aria-hidden="true" />
                    </div>
                    <span className="sq-home__kpi-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 1.7c4 0 7.3 3.3 7.3 7.3S13 16.3 9 16.3 1.7 13 1.7 9 5 1.7 9 1.7Z" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M9 5.2v4.1l2.8 1.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  <div className="sq-home__kpi-value">18</div>
                  <div className="sq-home__kpi-foot">
                    <span className="sq-home__kpi-foot-text sq-home__kpi-foot-text--accent">较昨日 +4</span>
                    <span className="sq-home__kpi-pill">+22%</span>
                  </div>
                </div>
                <div className="sq-home__kpi sq-home__kpi--magenta">
                  <div className="sq-home__kpi-head">
                    <div className="sq-home__kpi-title-row">
                      <div className="sq-home__kpi-title">昨日策略胜率</div>
                    </div>
                    <span className="sq-home__kpi-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.2 14.8V9.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M7 14.8V6.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M10.8 14.8V10.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M14.6 14.8V4.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                  </div>
                  <div className="sq-home__kpi-value">68.2%</div>
                  <div className="sq-home__kpi-foot">
                    <span className="sq-home__kpi-foot-text sq-home__kpi-foot-text--accent">跑赢指数 12%</span>
                    <span className="sq-home__kpi-pill">+5.2%</span>
                  </div>
                </div>
                <div className="sq-home__kpi sq-home__kpi--amber">
                  <div className="sq-home__kpi-head">
                    <div className="sq-home__kpi-title-row">
                      <div className="sq-home__kpi-title">市场情绪</div>
                    </div>
                    <span className="sq-home__kpi-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M9 2.1v3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M9 12.8v3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M2.1 9h3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M12.8 9h3.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                        <path d="M6.7 9c.7 0 1.1-2.2 1.8-2.2s1 4.4 1.6 4.4 1-2.2 1.7-2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  <div className="sq-home__kpi-value">贪婪</div>
                  <div className="sq-home__kpi-foot">
                    <span className="sq-home__kpi-foot-text">82/100</span>
                    <span className="sq-home__kpi-pill">High</span>
                  </div>
                </div>
                <div className="sq-home__kpi sq-home__kpi--emerald">
                  <div className="sq-home__kpi-head">
                    <div className="sq-home__kpi-title-row">
                      <div className="sq-home__kpi-title">全A成交额</div>
                    </div>
                    <span className="sq-home__kpi-icon" aria-hidden="true">
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M3.2 12.6 7.1 8.7l2.4 2.4 5.3-5.3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M12.1 5.8h2.7v2.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                  <div className="sq-home__kpi-value">9,820亿</div>
                  <div className="sq-home__kpi-foot">
                    <span className="sq-home__kpi-foot-text sq-home__kpi-foot-text--accent">缩量 15%</span>
                    <span className="sq-home__kpi-pill">-15%</span>
                  </div>
                </div>
              </section>

              <section className="sq-home__grid" aria-label="热点与策略">
                <div className="sq-home__card sq-home__card--hot" style={{ backgroundImage: `url(${hotFundsBg})` }}>
                  <div className="sq-home__card-overlay" aria-hidden="true" />
                  <div className="sq-home__card-inner">
                    <div className="sq-home__card-head">
                      <div className="sq-home__card-head-left">
                        <span className="sq-home__icon-box" aria-hidden="true">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path
                              d="M10 1.8 16.5 4.9v5c0 4.4-2.8 7.6-6.5 8.3C6.3 17.5 3.5 14.3 3.5 9.9v-5L10 1.8Z"
                              stroke="currentColor"
                              strokeWidth="1.4"
                            />
                            <path
                              d="M7 10l2 2 4-5"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <div className="sq-home__card-head-text">
                          <div className="sq-home__card-title-row">
                            <h2 className="sq-home__card-title">实时热点资金</h2>
                            <span className="sq-home__pill sq-home__pill--live">LIVE</span>
                          </div>
                          <p className="sq-home__card-subtitle">追踪主力动向，把握板块机会</p>
                        </div>
                      </div>
                      <button type="button" className="sq-home__link-btn" onClick={() => navigate('/super-main-force')}>
                        查看更多
                        <span className="sq-home__link-btn-icon" aria-hidden="true">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5.3 2.6 9.7 7l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                          </svg>
                        </span>
                      </button>
                    </div>

                    <div className="sq-home__table-wrap" role="region" aria-label="热点资金表格">
                      <table className="sq-home__table">
                        <thead>
                          <tr>
                            <th scope="col">板块</th>
                            <th scope="col">涨跌幅</th>
                            <th scope="col">主力净流入</th>
                            <th scope="col">领涨个股</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hotFunds.map((row) => {
                            const isUp = row.changePct.startsWith('+');
                            const isInflowUp = row.netInflow.startsWith('+');
                            return (
                              <tr key={`${row.sector}-${row.leaderCode}`}>
                                <td>
                                  <div className="sq-home__sector">
                                    <span className="sq-home__sector-dot" aria-hidden="true" />
                                    <span className="sq-home__sector-name">{row.sector}</span>
                                    {row.isHot ? <span className="sq-home__sector-tag">HOT</span> : null}
                                  </div>
                                </td>
                                <td className={isUp ? 'sq-home__num sq-home__num--up' : 'sq-home__num sq-home__num--down'}>
                                  {row.changePct}
                                </td>
                                <td className={isInflowUp ? 'sq-home__num sq-home__num--up' : 'sq-home__num sq-home__num--down'}>
                                  {row.netInflow}
                                </td>
                                <td>
                                  <div className="sq-home__leader">
                                    <span className="sq-home__leader-name">{row.leaderName}</span>
                                    <span className="sq-home__leader-code">({row.leaderCode})</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="sq-home__card sq-home__card--strategy" style={{ backgroundImage: `url(${strategyBg})` }}>
                  <div className="sq-home__card-overlay" aria-hidden="true" />
                  <div className="sq-home__card-inner">
                    <div className="sq-home__strategy-head">
                      <span className="sq-home__icon-box sq-home__icon-box--purple" aria-hidden="true">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M4 7.3c0-1.8 1.5-3.3 3.3-3.3h5.4C14.5 4 16 5.5 16 7.3v5.4c0 1.8-1.5 3.3-3.3 3.3H7.3C5.5 16 4 14.5 4 12.7V7.3Z"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path
                            d="M7 3v2M13 3v2M7 15v2M13 15v2M3 10h2M15 10h2"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <div className="sq-home__strategy-head-text">
                        <h2 className="sq-home__card-title">精算策略表现</h2>
                        <p className="sq-home__card-subtitle">基于AI的量化策略实时收益</p>
                      </div>
                    </div>

                    <div className="sq-home__strategy-chips" aria-label="策略指标">
                      <span className="sq-home__chip sq-home__chip--danger">胜率 68.5%</span>
                      <span className="sq-home__chip sq-home__chip--info">夏普 2.34</span>
                    </div>

                    <div className="sq-home__strategy-visual" aria-hidden="true" />

                    <button type="button" className="sq-home__strategy-btn" onClick={() => navigate('/smart-selection')}>
                      <span className="sq-home__strategy-btn-icon" aria-hidden="true">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M7 2.3a4.7 4.7 0 1 0 0 9.4 4.7 4.7 0 0 0 0-9.4Z"
                            stroke="currentColor"
                            strokeWidth="1.4"
                          />
                          <path
                            d="M7 5.1V7l1.3 0.8"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      配置我的策略
                    </button>

                    <div className="sq-home__strategy-stats">
                      <div className="sq-home__mini">
                        <div className="sq-home__mini-label">年化收益</div>
                        <div className="sq-home__mini-value sq-home__mini-value--up">+24.5%</div>
                      </div>
                      <div className="sq-home__mini">
                        <div className="sq-home__mini-label">最大回撤</div>
                        <div className="sq-home__mini-value sq-home__mini-value--down">-8.2%</div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="sq-home__features" aria-label="核心能力">
                <article className="sq-home__feature-card">
                  <img
                    className="sq-home__feature-bg"
                    src={featureMarketBg}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    aria-hidden="true"
                  />
                  <div className="sq-home__feature-overlay" aria-hidden="true" />
                  <div className="sq-home__feature-inner">
                    <span className="sq-home__feature-badge sq-home__feature-badge--danger">核心功能</span>
                    <div className="sq-home__feature-head">
                      <span className="sq-home__feature-icon" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M2.25 9c0-1.55 1.25-2.8 2.8-2.8h7.9c1.55 0 2.8 1.25 2.8 2.8v1.8c0 1.55-1.25 2.8-2.8 2.8h-7.9c-1.55 0-2.8-1.25-2.8-2.8V9Z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M5.4 9.9 7.2 11.7 12.6 6.3"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                      <h2 className="sq-home__feature-title">实时市场追踪</h2>
                    </div>
                    <p className="sq-home__feature-desc">L2 级行情数据，毫秒级响应，捕捉每一个交易机会</p>
                    <div className="sq-home__feature-tags" aria-label="功能标签">
                      <span className="sq-home__feature-tag">实时数据</span>
                      <span className="sq-home__feature-tag">智能预警</span>
                    </div>
                  </div>
                </article>

                <article className="sq-home__feature-card">
                  <img
                    className="sq-home__feature-bg"
                    src={featureAiBg}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    aria-hidden="true"
                  />
                  <div className="sq-home__feature-overlay" aria-hidden="true" />
                  <div className="sq-home__feature-inner">
                    <span className="sq-home__feature-badge sq-home__feature-badge--purple">数据分析</span>
                    <div className="sq-home__feature-head">
                      <span className="sq-home__feature-icon sq-home__feature-icon--purple" aria-hidden="true">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path
                            d="M6.2 3.8h5.6c1.55 0 2.8 1.25 2.8 2.8v4.8c0 1.55-1.25 2.8-2.8 2.8H6.2c-1.55 0-2.8-1.25-2.8-2.8V6.6c0-1.55 1.25-2.8 2.8-2.8Z"
                            stroke="currentColor"
                            strokeWidth="1.6"
                          />
                          <path
                            d="M6 10.2h6M6 7.6h2.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                      <h2 className="sq-home__feature-title">智能数据分析</h2>
                    </div>
                    <p className="sq-home__feature-desc">AI 驱动的多维度数据分析，深度挖掘市场规律</p>
                    <div className="sq-home__feature-tags" aria-label="功能标签">
                      <span className="sq-home__feature-tag">深度学习</span>
                      <span className="sq-home__feature-tag">可视化</span>
                    </div>
                  </div>
                </article>
              </section>

              <section className="sq-home__insights" aria-label="市场洞察">
                <div className="sq-home__section-head">
                  <div className="sq-home__section-title">
                    <div className="sq-home__section-title-row">
                      <h2 className="sq-home__section-heading">市场洞察</h2>
                      <span className="sq-home__live-pill" aria-label="实时更新">
                        <span className="sq-home__live-dot" aria-hidden="true" />
                        LIVE
                      </span>
                    </div>
                    <p className="sq-home__section-subtitle">实时追踪市场动态，深度解读热点事件</p>
                  </div>
                  <button type="button" className="sq-home__section-btn" onClick={() => navigate('/stocks')}>
                    查看全部
                    <span className="sq-home__section-btn-icon" aria-hidden="true">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M5.3 2.6 9.7 7l-4.4 4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                      </svg>
                    </span>
                  </button>
                </div>

                <div className="sq-home__insights-grid">
                  <article className="sq-home__insight-main">
                    <img
                      className="sq-home__insight-bg"
                      src={insightMainBg}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      aria-hidden="true"
                    />
                    <div className="sq-home__insight-overlay" aria-hidden="true" />
                    <div className="sq-home__insight-main-inner">
                      <span className="sq-home__insight-tag">市场热点</span>
                      <h3 className="sq-home__insight-title">全球资本流向分析：科技板块资金净流入持续加速</h3>
                      <p className="sq-home__insight-desc">本周科技板块主力资金净流入达 186 亿元，其中芯片、AI 应用细分赛道表现亮眼...</p>
                      <div className="sq-home__insight-meta" aria-label="文章信息">
                        <span className="sq-home__insight-meta-item">5 小时前</span>
                        <span className="sq-home__insight-meta-item">• 阅读 2.4k</span>
                      </div>
                    </div>
                  </article>

                  <div className="sq-home__insight-side" aria-label="更多洞察">
                    {marketInsightCards.map((item) => (
                      <article key={item.key} className="sq-home__insight-item">
                        <img className="sq-home__insight-thumb" src={insightThumbBg} alt="" loading="lazy" decoding="async" aria-hidden="true" />
                        <div className="sq-home__insight-item-body">
                          <span className="sq-home__insight-item-tag">{item.category}</span>
                          <h4 className="sq-home__insight-item-title">{item.title}</h4>
                          <p className="sq-home__insight-item-desc">{item.desc}</p>
                          <div className="sq-home__insight-item-time">{item.time}</div>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
};

export default Home;
