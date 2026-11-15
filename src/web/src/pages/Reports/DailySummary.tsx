import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart3, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { addDays, parseISO } from 'date-fns';
import { reportsApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { localDay } from '../../lib/format';
import { Button, DataState, Input, Page, PageHeader } from '../../components/ui';
import { ReportView } from './ReportView';

export function DailySummary() {
  const { t } = useTranslation();
  const [date, setDate] = useState(localDay());
  const { data, loading, error, reload } = useAsync(() => reportsApi.daily(date), [date]);
  const shift = (n: number) => setDate(localDay(addDays(parseISO(date), n)));
  const today = localDay();

  return (
    <Page>
      <PageHeader
        icon={<BarChart3 />}
        title={t('reports.dailyTitle')}
        actions={
          <>
            <Button onClick={() => shift(-1)} aria-label={t('common.prev')}>
              <ChevronLeft />
            </Button>
            <Input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ width: 'auto' }} />
            <Button onClick={() => shift(1)} disabled={date >= today} aria-label={t('common.next')}>
              <ChevronRight />
            </Button>
            <Button onClick={reload} aria-label={t('common.refresh')}>
              <RefreshCw />
            </Button>
          </>
        }
      />
      <DataState loading={loading && !data} error={error} onRetry={reload}>
        {data && <ReportView report={data} />}
      </DataState>
    </Page>
  );
}
