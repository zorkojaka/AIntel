import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    // every module rendered by the shell, so new modules don't silently lose styles
    '../module-*/src/**/*.{js,jsx,ts,tsx,css}',
    '../../packages/ui/src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
