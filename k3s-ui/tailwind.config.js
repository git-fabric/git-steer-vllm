/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0a0a0f',
        paper: '#f0ede6',
        accent: '#e8440a',
        accent2: '#1a3fff',
        muted: '#7a7570',
        rule: '#d0cdc6',
      },
      fontFamily: {
        mono: ['"Space Mono"', 'monospace'],
        display: ['"Bebas Neue"', 'sans-serif'],
        sans: ['"DM Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
