import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        pos: {
          50: '#FAF5F9',
          100: '#F0E6EE',
          200: '#DCC8D9',
          300: '#C4A3BD',
          400: '#9B6E91',
          500: '#714B67',
          600: '#5D3D55',
          700: '#4A3044',
          800: '#362333',
          900: '#231622',
        },
        success: '#12B76A',
        warning: '#F79009',
        danger: '#F04438',
        brand: {
          50: '#EAEFFE',
          100: '#D5DFFE',
          200: '#ABBDFE',
          300: '#829DFD',
          400: '#587CFC',
          500: '#2A50D8',
          600: '#213EAF',
          700: '#172C85',
          800: '#0E1A5C',
          900: '#050833',
        },
        teal: {
          50: '#E7F6F5',
          100: '#D0ECE9',
          200: '#A1D9D4',
          300: '#72C5BE',
          400: '#43B2A9',
          500: '#12A594',
          600: '#0E8476',
          700: '#0B6359',
          800: '#07423B',
          900: '#04211E',
        },
        status: {
          success: '#12B76A',
          warning: '#F79009',
          danger: '#F04438',
          info: '#3B82F6'
        },
        gray: {
          0: '#FFFFFF',
          50: '#F9FAFB',
          100: '#F3F4F6',
          200: '#E5E7EB',
          300: '#D1D5DB',
          400: '#9CA3AF',
          500: '#6B7280',
          600: '#4B5563',
          700: '#374151',
          800: '#1F2937',
          900: '#111827',
          950: '#030712'
        },
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        card: 'var(--card)',
        border: 'var(--border)',
      },
      fontFamily: {
        sans: ['var(--font-inter)'],
      },
    },
  },
  plugins: [],
};

export default config;
