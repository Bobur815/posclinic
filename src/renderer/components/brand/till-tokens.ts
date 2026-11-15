import { css } from 'styled-components';

/**
 * Design tokens of the till login / "waiting for main till" screens, verbatim from the Claude
 * Design export "POSCLINIC — Login - desktop". Scoped CSS variables: put `tillTokens(dark)` on
 * the screen's root element.
 */
const base = css`
  --pc-font: 'Manrope', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --pc-mono: 'JetBrains Mono', ui-monospace, monospace;
  --pc-radius-sm: 8px;
  --pc-radius-md: 12px;
  --pc-radius-lg: 18px;
  --pc-radius-xl: 24px;
  --pc-radius-pill: 999px;
  --pc-control-h: 56px;
  --pc-touch: 48px;
  --tl-fs-title: 30px;
  --tl-fs-input: 17px;
  --tl-fs-body: 16px;
  --tl-fs-label: 15px;
  --tl-fs-small: 14px;
  --tl-fs-name: 46px;
  --tl-fs-clock: 88px;
  --tl-form-w: 420px;
  --tl-pad: 48px;
  --pc-gradient-brand: linear-gradient(150deg, #0891b2 0%, #0e7490 62%, #0b5f76 100%);
  --pc-gradient-btn: linear-gradient(135deg, #0e7490 0%, #0b5f76 100%);
  --pc-shadow-btn: 0 6px 16px -6px rgba(14, 116, 144, 0.55);
  --pc-shadow-mark: 0 0 0 1px rgba(255, 255, 255, 0.18), 0 16px 32px -14px rgba(4, 47, 60, 0.6);
  --pc-online: #22c55e;
  --pc-connecting: #f59e0b;
  --pc-offline: #ef4444;
  --pc-strip-warn-bg: #f59e0b;
  --pc-strip-warn-text: #1f1300;
  --pc-strip-ro-bg: #b91c1c;
  --pc-strip-ro-text: #ffffff;
  --pc-ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --pc-dur: 150ms;

  /* 1920x1080 tills: everything a step larger (the design's .tl-xl). */
  @media (min-width: 1700px) and (min-height: 1000px) {
    --tl-fs-title: 36px;
    --tl-fs-input: 18px;
    --tl-fs-body: 17px;
    --tl-fs-label: 16px;
    --tl-fs-name: 60px;
    --tl-fs-clock: 120px;
    --tl-form-w: 480px;
    --tl-pad: 72px;
    --pc-control-h: 60px;
  }
`;

const light = css`
  --pc-bg: #f4fafb;
  --pc-surface: #ffffff;
  --pc-surface-2: #eef6f7;
  --pc-border: #d3e3e6;
  --pc-border-input: #7a959c;
  --pc-text: #0f2a30;
  --pc-text-muted: #4a6670;
  --pc-link: #0e7490;
  --pc-primary: #0e7490;
  --pc-focus: #0e7490;
  --pc-focus-ring: rgba(14, 116, 144, 0.28);
  --pc-chip-bg: #e6f3f5;
  --pc-chip-text: #0b5f76;
  --pc-disabled-bg: #eef2f3;
  --pc-danger-bg: #fef2f2;
  --pc-danger-border: #fca5a5;
  --pc-danger-text: #b91c1c;
  --pc-shadow-card: 0 1px 2px rgba(15, 42, 48, 0.05), 0 24px 48px -16px rgba(15, 42, 48, 0.22);
`;

const dark = css`
  --pc-bg: #0b1416;
  --pc-surface: #102024;
  --pc-surface-2: #16292e;
  --pc-border: #1f3a40;
  --pc-border-input: #5e7e86;
  --pc-text: #e3f2f4;
  --pc-text-muted: #9db8be;
  --pc-link: #67e8f9;
  --pc-primary: #0e7490;
  --pc-focus: #22d3ee;
  --pc-focus-ring: rgba(34, 211, 238, 0.32);
  --pc-chip-bg: #15343a;
  --pc-chip-text: #a5f3fc;
  --pc-disabled-bg: #142529;
  --pc-danger-bg: #2a1215;
  --pc-danger-border: #7f1d1d;
  --pc-danger-text: #fca5a5;
  --pc-shadow-card: 0 1px 2px rgba(0, 0, 0, 0.35), 0 24px 48px -16px rgba(0, 0, 0, 0.7);
`;

export const tillTokens = (isDark: boolean) => css`
  ${base}
  ${isDark ? dark : light}
  font-family: var(--pc-font);
  -webkit-font-smoothing: antialiased;
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  .tl-ic {
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  button:focus-visible,
  input[type='checkbox']:focus-visible {
    outline: 3px solid var(--pc-focus);
    outline-offset: 2px;
  }
`;

/** The microscope-field decoration shared by the visual panel and the overlay. */
export const decor = {
  grid: css`
    position: absolute;
    inset: 0;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.07) 1px, transparent 1px);
    background-size: 32px 32px;
  `,
  ring: css`
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.28);
  `,
  cell: css`
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: radial-gradient(
      circle at 35% 30%,
      rgba(255, 255, 255, 0.24),
      rgba(255, 255, 255, 0.04) 65%
    );
    &::after {
      content: '';
      position: absolute;
      left: 38%;
      top: 36%;
      width: 24%;
      height: 24%;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.3);
    }
  `,
};
