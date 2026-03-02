CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS stock_dim (
    stock_code TEXT PRIMARY KEY,
    name TEXT,
    exchange TEXT,
    industry TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kline_timeseries (
    stock_code TEXT NOT NULL,
    trade_date DATE NOT NULL,
    open DOUBLE PRECISION NOT NULL,
    high DOUBLE PRECISION NOT NULL,
    low DOUBLE PRECISION NOT NULL,
    close DOUBLE PRECISION NOT NULL,
    volume BIGINT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (stock_code, trade_date)
);

SELECT create_hypertable('kline_timeseries', 'trade_date', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_kline_timeseries_trade_date ON kline_timeseries (trade_date DESC);

CREATE TABLE IF NOT EXISTS daily_basic_timeseries (
    stock_code TEXT NOT NULL,
    trade_date DATE NOT NULL,
    close DOUBLE PRECISION,
    turnover_rate DOUBLE PRECISION,
    turnover_rate_f DOUBLE PRECISION,
    volume_ratio DOUBLE PRECISION,
    pe DOUBLE PRECISION,
    pe_ttm DOUBLE PRECISION,
    pb DOUBLE PRECISION,
    ps DOUBLE PRECISION,
    ps_ttm DOUBLE PRECISION,
    dv_ratio DOUBLE PRECISION,
    dv_ttm DOUBLE PRECISION,
    total_share DOUBLE PRECISION,
    float_share DOUBLE PRECISION,
    free_share DOUBLE PRECISION,
    total_mv DOUBLE PRECISION,
    circ_mv DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (stock_code, trade_date)
);

SELECT create_hypertable('daily_basic_timeseries', 'trade_date', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_daily_basic_timeseries_trade_date ON daily_basic_timeseries (trade_date DESC);

CREATE TABLE IF NOT EXISTS signal_events (
    id BIGSERIAL PRIMARY KEY,
    stock_code TEXT NOT NULL,
    signal_type TEXT NOT NULL,
    confidence DOUBLE PRECISION,
    price DOUBLE PRECISION,
    volume BIGINT,
    analysis_data JSONB,
    created_at TIMESTAMPTZ NOT NULL,
    UNIQUE (stock_code, signal_type, created_at)
);

CREATE INDEX IF NOT EXISTS idx_signal_events_created_at ON signal_events (created_at DESC);

CREATE TABLE IF NOT EXISTS market_moneyflow_timeseries (
    trade_date DATE PRIMARY KEY,
    close_sh DOUBLE PRECISION,
    pct_change_sh DOUBLE PRECISION,
    close_sz DOUBLE PRECISION,
    pct_change_sz DOUBLE PRECISION,
    net_amount DOUBLE PRECISION,
    net_amount_rate DOUBLE PRECISION,
    buy_elg_amount DOUBLE PRECISION,
    buy_elg_amount_rate DOUBLE PRECISION,
    buy_lg_amount DOUBLE PRECISION,
    buy_lg_amount_rate DOUBLE PRECISION,
    buy_md_amount DOUBLE PRECISION,
    buy_md_amount_rate DOUBLE PRECISION,
    buy_sm_amount DOUBLE PRECISION,
    buy_sm_amount_rate DOUBLE PRECISION,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

SELECT create_hypertable('market_moneyflow_timeseries', 'trade_date', if_not_exists => TRUE);

CREATE TABLE IF NOT EXISTS sector_moneyflow_timeseries (
    trade_date DATE NOT NULL,
    name TEXT NOT NULL,
    ts_code TEXT,
    pct_change DOUBLE PRECISION,
    close DOUBLE PRECISION,
    net_amount DOUBLE PRECISION,
    net_amount_rate DOUBLE PRECISION,
    buy_elg_amount DOUBLE PRECISION,
    buy_elg_amount_rate DOUBLE PRECISION,
    buy_lg_amount DOUBLE PRECISION,
    buy_lg_amount_rate DOUBLE PRECISION,
    buy_md_amount DOUBLE PRECISION,
    buy_md_amount_rate DOUBLE PRECISION,
    buy_sm_amount DOUBLE PRECISION,
    buy_sm_amount_rate DOUBLE PRECISION,
    rank INTEGER,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (trade_date, name)
);

SELECT create_hypertable('sector_moneyflow_timeseries', 'trade_date', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_sector_moneyflow_timeseries_trade_date ON sector_moneyflow_timeseries (trade_date DESC);
