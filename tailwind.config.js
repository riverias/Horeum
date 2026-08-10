/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#07080d",
          900: "#0b0d14",
          850: "#10131c",
          800: "#151926",
          700: "#1d2231",
          600: "#282f42",
        },
        accent: "rgb(var(--accent-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["Inter", "Manrope", "system-ui", "sans-serif"],
        display: ["Manrope", "Inter", "system-ui", "sans-serif"],
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        floaty: {
          "0%,100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        spinSlow: { to: { transform: "rotate(360deg)" } },
        equalize: {
          "0%,100%": { height: "20%" },
          "50%": { height: "100%" },
        },
        gradientShift: {
          "0%,100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 1.6s infinite",
        floaty: "floaty 5s ease-in-out infinite",
        "spin-slow": "spinSlow 14s linear infinite",
        equalize: "equalize .9s ease-in-out infinite",
        "gradient-shift": "gradientShift 12s ease infinite",
      },
      boxShadow: {
        glow: "0 0 40px -8px rgb(var(--accent-rgb) / .55)",
        card: "0 12px 40px -18px rgba(0,0,0,.85)",
      },
    },
  },
  plugins: [],
}
