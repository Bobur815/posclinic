import { forwardRef, type InputHTMLAttributes } from 'react';
import styled from 'styled-components';
import { formatPhoneLocal, phoneFieldValue } from '@shared/phone';

/**
 * The dashboard's phone field, the same pattern as the till's (src/renderer/components/form/
 * PhoneInput.tsx): a phone icon, a fixed "+998" chip and the 9 local digits formatted as they
 * are typed. The form always gets `+998XXXXXXXXX` (or '' when empty, partial while typing).
 *
 *   <PhoneInput value={phone} onChange={setPhone} />
 */
export interface PhoneInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  value: string | null | undefined;
  onChange: (phone: string) => void;
  invalid?: boolean;
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(function PhoneInput(
  { value, onChange, invalid, disabled, placeholder = '90 123 45 67', ...rest },
  ref,
) {
  return (
    <Box $invalid={invalid} $disabled={disabled}>
      <svg
        width="15"
        height="15"
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
      <Chip aria-hidden="true">+998</Chip>
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

const Box = styled.div<{ $invalid?: boolean; $disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  height: 36px;
  border: 1px solid
    ${({ theme, $invalid }) => ($invalid ? theme.colors.error : theme.colors.border)};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  ${({ $disabled }) => $disabled && 'opacity: 0.6;'}
  &:focus-within {
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 2px ${({ theme }) => theme.colors.primary}30;
    color: ${({ theme }) => theme.colors.primary};
  }
  input {
    flex: 1;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    outline: 0;
    background: transparent;
    font: inherit;
    font-size: 14px;
    font-weight: 500;
    color: ${({ theme }) => theme.colors.text};
  }
  input::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
    font-weight: 400;
  }
`;

const Chip = styled.span`
  flex: none;
  padding: 1px 7px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary}18;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  font-weight: 700;
`;
