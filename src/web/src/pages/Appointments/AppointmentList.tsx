import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { appointmentsApi, type Appointment, type AppointmentStatus } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { useDoctors } from '../../hooks/useDoctors';
import { dayEndIso, dayStartIso, localDay } from '../../lib/format';
import {
  Button,
  DataState,
  Field,
  FilterBar,
  Input,
  Page,
  PageHeader,
  Pagination,
  Select,
  TableWrap,
} from '../../components/ui';
import { VisitsTable } from './VisitsTable';
import { AppointmentDetailsModal } from './AppointmentDetailsModal';

const STATUSES: AppointmentStatus[] = [
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export function AppointmentList() {
  const { t } = useTranslation();
  const doctors = useDoctors();
  const [from, setFrom] = useState(localDay());
  const [to, setTo] = useState(localDay());
  const [status, setStatus] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [open, setOpen] = useState<Appointment | null>(null);

  useEffect(() => setPage(1), [from, to, status, doctorId]);

  const { data, loading, error, reload } = useAsync(
    () =>
      appointmentsApi.list({
        from: from ? dayStartIso(from) : undefined,
        to: to ? dayEndIso(to) : undefined,
        status,
        doctorId,
        page,
        pageSize,
      }),
    [from, to, status, doctorId, page, pageSize],
  );

  const reset = () => {
    setFrom(localDay());
    setTo(localDay());
    setStatus('');
    setDoctorId('');
  };

  return (
    <Page>
      <PageHeader
        icon={<CalendarDays />}
        title={t('appointments.title')}
        subtitle={data ? t('common.totalCount', { count: data.total }) : undefined}
        actions={
          <Button onClick={reload} aria-label={t('common.refresh')}>
            <RefreshCw />
          </Button>
        }
      />

      <FilterBar>
        <Field label={t('common.from')}>
          <Input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </Field>
        <Field label={t('common.to')}>
          <Input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </Field>
        <Field label={t('appointments.status')}>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`appointments.statuses.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('appointments.doctor')}>
          <Select value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
            <option value="">{t('common.all')}</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.fullName}
              </option>
            ))}
          </Select>
        </Field>
        <Button $variant="ghost" onClick={reset}>
          {t('common.reset')}
        </Button>
      </FilterBar>

      <TableWrap>
        <DataState
          loading={loading && !data}
          error={error}
          onRetry={reload}
          empty={data?.items.length === 0}
          emptyText={t('appointments.noAppointments')}
        >
          {data && <VisitsTable rows={data.items} onOpen={setOpen} />}
          {data && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={data.total}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          )}
        </DataState>
      </TableWrap>

      {open && (
        <AppointmentDetailsModal id={open.id} initial={open} onClose={() => setOpen(null)} />
      )}
    </Page>
  );
}
