import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f5f7f1",
          100: "#e9eee2",
          200: "#d4dfc9",
          400: "#97aa8d",
          600: "#60715a",
          800: "#344b3d",
          900: "#1b362a",
        },
      },
    },
  },
  plugins: [],
};
export default config;
