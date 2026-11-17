import { Paged } from '../../components/ui';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Report } from '../../api/client';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { Card, CardTitle, DataState, Grid, StatCard, Table, Td, Th, Tr } from '../../components/ui';
import { DailyTrendChart } from '../../components/charts';
import { RankTable } from '../../components/RankTable';

/** Totals, by doctor, by service and (monthly) by day. */
export function ReportView({ report }: { report: Report }) {
  const { t } = useTranslation();
  const { totals, byDoctor, byService, byDay } = report;
  const days = [...(byDay ?? [])].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
      <Grid $min={200}>
        <StatCard
          label={t('reports.visits')}
          value={formatNumber(totals.visits)}
          icon={<CalendarCheck />}
        />
        <StatCard
          label={t('reports.revenue')}
          value={formatMoney(totals.revenue)}
          icon={<Wallet />}
          tone="success"
        />
        <StatCard
          label={t('reports.paid')}
          value={formatMoney(totals.paid)}
          icon={<CheckCircle2 />}
          tone="info"
        />
        <StatCard
          label={t('reports.debt')}
          value={formatMoney(totals.debt)}
          icon={<AlertCircle />}
          tone="warning"
        />
      </Grid>

      {days.length > 0 && (
        <Card>
          <CardTitle>{t('reports.byDay')}</CardTitle>
          <DailyTrendChart
            rows={days.map((d) => ({
              label: d.date.slice(8, 10),
              revenue: d.revenue,
              visits: d.visits,
            }))}
          />
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <Paged rows={days}>
              {(pageRows) => (
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('common.date')}</Th>
                      <Th $right>{t('reports.visits')}</Th>
                      <Th $right>{t('reports.revenue')}</Th>
                      {days.some((d) => d.paid !== undefined) && (
                        <Th $right>{t('reports.paid')}</Th>
                      )}
                      {days.some((d) => d.debt !== undefined) && (
                        <Th $right>{t('reports.debt')}</Th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((d) => (
                      <Tr key={d.date}>
                        <Td $nowrap $title>
                          {formatDate(d.date)}
                        </Td>
                        <Td $right data-label={t('reports.visits')}>
                          {formatNumber(d.visits)}
                        </Td>
                        <Td $right $nowrap data-label={t('reports.revenue')}>
                          {formatMoney(d.revenue)}
                        </Td>
                        {d.paid !== undefined && (
                          <Td $right $nowrap data-label={t('reports.paid')}>
                            {formatMoney(d.paid)}
                          </Td>
                        )}
                        {d.debt !== undefined && (
                          <Td $right $nowrap data-label={t('reports.debt')}>
                            {formatMoney(d.debt)}
                          </Td>
                        )}
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Paged>
          </div>
        </Card>
      )}

      <Grid $min={360}>
        <Card>
          <CardTitle>{t('reports.byDoctor')}</CardTitle>
          <DataState
            loading={false}
            error={null}
            empty={!byDoctor.length}
            emptyText={t('dashboard.noData')}
          >
            <RankTable rows={byDoctor} nameLabel={t('reports.doctor')} />
          </DataState>
        </Card>
        <Card>
          <CardTitle>{t('reports.byService')}</CardTitle>
          <DataState
            loading={false}
            error={null}
            empty={!byService.length}
            emptyText={t('dashboard.noData')}
          >
            <RankTable rows={byService} nameLabel={t('reports.service')} />
          </DataState>
        </Card>
      </Grid>
    </>
  );
}
