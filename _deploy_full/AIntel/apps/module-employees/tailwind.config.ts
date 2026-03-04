import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}', '../../packages/ui/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        lg: '12px',
        md: '10px',
        sm: '8px',
      },
      colors: {
        primary: '#0F63F7',
        muted: '#f8fafc',
      },
    },
  },
  plugins: [],
};

export default config;
