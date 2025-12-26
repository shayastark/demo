/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'neon-green': 'var(--neon-green)',
      },
      animation: {
        'spin-reel': 'spin 2s linear infinite',
        'spin-reel-reverse': 'spin 2s linear infinite reverse',
      },
    },
  },
  plugins: [],
}

