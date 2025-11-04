import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0f172a',
        accent: '#38bdf8'
      }
    }
  },
  plugins: []
};

export default config;

