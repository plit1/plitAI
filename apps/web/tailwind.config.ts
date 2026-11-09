import type { Config } from 'tailwindcss';
/** 데모 v2.9 디자인 토큰 (index.html :root 변수에서 추출) */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: v('paper'), surface: v('surface'), ink: { DEFAULT: v('ink'), soft: v('ink-soft'), mute: v('ink-mute'), line: v('line') },
        cobalt: { DEFAULT: v('cobalt'), deep: v('cobalt-deep'), tint: v('cobalt-tint') },
        clear: { DEFAULT: 'rgb(200 242 58 / <alpha-value>)', deep: v('clear-deep'), tint: v('clear-tint') },
        night: 'rgb(14 21 48 / <alpha-value>)', risk: { DEFAULT: v('risk'), tint: v('risk-tint') },
        gold: { DEFAULT: v('gold'), tint: v('gold-tint') }, mint: { DEFAULT: v('mint'), tint: v('mint-tint') },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans KR"', 'system-ui', '-apple-system', '"Apple SD Gothic Neo"', '"Malgun Gothic"', 'sans-serif'],
        display: ['Archivo', '"Noto Sans KR"', 'sans-serif'],
      },
    },
  },
} satisfies Config;
