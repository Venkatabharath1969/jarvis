export const COLORS = {
  // Backgrounds
  background: '#0A0A0A',
  surface: '#141418',
  surfaceElevated: '#1C1C22',

  // Borders
  border: '#2a2a35',
  borderSubtle: '#1e1e28',

  // Text
  textPrimary: '#E0E0E0',
  textSecondary: '#888888',
  textMuted: '#555555',

  // Accents
  accent: '#00ADEF',
  accentDark: '#0090cc',
  accentDeep: '#005f8a',
  accent2: '#00D4AA',
  accent2Dark: '#00a882',

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
  userBubble: '#005f8a',
  userBubbleBorder: '#0090cc',

  // Assistant bubble bg
  assistantBubble: '#141418',
  assistantBubbleBorder: '#2a2a35',

  // Mic button
  micRing: 'rgba(0, 173, 239, 0.2)',
  micRingOuter: 'rgba(0, 173, 239, 0.08)',
  micListening: 'rgba(0, 212, 170, 0.25)',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.6)',
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const FONTS = {
  regular: undefined, // Uses system default
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
} as const;

export type ThemeColors = typeof COLORS;
