import { Persona } from '../types';

export interface Theme {
  colors: {
    primary: string;
    primaryLight: string;
    primaryDark: string;
    background: string;
    backgroundSecondary: string;
    backgroundTertiary: string;
    text: string;
    textSecondary: string;
    textMuted: string;
    border: string;
    error: string;
    success: string;
    warning: string;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
    full: number;
  };
  fontSize: {
    xs: number;
    sm: number;
    base: number;
    md: number;
    lg: number;
    xl: number;
  };
}

const baseTheme = {
  spacing: {
    xs: 6,
    sm: 12,
    md: 20,
    lg: 28,
    xl: 40,
  },
  borderRadius: {
    sm: 6,
    md: 12,
    lg: 20,
    full: 9999,
  },
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    md: 18,
    lg: 22,
    xl: 26,
  },
};

export const ladybugTheme: Theme = {
  ...baseTheme,
  colors: {
    primary: '#f21c1e',
    primaryLight: '#ff4d4f',
    primaryDark: '#c41618',
    background: '#000000',
    backgroundSecondary: '#1a1a1a',
    backgroundTertiary: '#2a2a2a',
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textMuted: '#606060',
    border: '#2a2a2a',
    error: '#ff4d4f',
    success: '#4CAF50',
    warning: '#FF9800',
  },
};

export const chatNoirTheme: Theme = {
  ...baseTheme,
  colors: {
    primary: '#4a9c2d',
    primaryLight: '#5cb338',
    primaryDark: '#3a7a23',
    background: '#000000',
    backgroundSecondary: '#1a1a1a',
    backgroundTertiary: '#2a2a2a',
    text: '#ffffff',
    textSecondary: '#a0a0a0',
    textMuted: '#606060',
    border: '#2a2a2a',
    error: '#ff4d4f',
    success: '#4CAF50',
    warning: '#FF9800',
  },
};

export const assistantTheme: Theme = {
  ...baseTheme,
  colors: {
    primary: '#3b82f6',
    primaryLight: '#60a5fa',
    primaryDark: '#1d4ed8',
    background: '#000000',
    backgroundSecondary: '#141821',
    backgroundTertiary: '#1d2430',
    text: '#ffffff',
    textSecondary: '#a7b1c2',
    textMuted: '#64748b',
    border: '#263140',
    error: '#ff4d4f',
    success: '#4CAF50',
    warning: '#FF9800',
  },
};

export const getTheme = (persona: Persona): Theme => {
  if (persona === 'ladybug') return ladybugTheme;
  if (persona === 'chatnoir') return chatNoirTheme;
  return assistantTheme;
};
