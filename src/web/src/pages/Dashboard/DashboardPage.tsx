import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  CalendarCheck,
  CheckCircle2,
  XCircle,
  Wallet,
  AlertCircle,
  UserPlus,
  RefreshCw,
} from 'lucide-react';
import { dashboardApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatMoney, formatNumber, localDay } from '../../lib/format';
import {
  Button,
  Card,
  CardTitle,
  DataState,
  Field,
  Grid,
  Input,
  Page,
  PageHeader,
  StatCard,
} from '../../components/ui';
import { RankBarChart } from '../../components/charts';
import { RankTable } from '../../components/RankTable';

export function DashboardPage() {
  const { t } = useTranslation();
  const [date, setDate] = useState(localDay());
  const { data, loading, error, reload } = useAsync(() => dashboardApi.summary(date), [date]);

  return (
    <Page>
      <PageHeader
        icon={<LayoutDashboard />}
        title={t('dashboard.title')}
        subtitle={date === localDay() ? t('dashboard.today') : undefined}
        actions={
          <>
            <Field label={t('common.date')}>
              <Input
                type="date"
                value={date}
                max={localDay()}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </Field>
            <Button
              onClick={reload}
              aria-label={t('common.refresh')}
              style={{ alignSelf: 'flex-end' }}
            >
              <RefreshCw />
            </Button>
          </>
        }
      />

      <DataState loading={loading && !data} error={error} onRetry={reload}>
        {data && (
          <>
            <Grid $min={180}>
              <StatCard
                label={t('dashboard.visits')}
                value={formatNumber(data.visits)}
                icon={<CalendarCheck />}
              />
              <StatCard
                label={t('dashboard.completed')}
                value={formatNumber(data.completed)}
                icon={<CheckCircle2 />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.cancelled')}
                value={formatNumber(data.cancelled)}
                icon={<XCircle />}
                tone="error"
              />
              <StatCard
                label={t('dashboard.revenue')}
                value={formatMoney(data.revenue)}
                icon={<Wallet />}
                tone="success"
              />
              <StatCard
                label={t('dashboard.debt')}
                value={formatMoney(data.debt)}
                icon={<AlertCircle />}
                tone="warning"
              />
              <StatCard
                label={t('dashboard.newPatients')}
                value={formatNumber(data.newPatients)}
                icon={<UserPlus />}
                tone="info"
              />
            </Grid>

            <Grid $min={360}>
              <Card>
                <CardTitle>{t('dashboard.topServices')}</CardTitle>
                <DataState
                  loading={false}
                  error={null}
                  empty={!data.topServices.length}
                  emptyText={t('dashboard.noData')}
                >
                  <RankBarChart rows={data.topServices} />
                  <RankTable rows={data.topServices} nameLabel={t('reports.service')} />
                </DataState>
              </Card>
              <Card>
                <CardTitle>{t('dashboard.topDoctors')}</CardTitle>
                <DataState
                  loading={false}
                  error={null}
                  empty={!data.topDoctors.length}
                  emptyText={t('dashboard.noData')}
                >
                  <RankBarChart rows={data.topDoctors} />
                  <RankTable rows={data.topDoctors} nameLabel={t('reports.doctor')} />
                </DataState>
              </Card>
            </Grid>
          </>
        )}
      </DataState>
    </Page>
  );
}
