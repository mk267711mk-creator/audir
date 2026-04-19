/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
      },
      animation: {
        'bounce-in': 'bounceIn 0.4s ease-out',
        'fade-in': 'fadeIn 0.3s ease-out',
        'shake': 'shake 0.4s ease-out',
        'pulse-ring': 'pulseRing 1s ease-out',
      },
      keyframes: {
        bounceIn: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '70%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-8px)' },
          '75%': { transform: 'translateX(8px)' },
        },
        pulseRing: {
          '0%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(59,130,246,0.5)' },
          '70%': { transform: 'scale(1)', boxShadow: '0 0 0 12px rgba(59,130,246,0)' },
          '100%': { transform: 'scale(0.95)', boxShadow: '0 0 0 0 rgba(59,130,246,0)' },
        },
      },
    },
  },
  plugins: [],
}
