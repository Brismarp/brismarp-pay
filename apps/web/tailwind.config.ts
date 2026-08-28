import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f7f8f9",
          100: "#eceef0",
          200: "#d5d9de",
          400: "#9aa3ac",
          600: "#5b6570",
          800: "#2e343a",
          900: "#1a1d21",
        },
      },
    },
  },
  plugins: [],
};
export default config;
