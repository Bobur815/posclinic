import styled, { css, keyframes } from 'styled-components';
import { decor } from './till-tokens';

/**
 * Building blocks shared by the till login and the "waiting for main till" overlay (design:
 * "POSCLINIC — Login - desktop"). They read the CSS variables set by `tillTokens()`.
 */

export type Conn = 'online' | 'connecting' | 'offline';

// ── Icons (Lucide paths, as in the design) ──────────────────────────────────────────────────

export const Svg = ({ children, size = 22 }: { children: React.ReactNode; size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="tl-ic">
    {children}
  </svg>
);
export const IconLock = () => (
  <Svg>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Svg>
);
export const IconMoon = () => (
  <Svg>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </Svg>
);
export const IconSun = () => (
  <Svg>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </Svg>
);
export const IconLogout = () => (
  <Svg size={18}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </Svg>
);

// ── Brand panel decoration ─────────────────────────────────────────────────────────────────

export const Grid = styled.div`
  ${decor.grid}
`;
export const Ring = styled.div<{ $dash?: boolean }>`
  ${decor.ring}
  ${({ $dash }) => $dash && 'border-style: dashed; border-color: rgba(255,255,255,.2);'}
`;
export const Cell = styled.div`
  ${decor.cell}
`;
export const MarkWrap = styled.span`
  display: block;
  flex: none;
  border-radius: 12px;
  box-shadow: var(--pc-shadow-mark);
`;
export const BrandWord = styled.span`
  font-family: 'Manrope', 'Inter', 'Poppins', system-ui, sans-serif;
  font-weight: 700;
  font-size: 26px;
  line-height: 1;
  letter-spacing: -0.01em;
  color: #ffffff;
`;

const pulse = keyframes`50% { opacity: .35; }`;
export const Dot = styled.span<{ $conn: Conn }>`
  width: 10px;
  height: 10px;
  flex: none;
  border-radius: 50%;
  box-shadow: 0 0 0 2px #ffffff;
  background: ${({ $conn }) => `var(--pc-${$conn})`};
  ${({ $conn }) =>
    $conn === 'connecting' &&
    css`
      animation: ${pulse} 1.2s ease-in-out infinite;
    `}
`;

// ── Form pieces ────────────────────────────────────────────────────────────────────────────

export const Title = styled.h1`
  margin: 0;
  font-size: var(--tl-fs-title);
  line-height: 1.2;
  font-weight: 800;
  letter-spacing: -0.02em;
`;

export const IconBtn = styled.button`
  width: var(--pc-touch);
  height: var(--pc-touch);
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--pc-text-muted);
  cursor: pointer;
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`;

const spin = keyframes`to { transform: rotate(360deg); }`;
export const Spinner = styled.span`
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2.5px solid rgba(255, 255, 255, 0.35);
  border-top-color: #ffffff;
  animation: ${spin} 0.8s linear infinite;
`;
export const BigSpinner = styled.span`
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 5px solid var(--pc-chip-bg);
  border-top-color: var(--pc-focus);
  animation: ${spin} 1s linear infinite;
`;

export const PrimaryBtn = styled.button<{ $locked?: boolean }>`
  width: 100%;
  height: var(--pc-control-h);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  border: 0;
  border-radius: var(--pc-radius-md);
  background: var(--pc-gradient-btn);
  color: #ffffff;
  font: inherit;
  font-size: 18px;
  font-weight: 700;
  cursor: pointer;
  box-shadow: var(--pc-shadow-btn);
  &:disabled {
    cursor: not-allowed;
  }
  &:focus-visible {
    outline-offset: 3px;
  }
  ${({ $locked }) =>
    $locked &&
    css`
      background: var(--pc-disabled-bg);
      color: var(--pc-text-muted);
      box-shadow: none;
      border: 1.5px dashed var(--pc-border-input);
    `}
`;

// ── Footer bar: language, theme, version ───────────────────────────────────────────────────

export const Bar = styled.footer`
  flex: none;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 32px;
  border-top: 1px solid var(--pc-border);
  background: var(--pc-surface);
`;
export const Seg = styled.div`
  display: inline-flex;
  border: 1px solid var(--pc-border-input);
  border-radius: var(--pc-radius-md);
  overflow: hidden;
  background: var(--pc-surface);
  button {
    min-width: 56px;
    height: var(--pc-touch);
    padding: 0 14px;
    border: 0;
    background: transparent;
    color: var(--pc-text);
    font: inherit;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.04em;
    cursor: pointer;
  }
  button[aria-pressed='true'] {
    background: var(--pc-primary);
    color: #ffffff;
  }
  button + button {
    border-left: 1px solid var(--pc-border-input);
  }
  button:focus-visible {
    outline-offset: -4px;
  }
`;
export const ThemeBtn = styled(IconBtn)`
  border: 1px solid var(--pc-border-input);
  background: var(--pc-surface);
  color: var(--pc-text);
`;
export const Version = styled.span`
  margin-left: auto;
  font-family: var(--pc-mono);
  font-size: 13px;
  font-weight: 500;
  color: var(--pc-text-muted);
`;
