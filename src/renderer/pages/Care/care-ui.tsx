import styled from 'styled-components';
import type { CaseStatus, ItemStatus } from '../../../shared/clinic';

/** Styled pieces shared by the queue and case pages (theme tokens, light + dark). */

export const Page = styled.div`
  max-width: 1100px;
`;
export const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0 0 ${({ theme }) => theme.spacing.md};
`;
export const Card = styled.section`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
export const CardTitle = styled.h2`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  margin: 0 0 ${({ theme }) => theme.spacing.sm};
`;
export const Muted = styled.span`
  display: block;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
export const Grid = styled.div<{ $cols?: number }>`
  display: grid;
  grid-template-columns: repeat(${({ $cols }) => $cols ?? 2}, minmax(0, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;
export const Label = styled.label`
  display: grid;
  gap: 4px;
  font-size: 12px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.textSecondary};
`;
const field = `
  width: 100%;
  padding: 8px 10px;
  font-size: 14px;
`;
export const Input = styled.input`
  ${field}
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
export const Textarea = styled.textarea`
  ${field}
  min-height: 70px;
  resize: vertical;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-family: inherit;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;
export const Select = styled.select`
  ${field}
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
`;
export const Btn = styled.button<{ $variant?: 'primary' | 'secondary' | 'danger' }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $variant }) =>
      $variant === 'primary'
        ? theme.colors.primary
        : $variant === 'danger'
          ? theme.colors.error
          : theme.colors.border};
  background: ${({ theme, $variant }) =>
    $variant === 'primary' ? theme.colors.primary : theme.colors.surface};
  color: ${({ theme, $variant }) =>
    $variant === 'primary'
      ? '#fff'
      : $variant === 'danger'
        ? theme.colors.error
        : theme.colors.text};
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  &:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;
export const Row = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.sm};
  padding: 8px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  &:first-of-type {
    border-top: 0;
  }
`;
export const Actions = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
`;
export const Empty = styled.p`
  margin: 0;
  padding: ${({ theme }) => theme.spacing.md} 0;
  text-align: center;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const tone = (s: string) =>
  s === 'WAITING_DOCTOR' || s === 'WAITING'
    ? 'warning'
    : s === 'RESULT_READY' || s === 'IN_PROGRESS'
      ? 'primary'
      : s === 'CLOSED' || s === 'DONE'
        ? 'success'
        : s === 'CANCELLED'
          ? 'error'
          : 'info';

export const StatusBadge = styled.span<{ $status: CaseStatus | ItemStatus | string }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  color: ${({ theme, $status }) => theme.colors[tone($status) as 'warning']};
  border: 1px solid ${({ theme, $status }) => theme.colors[tone($status) as 'warning']};
`;
