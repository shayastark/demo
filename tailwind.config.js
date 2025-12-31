/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        outfit: ['var(--font-outfit)', 'sans-serif'],
      },
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        'neon-green': 'var(--neon-green)',
        'electric-teal': 'var(--electric-teal)',
        'success': 'var(--success)',
        'warning': 'var(--warning)',
        'error': 'var(--error)',
        'info': 'var(--info)',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(57, 255, 20, 0.3)',
        'glow-strong': '0 0 30px rgba(57, 255, 20, 0.5), 0 0 60px rgba(57, 255, 20, 0.2)',
        'glow-teal': '0 0 20px rgba(0, 217, 255, 0.3)',
      },
      animation: {
        'spin-reel': 'spin 2s linear infinite',
        'spin-reel-reverse': 'spin 2s linear infinite reverse',
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': {
            boxShadow: '0 0 20px rgba(57, 255, 20, 0.3), 0 0 40px rgba(57, 255, 20, 0.1)',
          },
          '50%': {
            boxShadow: '0 0 30px rgba(57, 255, 20, 0.5), 0 0 60px rgba(57, 255, 20, 0.2)',
          },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #39FF14 0%, #00D9FF 100%)',
        'gradient-dark': 'linear-gradient(180deg, #000000 0%, #0a0a0a 50%, #000000 100%)',
      },
    },
  },
  plugins: [],
}

