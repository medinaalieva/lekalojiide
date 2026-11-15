/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#faf8f5",
          100: "#f5f0eb",
          200: "#ebdcd0",
          300: "#dec4b0",
          400: "#c79e7f",
          500: "#b3815c",
          600: "#986744",
          700: "#7b5035",
          800: "#603e2a",
          900: "#492f20",
          950: "#2a1a11",
        },
        atelier: {
          surface: "#FBFBFB",
          subtle: "#F4F3F0",
          charcoal: "#1C1B1A",
          muted: "#73706B",
          border: "#E7E5E0",
          accent: "#9C7A5B",
        },
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};
