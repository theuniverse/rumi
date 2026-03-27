/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:     "#0c0c0c",
        surface:  "#141414",
        elevated: "#1c1c1c",
        rim:      "#262626",    // borders
        muted:    "#3a3a3a",
        sand:     "#c8b89a",    // warm accent
        "sand-dim":"#7a6e5f",
        live:     "#4d9e6e",    // active recording
        amber:    "#c4913a",    // analyzing
        soft:     "#f0f0f0",    // primary text
        ghost:    "#8a8a8a",    // secondary text
        faint:    "#444444",    // muted text
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "'Fira Code'", "ui-monospace", "monospace"],
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      fontSize: {
        "10xl": "10rem",
        "11xl": "12rem",
      },
    },
  },
  plugins: [],
};
