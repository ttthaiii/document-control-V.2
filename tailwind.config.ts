import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-noto-sans-thai-looped)', 'sans-serif'],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        surface: {
          DEFAULT: '#ffffff',
          raised: '#f8fafc',
          muted: '#f1f5f9',
        },
        border: {
          subtle: '#e2e8f0',
          DEFAULT: '#cbd5e1',
        },
        brand: {
          DEFAULT: '#f97316',
          light: '#ffedd5',
        },
        'text-body': '#0f172a',
        'text-secondary': '#64748b',
      },
      zIndex: {
        'modal': '50',
        'modal-elevated': '60',
        'modal-top': '100',
        'tooltip': '200',
      },
    },
  },
  plugins: [],
};
export default config;
