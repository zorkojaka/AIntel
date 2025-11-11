import './styles.css';
import { tokens } from './tokens';

export type ThemeName = 'light' | 'dark';

const themePalette: Record<ThemeName, Record<string, string>> = {
  light: {
    '--color-primary': '#0f62fe',
    '--color-surface': '#ffffff',
    '--color-text': '#0f172a',
    '--color-border': '#e2e8f0'
  },
  dark: {
    '--color-primary': '#2563eb',
    '--color-surface': '#0f172a',
    '--color-text': '#f8fafc',
    '--color-border': '#1e293b'
  }
};

export function applyTheme(themeName: ThemeName = 'light') {
  const root = document.documentElement;
  const themeTokens = themePalette[themeName];
  Object.entries(themeTokens).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
  root.dataset.theme = themeName;
}

export { tokens };
