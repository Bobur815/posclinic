import React, { useEffect, useState } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { format } from 'date-fns';
import { BarChart2, TrendingUp, Users, CheckCircle } from 'lucide-react';

interface AppointmentRow {
  id: string;
  appointmentNumber: string;
  appointmentDate: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  paidAmount: number;
  patient: { fullName: string };
  doctor: { fullName: string } | null;
}

interface DailySummary {
  total: number;
  completed: number;
  cancelled: number;
  revenue: number;
  paidAmount: number;
}

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const DateInput = styled.input`
  padding: 8px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StatCard = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  display: flex;
  align-items: flex-start;
  gap: 12px;
`;

const IconBox = styled.div<{ $color: string }>`
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`;

const StatInfo = styled.div``;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: 2px;
`;

const StatValue = styled.div`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const CardHeader = styled.div`
  padding: 14px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 14px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  background: ${({ theme }) => theme.colors.background};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 10px 14px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Tr = styled.tr`
  &:last-child td { border-bottom: none; }
  &:hover td { background: ${({ theme }) => theme.colors.background}; }
`;

const Badge = styled.span<{ $color: string }>`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function DailyReport() {
  const { t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [appointments, setAppointments] = useState<AppointmentRow[]>([]);
  const [summary, setSummary] = useState<DailySummary>({
    total: 0, completed: 0, cancelled: 0, revenue: 0, paidAmount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  const dataVersion = useDataVersion(['appointments', 'patients', 'doctors']);
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await window.electronAPI.appointments.getAll({ date: selectedDate });
        const rows = data as AppointmentRow[];
        setAppointments(rows);

        const completed = rows.filter((r) => r.status === 'COMPLETED').length;
        const cancelled = rows.filter((r) => r.status === 'CANCELLED').length;
        // A cancelled visit is not revenue.
        const revenue = rows
          .filter((r) => r.status !== 'CANCELLED')
          .reduce((sum, r) => sum + Number(r.totalAmount), 0);
        const paidAmount = rows.reduce((sum, r) => sum + Number(r.paidAmount), 0);
        setSummary({ total: rows.length, completed, cancelled, revenue, paidAmount });
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [selectedDate, dataVersion]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'SCHEDULED': return '#0891b2';
      case 'CANCELLED': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  const getPaymentColor = (status: string) => {
    switch (status) {
      case 'PAID': return '#22c55e';
      case 'PARTIAL': return '#f59e0b';
      default: return '#ef4444';
    }
  };

  return (
    <Page>
      <Header>
        <Title>{t('reports.dailyReport')}</Title>
        <DateInput
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </Header>

      <StatsGrid>
        <StatCard>
          <IconBox $color="#0891b2"><Users size={20} /></IconBox>
          <StatInfo>
            <StatLabel>{t('dashboard.todayAppointments')}</StatLabel>
            <StatValue>{summary.total}</StatValue>
          </StatInfo>
        </StatCard>
        <StatCard>
          <IconBox $color="#22c55e"><CheckCircle size={20} /></IconBox>
          <StatInfo>
            <StatLabel>{t('appointments.todaySummary.completed')}</StatLabel>
            <StatValue>{summary.completed}</StatValue>
          </StatInfo>
        </StatCard>
        <StatCard>
          <IconBox $color="#0891b2"><TrendingUp size={20} /></IconBox>
          <StatInfo>
            <StatLabel>{t('reports.totalRevenue')}</StatLabel>
            <StatValue style={{ fontSize: '16px' }}>
              {summary.revenue.toLocaleString()} {t('common.currency')}
            </StatValue>
          </StatInfo>
        </StatCard>
        <StatCard>
          <IconBox $color="#22c55e"><BarChart2 size={20} /></IconBox>
          <StatInfo>
            <StatLabel>{t('reports.collected')}</StatLabel>
            <StatValue style={{ fontSize: '16px' }}>
              {summary.paidAmount.toLocaleString()} {t('common.currency')}
            </StatValue>
          </StatInfo>
        </StatCard>
      </StatsGrid>

      <Card>
        <CardHeader>
          {t('appointments.title')} — {format(new Date(selectedDate + 'T00:00:00'), 'dd.MM.yyyy')}
        </CardHeader>
        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : appointments.length === 0 ? (
          <EmptyState>{t('appointments.noAppointments')}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('appointments.appointmentNumber')}</Th>
                <Th>{t('appointments.patient')}</Th>
                <Th>{t('appointments.doctor')}</Th>
                <Th>{t('appointments.appointmentDate')}</Th>
                <Th>{t('appointments.status')}</Th>
                <Th>{t('appointments.paymentStatus')}</Th>
                <Th>{t('appointments.totalAmount')}</Th>
                <Th>{t('appointments.paidAmount')}</Th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => (
                <Tr key={appt.id}>
                  <Td style={{ color: '#0891b2', fontWeight: 500 }}>{appt.appointmentNumber}</Td>
                  <Td>{appt.patient.fullName}</Td>
                  <Td>{appt.doctor?.fullName ?? '—'}</Td>
                  <Td>{format(new Date(appt.appointmentDate), 'HH:mm')}</Td>
                  <Td>
                    <Badge $color={getStatusColor(appt.status)}>
                      {t(`appointments.statuses.${appt.status}`, appt.status)}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge $color={getPaymentColor(appt.paymentStatus)}>
                      {t(`appointments.paymentStatuses.${appt.paymentStatus}`, appt.paymentStatus)}
                    </Badge>
                  </Td>
                  <Td>{Number(appt.totalAmount).toLocaleString()} {t('common.currency')}</Td>
                  <Td>{Number(appt.paidAmount).toLocaleString()} {t('common.currency')}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </Page>
  );
}
