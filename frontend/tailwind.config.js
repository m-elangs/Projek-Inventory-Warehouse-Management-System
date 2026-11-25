/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#F7F8FA',
        surface: '#FFFFFF',
        ink: {
          DEFAULT: '#171A21',
          secondary: '#667085',
          muted: '#98A2B3',
        },
        line: {
          DEFAULT: '#E6E8EC',
          strong: '#D0D5DD',
        },
        brand: {
          DEFAULT: '#334E85',
          hover: '#283E6B',
          subtle: '#EEF2F8',
          muted: '#D8E1F0',
        },
        status: {
          success: '#16845B',
          'success-bg': '#ECFDF5',
          'success-border': '#A7F3D0',
          warning: '#B7791F',
          'warning-bg': '#FFFBEB',
          'warning-border': '#FDE68A',
          danger: '#C2413B',
          'danger-bg': '#FEF2F2',
          'danger-border': '#FECACA',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
      boxShadow: {
        panel: '0 1px 2px 0 rgba(23, 26, 33, 0.04)',
        modal: '0 12px 28px -6px rgba(23, 26, 33, 0.14), 0 4px 10px -4px rgba(23, 26, 33, 0.06)',
      },
    },
  },
  plugins: [],
};
