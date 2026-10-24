import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#029E4D',
          'green-light': '#EBFBF2',
          'green-border': '#B7E8CE',
          'green-hover': '#028540',
        },
        slate: {
          bg: '#FAFBFC',
          card: '#FFFFFF',
          border: '#EBEFF2',
          input: '#F4F5F7',
          subtle: '#8A92A6',
          text: '#171A21',
        },
      },
    },
  },
  plugins: [],
};

export default config;
