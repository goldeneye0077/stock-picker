/**
 * 资金分析页面
 * 重构后的版本 - 使用子组件实现模块化
 */

import React from 'react';
import { Row, Col } from 'antd';
import {
  FundFlowCard,
  VolumeAnalysisCard,
  MainForceCard,
  SectorVolumeCard
} from '../components/Analysis';

const Analysis: React.FC = () => {
  return (
    <div style={{ padding: '24px' }}>
      <Row gutter={[16, 16]}>
        {/* 资金流向分析 */}
        <Col xs={24} lg={10}>
          <FundFlowCard />
        </Col>

        {/* 成交量异动分析 */}
        <Col xs={24} lg={14}>
          <VolumeAnalysisCard />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 板块成交量异动分析 */}
        <Col span={24}>
          <SectorVolumeCard />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: '16px' }}>
        {/* 主力行为分析 */}
        <Col span={24}>
          <MainForceCard />
        </Col>
      </Row>
    </div>
  );
};

export default Analysis;
