export const COLORS = {
  // Backgrounds — deep OLED blacks, AMG Night Edition
  background: '#070709',
  surface: '#0E0E12',
  surfaceElevated: '#16161C',
  surfaceGlass: 'rgba(255,255,255,0.04)',

  // Borders — platinum-fine lines
  border: '#232330',
  borderSubtle: '#18181F',
  borderGold: 'rgba(196,160,92,0.35)',

  // Text
  textPrimary: '#EEF0F4',
  textSecondary: '#7A7D8C',
  textMuted: '#3E4050',

  // Primary accent — Mercedes silver-blue
  accent: '#00ADEF',
  accentDark: '#0090cc',
  accentDeep: '#003B66',
  accent2: '#00D4AA',
  accent2Dark: '#00a882',

  // Gold accent — active state, premium highlight (AMG badge #C9A84C)
  gold: '#C9A84C',
  goldDim: 'rgba(201,168,76,0.18)',
  goldGlow: 'rgba(201,168,76,0.08)',

  // Platinum — idle ring, fine lines
  platinum: '#B8C2CC',
  platinumDim: 'rgba(184,194,204,0.12)',

  // Status
  danger: '#FF4466',
  dangerBg: 'rgba(255, 68, 102, 0.15)',
  warning: '#FFAA00',
  warningBg: 'rgba(255, 170, 0, 0.15)',
  success: '#00D4AA',
  successBg: 'rgba(0, 212, 170, 0.15)',

  // Purple
  purple: '#8855FF',
  purpleBg: 'rgba(136, 85, 255, 0.15)',

  // User bubble bg
  userBubble: '#003B66',
  userBubbleBorder: '#005f8a',

  // Assistant bubble bg
  assistantBubble: '#0E0E12',
  assistantBubbleBorder: '#232330',

  // Mic button
  micRing: 'rgba(0, 173, 239, 0.18)',
  micRingOuter: 'rgba(0, 173, 239, 0.06)',
  micListening: 'rgba(0, 212, 170, 0.22)',

  // Suggestion chips
  chipBg: 'rgba(201,168,76,0.07)',
  chipBorder: 'rgba(201,168,76,0.28)',
  chipText: '#C9A84C',
  chipTextDim: 'rgba(201,168,76,0.6)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.7)',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const FONTS = {
  regular: undefined,
  medium: undefined,
  bold: undefined,
  sizes: {
    xs: 10,
    sm: 12,
    base: 14,
    md: 16,
    lg: 18,
    xl: 22,
    xxl: 28,
    xxxl: 36,
  },
  weights: {
    regular: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
    extraBold: '800' as const,
  },
} as const;

export const SIZES = {
  // Spacing
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,

  // Radius
  radiusSm: 6,
  radiusMd: 12,
  radiusLg: 20,
  radiusFull: 9999,

  // Mic button
  micButtonSize: 120,
  micInnerSize: 88,
  micIconSize: 36,

  // Nav
  tabBarHeight: 60,
  headerHeight: 56,

  // Messages
  bubbleMaxWidth: '80%' as const,

  // Suggestion chips
  chipHeight: 34,
  chipPaddingH: 14,
} as const;

export type ThemeColors = typeof COLORS;
