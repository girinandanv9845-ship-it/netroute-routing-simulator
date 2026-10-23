/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'Consolas', 'monospace'],
      },
      colors: {
        ink: {
          950: '#05080f',
          900: '#0a0f1c',
          850: '#0d1424',
          800: '#111a2e',
          700: '#1a2540',
          600: '#26334f',
          500: '#3a4a6b',
        },
      },
      keyframes: {
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.7' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        fadeIn: { '0%': { opacity: '0', transform: 'translateY(4px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: {
        pulseRing: 'pulseRing 1.6s ease-out infinite',
        fadeIn: 'fadeIn 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
