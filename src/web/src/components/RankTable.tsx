import { useTranslation } from 'react-i18next';
import { Table, Td, Th, Tr } from './ui';
import { formatMoney, formatNumber } from '../lib/format';
import type { ReportBreakdownRow } from '../api/client';

/** name / visits / revenue (+ paid and debt when the server sends them). */
export function RankTable({ rows, nameLabel }: { rows: ReportBreakdownRow[]; nameLabel: string }) {
  const { t } = useTranslation();
  const hasPaid = rows.some((r) => r.paid !== undefined);
  const hasDebt = rows.some((r) => r.debt !== undefined);
  return (
    <div style={{ overflowX: 'auto' }}>
      <Table>
        <thead>
          <tr>
            <Th>{nameLabel}</Th>
            <Th $right>{t('reports.visits')}</Th>
            <Th $right>{t('reports.revenue')}</Th>
            {hasPaid && <Th $right>{t('reports.paid')}</Th>}
            {hasDebt && <Th $right>{t('reports.debt')}</Th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Tr key={`${r.name}-${i}`}>
              <Td>{r.name}</Td>
              <Td $right>{formatNumber(r.count ?? r.visits ?? 0)}</Td>
              <Td $right $nowrap>
                {formatMoney(r.revenue)}
              </Td>
              {hasPaid && (
                <Td $right $nowrap>
                  {formatMoney(r.paid ?? 0)}
                </Td>
              )}
              {hasDebt && (
                <Td $right $nowrap>
                  {formatMoney(r.debt ?? 0)}
                </Td>
              )}
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
