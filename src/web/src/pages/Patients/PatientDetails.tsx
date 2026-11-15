import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, User } from 'lucide-react';
import { patientsApi, type Appointment } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { formatDate, formatMoney, formatNumber, showPhone } from '../../lib/format';
import {
  ActiveBadge,
  Button,
  Card,
  CardTitle,
  DataState,
  Grid,
  InfoList,
  Page,
  PageHeader,
  StatCard,
} from '../../components/ui';
import { VisitsTable } from '../Appointments/VisitsTable';
import { AppointmentDetailsModal } from '../Appointments/AppointmentDetailsModal';

export function PatientDetails() {
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState<Appointment | null>(null);
  const { data: p, loading, error, reload } = useAsync(() => patientsApi.get(id), [id]);

  const visits = useMemo(
    () => [...(p?.visits ?? [])].sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate)),
    [p],
  );
  const totals = useMemo(() => {
    const billed = visits.filter((v) => v.status !== 'CANCELLED');
    const total = billed.reduce((s, v) => s + v.totalAmount, 0);
    const paid = billed.reduce((s, v) => s + v.paidAmount, 0);
    return { total, paid, debt: Math.max(0, total - paid) };
  }, [visits]);

  return (
    <Page>
      <PageHeader
        icon={<User />}
        title={p?.fullName ?? t('patients.patient')}
        subtitle={p ? `${p.patientCode} · ${showPhone(p.phone)}` : undefined}
        actions={
          <Button onClick={() => navigate('/patients')}>
            <ArrowLeft />
            {t('common.back')}
          </Button>
        }
      />

      <DataState loading={loading && !p} error={error} onRetry={reload}>
        {p && (
          <>
            <Card>
              <CardTitle>{t('patients.info')}</CardTitle>
              <InfoList
                items={[
                  { label: t('patients.patientCode'), value: p.patientCode },
                  { label: t('patients.phone'), value: showPhone(p.phone) },
                  { label: t('patients.birthDate'), value: formatDate(p.birthDate) },
                  { label: t('patients.gender'), value: p.gender ? t(`patients.genders.${p.gender}`, p.gender) : '—' },
                  { label: t('patients.bloodType'), value: p.bloodType || '—' },
                  { label: t('patients.allergies'), value: p.allergies || '—' },
                  { label: t('patients.city'), value: p.city || '—' },
                  { label: t('patients.address'), value: p.address || '—' },
                  { label: t('patients.registered'), value: formatDate(p.createdAt) },
                  { label: t('common.status'), value: <ActiveBadge active={p.active} /> },
                  { label: t('common.notes'), value: p.notes || '—' },
                ]}
              />
            </Card>

            <Grid $min={180}>
              <StatCard label={t('patients.totalVisits')} value={formatNumber(visits.length)} />
              <StatCard label={t('reports.revenue')} value={formatMoney(totals.total)} tone="success" />
              <StatCard label={t('reports.paid')} value={formatMoney(totals.paid)} tone="info" />
              <StatCard label={t('reports.debt')} value={formatMoney(totals.debt)} tone="warning" />
            </Grid>

            <Card style={{ padding: 0 }}>
              <div style={{ padding: 16, paddingBottom: 0 }}>
                <CardTitle>{t('patients.visitHistory')}</CardTitle>
              </div>
              <DataState loading={false} error={null} empty={!visits.length} emptyText={t('appointments.noAppointments')}>
                <div style={{ overflowX: 'auto' }}>
                  <VisitsTable rows={visits} onOpen={setOpen} showPatient={false} />
                </div>
              </DataState>
            </Card>
          </>
        )}
      </DataState>

      {open && (
        <AppointmentDetailsModal
          id={open.id}
          initial={{ ...open, patient: open.patient ?? (p ? { id: p.id, fullName: p.fullName } : null) }}
          onClose={() => setOpen(null)}
          showPatientLink={false}
        />
      )}
    </Page>
  );
}
