import { Platform } from 'react-native';

export const Colors = {
  // Brand colors from Stitch Design System
  primary: '#0a6859',
  primaryContainer: '#318171',
  primaryFixed: '#a3f2de',
  primaryFixedDim: '#87d5c2',
  onPrimary: '#ffffff',
  onPrimaryFixedVariant: '#005144',

  secondary: '#8b4e37',
  secondaryContainer: '#fdae91',
  secondaryFixed: '#ffdbcf',
  onSecondary: '#ffffff',
  onSecondaryContainer: '#783f29',

  accentCoral: '#F2A488',
  softTealBg: '#E8F2F0',
  softCoralBg: 'rgba(242, 164, 136, 0.15)',

  background: '#fbf9f5',
  surface: '#fbf9f5',
  surfaceVariant: '#e4e2de',
  surfaceContainer: '#efeeea',
  surfaceContainerLow: '#f5f3ef',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerHigh: '#eae8e4',
  surfaceContainerHighest: '#e4e2de',

  onSurface: '#1b1c1a',
  onSurfaceVariant: '#3f4946',
  outline: '#6f7976',
  outlineVariant: '#bec9c4',

  error: '#ba1a1a',
  errorContainer: '#ffdad6',
  onError: '#ffffff',

  // Light/Dark standard mappings
  light: {
    text: '#1b1c1a',
    background: '#fbf9f5',
    backgroundElement: '#efeeea',
    backgroundSelected: '#a3f2de',
    textSecondary: '#3f4946',
  },
  dark: {
    text: '#ffffff',
    background: '#141d1c',
    backgroundElement: '#212a29',
    backgroundSelected: '#0a6859',
    textSecondary: '#bfc9c7',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 40,
  eight: 48,
} as const;

export const Typography = {
  display: {
    fontSize: 32,
    fontWeight: '700' as const,
    letterSpacing: -0.5,
  },
  headlineLarge: {
    fontSize: 26,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
  },
  headlineMedium: {
    fontSize: 20,
    fontWeight: '600' as const,
  },
  bodyLarge: {
    fontSize: 16,
    fontWeight: '400' as const,
    lineHeight: 24,
  },
  bodyMedium: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
  },
  labelMedium: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
  },
};

export const Shadows = {
  soft: {
    shadowColor: '#4f9d8c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  card: {
    shadowColor: '#4f9d8c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  floating: {
    shadowColor: '#0a6859',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 6,
  },
};

export const BottomTabInset = 70;
export const MaxContentWidth = 800;
