import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarRange, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { addMonths, parseISO } from 'date-fns';
import { reportsApi } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { localMonth } from '../../lib/format';
import { Button, DataState, Input, Page, PageHeader } from '../../components/ui';
import { ReportView } from './ReportView';

export function MonthlyReport() {
  const { t } = useTranslation();
  const [month, setMonth] = useState(localMonth());
  const { data, loading, error, reload } = useAsync(() => reportsApi.monthly(month), [month]);
  const shift = (n: number) => setMonth(localMonth(addMonths(parseISO(`${month}-01`), n)));
  const current = localMonth();

  return (
    <Page>
      <PageHeader
        icon={<CalendarRange />}
        title={t('reports.monthlyTitle')}
        actions={
          <>
            <Button onClick={() => shift(-1)} aria-label={t('common.prev')}>
              <ChevronLeft />
            </Button>
            <Input type="month" value={month} max={current} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 'auto' }} />
            <Button onClick={() => shift(1)} disabled={month >= current} aria-label={t('common.next')}>
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
