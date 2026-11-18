import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Receipt, RefreshCw } from 'lucide-react';
import { startOfMonth } from 'date-fns';
import { stockApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney, localDay } from '../../lib/format';
import {
  Badge,
  Button,
  Card,
  DataState,
  FilterBar,
  Input,
  Page,
  PageHeader,
  Pagination,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '../../components/ui';

const PAGE_SIZE = 50;

/** Expenses as the main till last synced them (read-only; they are added on the till). */
export function ExpensesPage() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(localDay(startOfMonth(new Date())));
  const [to, setTo] = useState(localDay());
  const [page, setPage] = useState(1);
  const { data, loading, error, reload } = useAsync(
    () => stockApi.expenses({ from, to, page, pageSize: PAGE_SIZE }),
    [from, to, page],
  );
  const items = data?.items ?? [];
  const total = items.filter((e) => !e.voidedAt).reduce((s, e) => s + e.amount, 0);

  return (
    <Page>
      <PageHeader
        icon={<Receipt />}
        title={t('expenses.title')}
        subtitle={t('stock.readOnly')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />
      <FilterBar>
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
          style={{ width: 'auto' }}
        />
        <Input
          type="date"
          value={to}
          min={from}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
          style={{ width: 'auto' }}
        />
        <span>
          {t('expenses.pageTotal')}: <strong>{formatMoney(total)}</strong>
        </span>
      </FilterBar>
      <Card>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={items.length === 0}
          emptyText={t('expenses.empty')}
        >
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>{t('common.date')}</Th>
                  <Th>{t('expenses.category')}</Th>
                  <Th>{t('common.notes')}</Th>
                  <Th>{t('expenses.paidFrom')}</Th>
                  <Th $right>{t('expenses.amount')}</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <Tr key={e.id} $dim={!!e.voidedAt}>
                    <Td $nowrap $title>
                      {formatDate(e.spentAt)}{' '}
                      {e.voidedAt && <Badge $tone="error">{t('expenses.voided')}</Badge>}
                    </Td>
                    <Td data-label={t('expenses.category')}>
                      {t(`expenses.categories.${e.category}`, { defaultValue: e.category })}
                    </Td>
                    <Td $muted data-label={t('common.notes')}>
                      {e.note || '—'}
                    </Td>
                    <Td data-label={t('expenses.paidFrom')}>
                      {t(`expenses.from.${e.paidFrom}`, { defaultValue: e.paidFrom })}
                    </Td>
                    <Td $right $nowrap data-label={t('expenses.amount')}>
                      {formatMoney(e.amount)}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
          {data && (
            <Pagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onPageChange={setPage}
            />
          )}
        </DataState>
      </Card>
    </Page>
  );
}
