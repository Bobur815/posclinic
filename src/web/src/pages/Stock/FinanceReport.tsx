import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Landmark, RefreshCw, TrendingDown, TrendingUp, Wallet, Package } from 'lucide-react';
import { endOfMonth, startOfMonth, subDays, subMonths } from 'date-fns';
import type { FinanceReportDto } from '@shared/stock';
import { stockApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatMoney, localDay } from '../../lib/format';
import {
  Button,
  Card,
  CardTitle,
  DataState,
  FilterBar,
  Grid,
  Input,
  Page,
  PageHeader,
  StatCard,
  Table,
  Td,
  Th,
  Tr,
} from '../../components/ui';

/**
 * The money report (till v2.10): the same figures as the till's Moliya hisoboti, worked out by
 * the same code (src/shared/stock.ts) from what the main till synced.
 */
export function FinanceReport() {
  const { t } = useTranslation();
  const today = localDay();
  const [from, setFrom] = useState(localDay(startOfMonth(new Date())));
  const [to, setTo] = useState(today);
  const { data, loading, error, reload } = useAsync(() => stockApi.finance(from, to), [from, to]);

  const preset = (kind: 'today' | 'week' | 'month' | 'lastMonth') => {
    const now = new Date();
    if (kind === 'today') {
      setFrom(today);
      setTo(today);
    } else if (kind === 'week') {
      setFrom(localDay(subDays(now, 6)));
      setTo(today);
    } else if (kind === 'month') {
      setFrom(localDay(startOfMonth(now)));
      setTo(today);
    } else {
      const last = subMonths(now, 1);
      setFrom(localDay(startOfMonth(last)));
      setTo(localDay(endOfMonth(last)));
    }
  };

  return (
    <Page>
      <PageHeader
        icon={<Landmark />}
        title={t('finance.title')}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />
      <FilterBar>
        {(['today', 'week', 'month', 'lastMonth'] as const).map((k) => (
          <Button key={k} $small onClick={() => preset(k)}>
            {t(`finance.${k}`)}
          </Button>
        ))}
        <Input
          type="date"
          value={from}
          max={to}
          onChange={(e) => e.target.value && setFrom(e.target.value)}
          style={{ width: 'auto' }}
        />
        <Input
          type="date"
          value={to}
          min={from}
          max={today}
          onChange={(e) => e.target.value && setTo(e.target.value)}
          style={{ width: 'auto' }}
        />
      </FilterBar>
      <DataState loading={loading && !data} error={error} onRetry={reload}>
        {data && <FinanceView r={data} />}
      </DataState>
    </Page>
  );
}

function Lines({ rows }: { rows: Array<[string, number, boolean?]> }) {
  return (
    <Table>
      <tbody>
        {rows.map(([label, value, strong]) => (
          <Tr key={label}>
            <Td>{strong ? <strong>{label}</strong> : label}</Td>
            <Td $right $nowrap>
              {strong ? <strong>{formatMoney(value)}</strong> : formatMoney(value)}
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function FinanceView({ r }: { r: FinanceReportDto }) {
  const { t } = useTranslation();
  const sorted = (m: Record<string, number>) => Object.entries(m).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <Grid $min={200}>
        <StatCard
          label={t('finance.income')}
          value={formatMoney(r.income.total)}
          icon={<Wallet />}
          tone="info"
        />
        <StatCard
          label={t('finance.costs')}
          value={formatMoney(r.costOfSales + r.suppliesUsed.total + r.stockLoss + r.expenses.total)}
          icon={<TrendingDown />}
          tone="warning"
        />
        <StatCard
          label={t('finance.profit')}
          value={formatMoney(r.profit)}
          icon={<TrendingUp />}
          tone={r.profit >= 0 ? 'success' : 'error'}
        />
        <StatCard
          label={t('finance.netCash')}
          value={formatMoney(r.netCash)}
          tone={r.netCash >= 0 ? 'success' : 'error'}
        />
        <StatCard label={t('finance.debt')} value={formatMoney(r.income.debt)} tone="warning" />
        <StatCard
          label={t('finance.stockValue')}
          value={formatMoney(r.stock.value)}
          icon={<Package />}
        />
      </Grid>
      <p style={{ fontSize: 12, opacity: 0.75, margin: '8px 0 0' }}>{t('finance.profitHint')}</p>

      <Grid $min={360}>
        <Card>
          <CardTitle>{t('finance.incomeTitle')}</CardTitle>
          <Lines
            rows={[
              ...sorted(r.income.byMethod).map(
                ([k, v]) => [t(`finance.methods.${k}`, { defaultValue: k }), v] as [string, number],
              ),
              [t('finance.income'), r.income.total, true],
            ]}
          />
          <CardTitle style={{ marginTop: 16 }}>{t('finance.billedByKind')}</CardTitle>
          <Lines
            rows={[
              ...sorted(r.income.byKind).map(
                ([k, v]) => [t(`finance.kinds.${k}`, { defaultValue: k }), v] as [string, number],
              ),
              [t('finance.billed'), r.income.billed, true],
            ]}
          />
        </Card>
        <Card>
          <CardTitle>{t('finance.costsTitle')}</CardTitle>
          <Lines
            rows={[
              [t('finance.costOfSales'), r.costOfSales],
              [t('finance.treatment'), r.suppliesUsed.treatment],
              [t('finance.household'), r.suppliesUsed.household],
              [t('finance.stockLoss'), r.stockLoss],
              ...sorted(r.expenses.byCategory).map(
                ([k, v]) =>
                  [t(`expenses.categories.${k}`, { defaultValue: k }), v] as [string, number],
              ),
              [t('finance.profit'), r.profit, true],
            ]}
          />
        </Card>
        <Card>
          <CardTitle>{t('finance.cashOutTitle')}</CardTitle>
          <Table>
            <thead>
              <tr>
                <Th />
                <Th $right>{t('expenses.from.DRAWER')}</Th>
                <Th $right>{t('expenses.from.OUTSIDE')}</Th>
                <Th $right>{t('common.total')}</Th>
              </tr>
            </thead>
            <tbody>
              {(['purchases', 'expenses'] as const).map((k) => (
                <Tr key={k}>
                  <Td $title>{t(`finance.out.${k}`)}</Td>
                  <Td $right $nowrap data-label={t('expenses.from.DRAWER')}>
                    {formatMoney(r.cashOut[k].drawer)}
                  </Td>
                  <Td $right $nowrap data-label={t('expenses.from.OUTSIDE')}>
                    {formatMoney(r.cashOut[k].outside)}
                  </Td>
                  <Td $right $nowrap data-label={t('common.total')}>
                    {formatMoney(r.cashOut[k].total)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Card>
        <Card>
          <CardTitle>{t('finance.lowStock')}</CardTitle>
          <DataState
            loading={false}
            error={null}
            empty={!r.stock.low.length}
            emptyText={t('finance.noLowStock')}
          >
            <Table>
              <tbody>
                {r.stock.low.map((p) => (
                  <Tr key={p.id}>
                    <Td $title>{p.name}</Td>
                    <Td $right $nowrap>
                      {p.qtyOnHand} / {p.minQty} {p.unit}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </DataState>
        </Card>
      </Grid>
    </>
  );
}
