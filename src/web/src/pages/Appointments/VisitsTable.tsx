import { useTranslation } from 'react-i18next';
import type { Appointment } from '../../api/client';
import { doctorName, useDoctors } from '../../hooks/useDoctors';
import { formatDateTime, formatMoney } from '../../lib/format';
import { Paged, PaymentBadge, StatusBadge, Table, Td, Th, Tr } from '../../components/ui';

/**
 * Visits as a table. `paged`: pages its own rows (a patient's history); off where the list is
 * already paged by the server (Appointments), or there would be two pagination bars.
 */
export function VisitsTable({
  rows,
  onOpen,
  showPatient = true,
  paged = false,
}: {
  rows: Appointment[];
  onOpen: (a: Appointment) => void;
  showPatient?: boolean;
  paged?: boolean;
}) {
  const { t } = useTranslation();
  const doctors = useDoctors();
  const table = (list: Appointment[]) => (
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
        {list.map((a) => (
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
  return paged ? <Paged rows={rows}>{table}</Paged> : table(rows);
}
