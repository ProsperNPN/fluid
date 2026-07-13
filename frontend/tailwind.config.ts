import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        fluid: {
          50: '#fef2f2',
          600: '#dc2626',
          700: '#b91c1c',
          800: '#991b1b'
        }
      }
    }
  },
  plugins: []
};

export default config;
