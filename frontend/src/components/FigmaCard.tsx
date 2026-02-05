import React from 'react';
import type { CSSProperties } from 'react';
import { FigmaColors, FigmaBorderRadius } from '../styles/FigmaDesignTokens';

interface FigmaCardProps {
  children: React.ReactNode;
  className?: string;
  style?: CSSProperties;
  gradient?: boolean;
  purpleGlow?: boolean;
}

const FigmaCard: React.FC<FigmaCardProps> = ({ 
  children, 
  className = '', 
  style = {},
  gradient = false,
  purpleGlow = false,
}) => {
  const cardStyle: CSSProperties = {
    position: 'relative',
    background: FigmaColors.bgContainerStrong,
    border: `1px solid ${FigmaColors.border}`,
    borderRadius: FigmaBorderRadius.xl,
    padding: '25px',
    overflow: 'hidden',
    ...style,
  };

  return (
    <div className={`figma-card ${className}`} style={cardStyle}>
      {gradient && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: FigmaColors.gradientPurple,
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      {purpleGlow && (
        <div
          style={{
            position: 'absolute',
            top: '-95px',
            right: '-95px',
            width: '256px',
            height: '256px',
            background: 'rgba(97, 95, 255, 0.1)',
            filter: 'blur(128px)',
            borderRadius: '9999px',
            pointerEvents: 'none',
            zIndex: 0,
          }}
        />
      )}
      <div style={{ position: 'relative', zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
};

export default FigmaCard;
