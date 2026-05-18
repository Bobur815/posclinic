import { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { RefreshCw, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { appointments as appointmentsApi, type AppointmentRecord } from '../../api/client';

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Title = styled.h1`
  font-size: 1.4rem;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin: 0;
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Actions = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const DateInput = styled.input`
  padding: ${({ theme }) => `${theme.spacing.xs} ${theme.spacing.sm}`};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 0.85rem;
`;

const IconBtn = styled.button`
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  display: flex;
  align-items: center;

  &:hover { color: ${({ theme }) => theme.colors.primary}; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  background: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow: hidden;
`;

const Th = styled.th`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  text-align: left;
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: ${({ theme }) => `${theme.spacing.sm} ${theme.spacing.md}`};
  font-size: 0.875rem;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 500;
  background: ${({ $status, theme }) => {
    switch ($status) {
      case 'COMPLETED': return theme.colors.success + '20';
      case 'SCHEDULED': return theme.colors.info + '20';
      case 'CANCELLED': return theme.colors.error + '20';
      default: return theme.colors.warning + '20';
    }
  }};
  color: ${({ $status, theme }) => {
    switch ($status) {
      case 'COMPLETED': return theme.colors.success;
      case 'SCHEDULED': return theme.colors.info;
      case 'CANCELLED': return theme.colors.error;
      default: return theme.colors.warning;
    }
  }};
`;

const STATUS_LABELS: Record<string, string> = {
  SCHEDULED: 'Запланирован',
  COMPLETED: 'Завершён',
  CANCELLED: 'Отменён',
  NO_SHOW: 'Не явился',
};

const Empty = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function AppointmentList() {
  const [data, setData] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await appointmentsApi.getAll({ date });
      setData(result);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  return (
    <Page>
      <Header>
        <Title><Calendar size={22} /> Приёмы</Title>
        <Actions>
          <DateInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <IconBtn onClick={load} title="Обновить"><RefreshCw size={16} /></IconBtn>
        </Actions>
      </Header>

      {loading ? (
        <Empty>Загрузка...</Empty>
      ) : data.length === 0 ? (
        <Empty>Нет приёмов за выбранный день</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>№</Th>
              <Th>Пациент</Th>
              <Th>Врач</Th>
              <Th>Время</Th>
              <Th>Статус</Th>
              <Th>Сумма</Th>
              <Th>Оплата</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((a) => (
              <tr key={a.id}>
                <Td>{a.appointmentNumber}</Td>
                <Td>{a.patient?.fullName ?? '—'}</Td>
                <Td>{a.doctor?.fullName ?? '—'}</Td>
                <Td>{format(new Date(a.appointmentDate), 'HH:mm')}</Td>
                <Td><StatusBadge $status={a.status}>{STATUS_LABELS[a.status] ?? a.status}</StatusBadge></Td>
                <Td>{a.totalAmount.toLocaleString()} сум</Td>
                <Td>{a.paidAmount.toLocaleString()} сум</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Page>
  );
}
