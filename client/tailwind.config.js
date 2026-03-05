/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: '#0B0F19', // Dark background
        surface: '#1A1F2C', // Card background
        primary: '#3B82F6', // Brand blue
        accent: '#8B5CF6', // Purple accent
      }
    },
  },
  plugins: [],
}

