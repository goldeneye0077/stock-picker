/**
 * Figma Design Tokens
 * 量鲸UI设计系统 - 从Figma设计稿提取的精确设计tokens
 * File: juV6jI0nwM2dAWeTWW38Xc
 */

export const FigmaColors = {
  // Background
  bg: '#020618',
  bgContainer: 'rgba(15, 23, 43, 0.5)',
  bgContainerStrong: 'rgba(15, 23, 43, 0.8)',
  bgHeader: 'rgba(2, 6, 24, 0.8)',
  bgElevated: '#0F172B',
  
  // Border
  border: '#1D293D',
  borderSubtle: 'rgba(29, 41, 61, 0.5)',
  
  // Text
  text: '#F1F5F9',
  textSecondary: '#90A1B9',
  textTertiary: '#62748E',
  textMuted: '#45556C',
  
  // Primary (Purple)
  primary: '#615FFF',
  primaryLight: '#7C86FF',
  primaryBg: 'rgba(97, 95, 255, 0.1)',
  primaryBgHover: 'rgba(97, 95, 255, 0.15)',
  
  // Brand (Figma brand mark)
  brand: '#4F39F6',
  
  // Status Colors
  success: '#00F5A0',
  warning: '#FFB020',
  error: '#FF375F',
  errorLight: '#FB2C36',
  
  // Gradients
  gradientPurple: 'linear-gradient(90deg, rgba(49, 44, 133, 0.1) 0%, rgba(0, 0, 0, 0) 50%, rgba(0, 0, 0, 0) 100%)',
  gradientPurpleGlow: 'linear-gradient(90deg, rgba(0, 0, 0, 0) 0%, rgba(97, 95, 255, 0.5) 50%, rgba(0, 0, 0, 0) 100%)',
  
  // Functional
  avatar: 'rgba(97, 95, 255, 0.15)',
  userCardBg: 'rgba(15, 23, 43, 0.85)',
  searchBg: '#0F172B',
  kbdBg: '#1D293D',
  kbdBorder: '#314158',
  separatorBg: '#1D293D',
} as const;

export const FigmaTypography = {
  // Font Families
  fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, Segoe UI, Roboto, Arial, "Noto Sans", "Helvetica Neue", sans-serif',
  fontFamilyCode: 'ui-monospace, "JetBrains Mono", Consolas, SFMono-Regular, Menlo, Monaco, "Liberation Mono", "Courier New", monospace',
  
  // Brand Text
  brandSize: '18px',
  brandWeight: 700,
  brandLetterSpacing: '-0.45px',
  
  // Navigation
  navLabelSize: '14px',
  navLabelHeight: '20px',
  navLabelWeight: 400,
  
  // Headers
  h1Size: '28px',
  h1Weight: 700,
  h2Size: '20px',
  h2Weight: 600,
  h3Size: '16px',
  h3Weight: 600,
  
  // Body
  bodySize: '14px',
  bodyHeight: '20px',
  bodyWeight: 400,
  
  // Small
  smallSize: '12px',
  smallHeight: '16px',
  smallWeight: 400,
  
  // Tiny
  tinySize: '10px',
  tinyHeight: '20px',
  tinyWeight: 400,
  
  // Index Info
  indexLabelSize: '12px',
  indexLabelHeight: '16px',
  indexValueSize: '14px',
  indexValueWeight: 700,
  
  // Search Placeholder
  searchPlaceholderSize: '14px',
  searchPlaceholderHeight: '16.1px',
} as const;

export const FigmaSpacing = {
  // Main Padding
  mainPaddingTop: '88px',
  mainPaddingX: '47.5px',
  mainPaddingBottom: '0px',
  
  // Sidebar
  sidebarWidth: '256px',
  sidebarBrandHeight: '80px',
  sidebarBrandPaddingLeft: '24px',
  sidebarNavPadding: '16px 16px 0px',
  sidebarNavGap: '4px',
  sidebarFooterPadding: '12px 16px 16px',
  
  // Navigation Item
  navItemHeight: '40px',
  navItemPadding: '0 12px',
  navItemGap: '12px',
  
  // User Card
  userCardPadding: '12px',
  userCardGap: '12px',
  
  // Avatar
  avatarSize: '32px',
  
  // Brand Mark
  brandMarkSize: '32px',
  brandMarkGap: '12px',
  
  // Header
  headerHeight: '64px',
  
  // Container Gap
  containerGap: '24px',
  containerGapLarge: '32px',
  
  // Card Padding
  cardPaddingLarge: '25px',
  cardPaddingMedium: '20px',
  cardPaddingSmall: '16px',
  
  // Content Max Width
  contentMaxWidth: '1504px',
} as const;

export const FigmaBorderRadius = {
  sm: '4px',
  md: '8px',
  lg: '10px',
  xl: '14px',
  full: '999px',
  circle: '9999px',
} as const;

export const FigmaEffects = {
  // Box Shadows
  brandShadow: '0px 4px 6px -4px rgba(97, 95, 255, 0.2), 0px 10px 15px -3px rgba(97, 95, 255, 0.2)',
  cardShadow: '0px 25px 50px -12px rgba(0, 0, 0, 0.25)',
  defaultShadow: '0px 8px 10px -6px rgba(0, 0, 0, 0.1), 0px 20px 25px -5px rgba(0, 0, 0, 0.1)',
  
  // Blur
  glowBlur: 'blur(128px)',
  
  // Glow Effects
  purpleGlow: {
    width: '256px',
    height: '256px',
    background: 'rgba(97, 95, 255, 0.1)',
    filter: 'blur(128px)',
    borderRadius: '9999px',
  },
} as const;

export const FigmaLayout = {
  // Main Content
  mainContentPadding: '88px 47.5px 0px 303.5px',
  
  // Card Dimensions
  heroCardHeight: '254.5px',
  dataCardHeight: '1182.81px',
  
  // Separator
  separatorWidth: '1px',
  separatorHeight: '32px',
  
  // Icon Sizes
  iconSm: '16px',
  iconMd: '18px',
  iconLg: '20px',
  iconXl: '24px',
  
  // Search Bar
  searchBarWidth: '384px',
  searchBarHeight: '34px',
  searchBarPadding: '6px 16px 6px 40px',
  
  // Kbd Tag
  kbdPadding: '2px 6px',
  kbdBorderWidth: '1px',
  
  // Live Tag (在用户卡片中)
  liveTagPadding: '2px 10px',
  liveTagBorderRadius: '999px',
} as const;

export const FigmaZIndex = {
  header: 100,
  sidebar: 50,
  modal: 1000,
  dropdown: 500,
  tooltip: 1001,
} as const;

export const FigmaTransitions = {
  default: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  fast: 'all 0.1s cubic-bezier(0.4, 0, 0.2, 1)',
  slow: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

/**
 * CSS变量导出 - 用于全局样式
 */
export const FigmaCSSVariables = `
  --sq-bg: ${FigmaColors.bg};
  --sq-bg-container: ${FigmaColors.bgContainer};
  --sq-bg-container-strong: ${FigmaColors.bgContainerStrong};
  --sq-bg-header: ${FigmaColors.bgHeader};
  --sq-bg-elevated: ${FigmaColors.bgElevated};
  
  --sq-border: ${FigmaColors.border};
  --sq-border-subtle: ${FigmaColors.borderSubtle};
  
  --sq-text: ${FigmaColors.text};
  --sq-text-secondary: ${FigmaColors.textSecondary};
  --sq-text-tertiary: ${FigmaColors.textTertiary};
  --sq-text-muted: ${FigmaColors.textMuted};
  
  --sq-primary: ${FigmaColors.primary};
  --sq-primary-light: ${FigmaColors.primaryLight};
  --sq-primary-bg: ${FigmaColors.primaryBg};
  --sq-primary-bg-hover: ${FigmaColors.primaryBgHover};
  
  --sq-brand: ${FigmaColors.brand};
  
  --sq-success: ${FigmaColors.success};
  --sq-warning: ${FigmaColors.warning};
  --sq-error: ${FigmaColors.error};
  
  --sq-shadow-brand: ${FigmaEffects.brandShadow};
  --sq-shadow-card: ${FigmaEffects.cardShadow};
  --sq-shadow-default: ${FigmaEffects.defaultShadow};
  
  --sq-radius-sm: ${FigmaBorderRadius.sm};
  --sq-radius-md: ${FigmaBorderRadius.md};
  --sq-radius-lg: ${FigmaBorderRadius.lg};
  --sq-radius-xl: ${FigmaBorderRadius.xl};
  --sq-radius-full: ${FigmaBorderRadius.full};
  
  --sq-font-family: ${FigmaTypography.fontFamily};
  --sq-font-family-code: ${FigmaTypography.fontFamilyCode};
  
  --sq-transition-default: ${FigmaTransitions.default};
  --sq-transition-fast: ${FigmaTransitions.fast};
  --sq-transition-slow: ${FigmaTransitions.slow};
`;
