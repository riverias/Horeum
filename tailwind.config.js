/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        ink: {
          950: "#06060a",
          900: "#0a0a12",
          850: "#0e0e18",
          800: "#12121e",
          700: "#1a1a2a",
          600: "#242438",
          500: "#33334d",
        },
      },
      fontFamily: {
        sans: ["Inter", "Manrope", "SF Pro Display", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "20px",
        "3xl": "28px",
      },
      boxShadow: {
        glow: "0 0 30px -6px rgb(var(--accent-rgb) / 0.55)",
        "glow-lg": "0 0 70px -10px rgb(var(--accent-rgb) / 0.65)",
        panel: "0 24px 70px -20px rgba(0,0,0,0.85)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "none" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        spinSlow: { to: { transform: "rotate(360deg)" } },
        pulseRing: {
          "0%": { boxShadow: "0 0 0 0 rgb(var(--accent-rgb) / 0.6)" },
          "70%": { boxShadow: "0 0 0 14px rgb(var(--accent-rgb) / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(var(--accent-rgb) / 0)" },
        },
        gradientShift: {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-in": "fade-in .35s cubic-bezier(.2,.8,.2,1) both",
        shimmer: "shimmer 1.6s infinite",
        float: "float 5s ease-in-out infinite",
        "spin-slow": "spinSlow 12s linear infinite",
        "pulse-ring": "pulseRing 2.2s infinite",
        "gradient-shift": "gradientShift 14s ease infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
