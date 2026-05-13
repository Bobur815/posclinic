export interface Theme {
  colors: {
    primary: string;
    secondary: string;
    background: string;
    surface: string;
    text: string;
    textSecondary: string;
    border: string;
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  spacing: {
    xs: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
  };
  borderRadius: string;
  shadows: {
    sm: string;
    md: string;
    lg: string;
  };
}

export const lightTheme: Theme = {
  colors: {
    primary: '#0891b2',
    secondary: '#0e7490',
    background: '#f0f9ff',
    surface: '#ffffff',
    text: '#0c1a27',
    textSecondary: '#4b6a7e',
    border: '#bae6fd',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    info: '#0891b2',
  },
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
  },
  borderRadius: '8px',
  shadows: {
    sm: '0 1px 3px rgba(8,145,178,0.10)',
    md: '0 4px 6px rgba(8,145,178,0.14)',
    lg: '0 10px 20px rgba(8,145,178,0.18)',
  },
};

export const darkTheme: Theme = {
  colors: {
    primary: '#22d3ee',
    secondary: '#06b6d4',
    background: '#0a1929',
    surface: '#0d2035',
    text: '#e2f4fb',
    textSecondary: '#7eb8cc',
    border: '#1e4060',
    success: '#4ade80',
    error: '#f87171',
    warning: '#fbbf24',
    info: '#38bdf8',
  },
  spacing: lightTheme.spacing,
  borderRadius: '8px',
  shadows: {
    sm: '0 1px 3px rgba(0,0,0,0.5)',
    md: '0 4px 6px rgba(0,0,0,0.6)',
    lg: '0 10px 20px rgba(0,0,0,0.7)',
  },
};
