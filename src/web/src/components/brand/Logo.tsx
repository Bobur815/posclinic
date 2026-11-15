import { useId } from 'react';
import styled from 'styled-components';

/**
 * The posclinic mark ("lens": microscope field of view + cut-out plus + one cell), drawn from
 * images/posclinic-icon.svg and posclinic-icon-small.svg verbatim. Each instance gets its own
 * gradient id: two copies on one page with the same id break the fill in some browsers.
 */
export function LogoMark({
  size = 48,
  small,
  label,
}: {
  size?: number;
  /** The simplified mark (thicker ring, no cell) for sizes under 40px. */
  small?: boolean;
  /** Accessible name; omit when a visible wordmark sits next to it (then it is decorative). */
  label?: string;
}) {
  const gid = `pcBg-${useId().replace(/:/g, '')}`;
  const useSmall = small ?? size < 40;
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const };
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      width={size}
      height={size}
      style={{ display: 'block', flex: 'none' }}
      {...a11y}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0891b2" />
          <stop offset="1" stopColor="#0e7490" />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="224" fill={`url(#${gid})`} />
      {useSmall ? (
        <>
          <circle cx="512" cy="512" r="388" fill="none" stroke="#ffffff" strokeWidth="120" />
          <path
            fill="#ffffff"
            fillRule="evenodd"
            d="M256 512A256 256 0 1 0 768 512A256 256 0 1 0 256 512ZM576 384V448H640A64 64 0 0 1 640 576H576V640A64 64 0 0 1 448 640V576H384A64 64 0 0 1 384 448H448V384A64 64 0 0 1 576 384Z"
          />
        </>
      ) : (
        <>
          <circle cx="512" cy="512" r="292" fill="none" stroke="#ffffff" strokeWidth="80" />
          <path
            fill="#ffffff"
            fillRule="evenodd"
            d="M376 512A136 136 0 1 0 648 512A136 136 0 1 0 376 512ZM548 436V476H588A36 36 0 0 1 588 548H548V588A36 36 0 0 1 476 588V548H436A36 36 0 0 1 436 476H476V436A36 36 0 0 1 548 436Z"
          />
          <circle cx="649.18" cy="374.82" r="34" fill="#ffffff" />
        </>
      )}
    </svg>
  );
}

const Word = styled.span<{ $size: number; $onBrand?: boolean; $dark?: boolean }>`
  font-family: 'Manrope', 'Inter', 'Poppins', system-ui, sans-serif;
  font-weight: 700;
  font-size: ${({ $size }) => $size}px;
  line-height: 1;
  letter-spacing: -0.01em;
  white-space: nowrap;
  .pos {
    color: ${({ $onBrand, $dark }) => ($onBrand ? '#ffffff' : $dark ? '#e6f4f6' : '#0e3b46')};
  }
  .clinic {
    color: ${({ $onBrand, $dark }) => ($onBrand ? '#ffffff' : $dark ? '#22b8d6' : '#0891b2')};
  }
`;

/** "posclinic" as live text: "pos" dark, "clinic" brand cyan; all white on the cyan panel. */
export function Wordmark({
  size = 26,
  onBrand,
  dark,
}: {
  size?: number;
  onBrand?: boolean;
  dark?: boolean;
}) {
  return (
    <Word $size={size} $onBrand={onBrand} $dark={dark}>
      <span className="pos">pos</span>
      <span className="clinic">clinic</span>
    </Word>
  );
}
