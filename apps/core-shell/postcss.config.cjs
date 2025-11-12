const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

module.exports = {
  plugins: {
    tailwindcss: { config: '../module-projects/tailwind.config.ts' },
    autoprefixer: autoprefixer(),
  },
};
