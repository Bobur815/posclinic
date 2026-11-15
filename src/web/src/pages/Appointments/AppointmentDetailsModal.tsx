import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { appointmentsApi, type Appointment } from '../../api/client';
import { useAsync } from '../../hooks/useAsync';
import { doctorName, useDoctors } from '../../hooks/useDoctors';
import { formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import {
  CardTitle,
  DataState,
  InfoList,
  Modal,
  PaymentBadge,
  StatusBadge,
  Table,
  Td,
  Th,
  Tr,
} from '../../components/ui';

/** Read-only visit card. Loads the full row by id (the list row may be a summary). */
export function AppointmentDetailsModal({
  id,
  initial,
  onClose,
  showPatientLink = true,
}: {
  id: string;
  initial?: Appointment;
  onClose: () => void;
  showPatientLink?: boolean;
}) {
  const { t } = useTranslation();
  const doctors = useDoctors();
  const { data, loading, error, reload } = useAsync(() => appointmentsApi.get(id), [id]);
  const a = data ? { ...data, patient: data.patient ?? initial?.patient } : initial;

  return (
    <Modal
      drawer
      title={
        a
          ? `${t('appointments.appointment')} № ${a.appointmentNumber}`
          : t('appointments.appointment')
      }
      onClose={onClose}
    >
      <DataState loading={loading && !a} error={a ? null : error} onRetry={reload}>
        {a && (
          <>
            <InfoList
              items={[
                {
                  label: t('appointments.appointmentDate'),
                  value: formatDateTime(a.appointmentDate),
                },
                { label: t('appointments.status'), value: <StatusBadge status={a.status} /> },
                {
                  label: t('appointments.patient'),
                  value: showPatientLink ? (
                    <Link to={`/patients/${a.patientId}`} onClick={onClose}>
                      {a.patient?.fullName ?? t('appointments.openPatient')}
                    </Link>
                  ) : (
                    (a.patient?.fullName ?? '—')
                  ),
                },
                { label: t('appointments.doctor'), value: doctorName(doctors, a) },
                { label: t('appointments.totalAmount'), value: formatMoney(a.totalAmount) },
                { label: t('appointments.paidAmount'), value: formatMoney(a.paidAmount) },
                {
                  label: t('appointments.debt'),
                  value: formatMoney(Math.max(0, a.totalAmount - a.paidAmount)),
                },
                {
                  label: t('appointments.paymentStatus'),
                  value: <PaymentBadge status={a.paymentStatus} />,
                },
                {
                  label: t('appointments.paymentMethod'),
                  value: a.paymentMethod
                    ? t(`appointments.paymentMethods.${a.paymentMethod}`, a.paymentMethod)
                    : '—',
                },
                { label: t('appointments.terminal'), value: a.terminalId ?? '—' },
              ]}
            />

            <div>
              <CardTitle>{t('appointments.services')}</CardTitle>
              <div style={{ overflowX: 'auto' }}>
                <Table>
                  <thead>
                    <tr>
                      <Th>{t('appointments.service')}</Th>
                      <Th $right>{t('appointments.quantity')}</Th>
                      <Th $right>{t('appointments.unitPrice')}</Th>
                      <Th $right>{t('common.total')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(a.items ?? []).map((i) => (
                      <Tr key={i.id}>
                        <Td>{i.serviceName}</Td>
                        <Td $right>{formatNumber(i.quantity)}</Td>
                        <Td $right $nowrap>
                          {formatMoney(i.unitPrice)}
                        </Td>
                        <Td $right $nowrap>
                          {formatMoney(i.total)}
                        </Td>
                      </Tr>
                    ))}
                    {!a.items?.length && (
                      <Tr>
                        <Td colSpan={4} $muted>
                          {t('appointments.noItems')}
                        </Td>
                      </Tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </div>

            <InfoList
              items={[
                { label: t('appointments.diagnosis'), value: a.diagnosis || '—' },
                { label: t('appointments.prescription'), value: a.prescription || '—' },
                { label: t('common.notes'), value: a.notes || '—' },
              ]}
            />
          </>
        )}
      </DataState>
    </Modal>
  );
}
