import { useTranslation } from 'react-i18next';
import type { Appointment } from '../../api/client';
import { doctorName, useDoctors } from '../../hooks/useDoctors';
import { formatDateTime, formatMoney } from '../../lib/format';
import { PaymentBadge, StatusBadge, Table, Td, Th, Tr } from '../../components/ui';

export function VisitsTable({
  rows,
  onOpen,
  showPatient = true,
}: {
  rows: Appointment[];
  onOpen: (a: Appointment) => void;
  showPatient?: boolean;
}) {
  const { t } = useTranslation();
  const doctors = useDoctors();
  return (
    <Table>
      <thead>
        <tr>
          <Th>№</Th>
          <Th>{t('appointments.appointmentDate')}</Th>
          {showPatient && <Th>{t('appointments.patient')}</Th>}
          <Th>{t('appointments.doctor')}</Th>
          <Th>{t('appointments.status')}</Th>
          <Th $right>{t('appointments.totalAmount')}</Th>
          <Th $right>{t('appointments.paidAmount')}</Th>
          <Th>{t('appointments.paymentStatus')}</Th>
        </tr>
      </thead>
      <tbody>
        {rows.map((a) => (
          <Tr key={a.id} $clickable onClick={() => onOpen(a)}>
            <Td $muted $nowrap>
              {a.appointmentNumber}
            </Td>
            <Td $nowrap>{formatDateTime(a.appointmentDate)}</Td>
            {showPatient && <Td>{a.patient?.fullName ?? '—'}</Td>}
            <Td>{doctorName(doctors, a)}</Td>
            <Td>
              <StatusBadge status={a.status} />
            </Td>
            <Td $right $nowrap>
              {formatMoney(a.totalAmount)}
            </Td>
            <Td $right $nowrap>
              {formatMoney(a.paidAmount)}
            </Td>
            <Td>
              <PaymentBadge status={a.paymentStatus} />
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
