import { useTranslation } from 'react-i18next';
import styled from 'styled-components';

/** Pieces shared by the stock, expenses and money report pages (theme tokens, light + dark). */

export const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  th,
  td {
    text-align: left;
    padding: 8px 6px;
    border-top: 1px solid ${({ theme }) => theme.colors.border};
    vertical-align: middle;
  }
  th {
    font-size: 12px;
    font-weight: 600;
    color: ${({ theme }) => theme.colors.textSecondary};
    border-top: 0;
  }
  td.num,
  th.num {
    text-align: right;
    white-space: nowrap;
  }
`;

export const Tabs = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;
export const Tab = styled.button<{ $active: boolean }>`
  padding: 8px 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ theme, $active }) => ($active ? theme.colors.primary : theme.colors.surface)};
  color: ${({ theme, $active }) => ($active ? '#fff' : theme.colors.text)};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
`;

export const Qty = styled.span<{ $state: 'ok' | 'low' | 'negative' }>`
  font-weight: 600;
  color: ${({ theme, $state }) =>
    $state === 'negative'
      ? theme.colors.error
      : $state === 'low'
        ? theme.colors.warning
        : theme.colors.text};
`;

export const Badge = styled.span<{ $tone?: 'muted' | 'warn' | 'bad' }>`
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid
    ${({ theme, $tone }) =>
      $tone === 'bad'
        ? theme.colors.error
        : $tone === 'warn'
          ? theme.colors.warning
          : theme.colors.border};
  color: ${({ theme, $tone }) =>
    $tone === 'bad'
      ? theme.colors.error
      : $tone === 'warn'
        ? theme.colors.warning
        : theme.colors.textSecondary};
`;

export const Figures = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: ${({ theme }) => theme.spacing.sm};
`;
const FigureBox = styled.div<{ $tone?: 'good' | 'bad' }>`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 10px 12px;
  span {
    display: block;
    font-size: 12px;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
  strong {
    display: block;
    margin-top: 4px;
    font-size: 18px;
    color: ${({ theme, $tone }) =>
      $tone === 'good'
        ? theme.colors.success
        : $tone === 'bad'
          ? theme.colors.error
          : theme.colors.text};
  }
`;
export function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <FigureBox $tone={tone}>
      <span>{label}</span>
      <strong>{value}</strong>
    </FigureBox>
  );
}

/** Money and quantity formatting in the till's language. */
export function useFormat() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'ru' ? 'ru-RU' : 'uz-UZ';
  return {
    money: (n: number) => `${Math.round(n).toLocaleString(locale)} ${t('common.currency')}`,
    qty: (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 3 }),
    date: (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(locale) : '—'),
    dateTime: (iso: string | null) => (iso ? new Date(iso).toLocaleString(locale) : '—'),
  };
}

/** `YYYY-MM-DD` of a local date. */
export function localDay(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parses a number typed with a comma or spaces; NaN when empty. */
export const parseNum = (s: string): number =>
  s.trim() === '' ? Number.NaN : Number(s.replace(/\s/g, '').replace(',', '.'));
