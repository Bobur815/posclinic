import { forwardRef, type InputHTMLAttributes } from 'react';
import styled, { css } from 'styled-components';
import { formatPhoneLocal, phoneFieldValue } from '../../../shared/phone';

/**
 * The till's phone field, as on the login page: a phone icon, a fixed "+998" chip and the 9
 * local digits formatted as they are typed ("90 123 45 67"). The form always gets the canonical
 * `+998XXXXXXXXX` (or '' when empty; partial while typing), whatever was pasted.
 *
 *   <PhoneInput value={form.phone} onChange={(phone) => setForm({ ...form, phone })} />
 *
 * `variant`: 'form' (theme tokens, the size of the other inputs, default) or 'till' (the login
 * screen's large field, its --pc-* tokens from components/brand/till-tokens.ts).
 */

export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: string | null | undefined;
  onChange: (phone: string) => void;
  invalid?: boolean;
  variant?: 'form' | 'till';
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, invalid, variant = 'form', disabled, placeholder = '90 123 45 67', ...rest },
  ref,
) {
  return (
    <Box $variant={variant} $invalid={invalid} $disabled={disabled}>
      <PhoneIcon />
      <Chip $variant={variant} aria-hidden="true">
        +998
      </Chip>
      <input
        ref={ref}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        maxLength={12}
        placeholder={placeholder}
        value={formatPhoneLocal(value)}
        onChange={(e) => onChange(phoneFieldValue(e.target.value))}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        {...rest}
      />
    </Box>
  );
});

const PhoneIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    style={{ flex: 'none' }}
  >
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
);

const formBox = css<{ $invalid?: boolean; $disabled?: boolean }>`
  gap: 8px;
  height: 38px;
  padding: 0 12px;
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.textSecondary)};
  &:focus-within {
    border-color: ${({ theme, $invalid }) =>
      $invalid ? theme.colors.error : theme.colors.primary};
    color: ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.primary)};
  }
  ${({ $disabled }) => $disabled && 'opacity: 0.6;'}
  input {
    font-size: 14px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.text};
  }
  input::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

/** The login page's FieldBox (LoginPage.tsx), on the till's --pc-* tokens. */
const tillBox = css<{ $invalid?: boolean; $disabled?: boolean }>`
  gap: 10px;
  height: var(--pc-control-h);
  padding: 0 16px;
  border: 1.5px solid var(--pc-border-input);
  border-radius: var(--pc-radius-md);
  background: var(--pc-surface);
  color: var(--pc-text-muted);
  &:focus-within {
    border: 2px solid var(--pc-focus);
    padding-left: 15.5px;
    box-shadow: 0 0 0 4px var(--pc-focus-ring);
    color: var(--pc-focus);
  }
  ${({ $invalid }) =>
    $invalid &&
    css`
      border-color: var(--pc-danger-text);
      color: var(--pc-danger-text);
      &:focus-within {
        border-color: var(--pc-danger-text);
        color: var(--pc-danger-text);
      }
    `}
  ${({ $disabled }) =>
    $disabled &&
    css`
      background: var(--pc-disabled-bg);
      border-style: dashed;
    `}
  input {
    font-size: var(--tl-fs-input);
    font-weight: 600;
    color: var(--pc-text);
    letter-spacing: 0.01em;
  }
  input::placeholder {
    color: var(--pc-text-muted);
  }
  input:disabled {
    cursor: not-allowed;
    color: var(--pc-text-muted);
  }
`;

const Box = styled.div<{ $variant: 'form' | 'till'; $invalid?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  width: 100%;
  ${({ $variant }) => ($variant === 'till' ? tillBox : formBox)}
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font-family: inherit;
  }
  input::placeholder {
    font-weight: 400;
    opacity: 1;
  }
`;

const Chip = styled.span<{ $variant: 'form' | 'till' }>`
  flex: none;
  border-radius: ${({ $variant, theme }) =>
    $variant === 'till' ? 'var(--pc-radius-sm)' : theme.borderRadius};
  background: ${({ $variant, theme }) =>
    $variant === 'till' ? 'var(--pc-chip-bg)' : `${theme.colors.primary}18`};
  color: ${({ $variant, theme }) =>
    $variant === 'till' ? 'var(--pc-chip-text)' : theme.colors.primary};
  padding: ${({ $variant }) => ($variant === 'till' ? '4px 9px' : '2px 7px')};
  font-size: ${({ $variant }) => ($variant === 'till' ? '15px' : '13px')};
  font-weight: 700;
`;
