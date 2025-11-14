import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    '../module-projects/src/**/*.{js,jsx,ts,tsx,css}',
    '../module-crm/src/**/*.{js,jsx,ts,tsx,css}',
    '../module-cenik/src/**/*.{js,jsx,ts,tsx,css}',
    '../module-finance/src/**/*.{js,jsx,ts,tsx,css}',
    '../module-settings/src/**/*.{js,jsx,ts,tsx,css}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
