import React, { useEffect, useState } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Calendar, Users, DollarSign, Clock, Plus, UserPlus } from 'lucide-react';
import { format } from 'date-fns';

interface TodaySummary {
  total: number;
  completed: number;
  revenue: number;
  pending: number;
  recentAppointments: Array<{
    id: string;
    appointmentNumber: string;
    appointmentDate: string;
    status: string;
    paymentStatus: string;
    patient: { fullName: string };
    doctor: { fullName: string } | null;
    totalAmount: number;
  }>;
}

const Page = styled.div`
  max-width: 1200px;
`;

const PageTitle = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: ${({ theme }) => theme.spacing.md};
  margin-bottom: ${({ theme }) => theme.spacing.xl};
`;

const StatCard = styled.div<{ $color: string }>`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-left: 4px solid ${({ $color }) => $color};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
`;

const StatIcon = styled.div<{ $color: string }>`
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: ${({ $color }) => $color}20;
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ $color }) => $color};
  flex-shrink: 0;
`;

const StatInfo = styled.div``;

const StatValue = styled.div`
  font-size: 24px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-top: 2px;
`;

const Section = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SectionHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.h2`
  font-size: 16px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const QuickActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const ActionBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: opacity 0.15s;
  &:hover { opacity: 0.9; }
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 10px 12px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const StatusBadge = styled.span<{ $status: string }>`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
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

const EmptyState = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 14px;
`;

export function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const dataVersion = useDataVersion(['appointments', 'patients']);
  useEffect(() => {
    loadSummary();
  }, [dataVersion]);

  const loadSummary = async () => {
    try {
      const data = await window.electronAPI.appointments.getTodaySummary();
      setSummary(data as TodaySummary);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    `${amount.toLocaleString()} ${t('common.currency')}`;

  return (
    <Page>
      <PageTitle>{t('dashboard.title')}</PageTitle>

      <StatsGrid>
        <StatCard $color="#0891b2">
          <StatIcon $color="#0891b2"><Calendar size={22} /></StatIcon>
          <StatInfo>
            <StatValue>{summary?.total ?? 0}</StatValue>
            <StatLabel>{t('dashboard.todayAppointments')}</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $color="#22c55e">
          <StatIcon $color="#22c55e"><DollarSign size={22} /></StatIcon>
          <StatInfo>
            <StatValue>{formatCurrency(summary?.revenue ?? 0)}</StatValue>
            <StatLabel>{t('dashboard.todayRevenue')}</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $color="#8b5cf6">
          <StatIcon $color="#8b5cf6"><Users size={22} /></StatIcon>
          <StatInfo>
            <StatValue>{summary?.completed ?? 0}</StatValue>
            <StatLabel>{t('appointments.todaySummary.completed')}</StatLabel>
          </StatInfo>
        </StatCard>
        <StatCard $color="#f59e0b">
          <StatIcon $color="#f59e0b"><Clock size={22} /></StatIcon>
          <StatInfo>
            <StatValue>{summary?.pending ?? 0}</StatValue>
            <StatLabel>{t('dashboard.pendingPayments')}</StatLabel>
          </StatInfo>
        </StatCard>
      </StatsGrid>

      <QuickActions>
        <ActionBtn onClick={() => navigate('/appointments/new')}>
          <Plus size={16} />
          {t('dashboard.newAppointment')}
        </ActionBtn>
        <ActionBtn
          onClick={() => navigate('/patients/new')}
          style={{ background: 'transparent', color: 'inherit', border: '1px solid currentColor' }}
        >
          <UserPlus size={16} />
          {t('dashboard.newPatient')}
        </ActionBtn>
      </QuickActions>

      <Section>
        <SectionHeader>
          <SectionTitle>{t('dashboard.recentAppointments')}</SectionTitle>
        </SectionHeader>

        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : (summary?.recentAppointments?.length ?? 0) === 0 ? (
          <EmptyState>{t('appointments.noAppointments')}</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t('appointments.appointmentNumber')}</Th>
                <Th>{t('appointments.patient')}</Th>
                <Th>{t('appointments.doctor')}</Th>
                <Th>{t('common.date')}</Th>
                <Th>{t('appointments.status')}</Th>
                <Th>{t('appointments.totalAmount')}</Th>
              </tr>
            </thead>
            <tbody>
              {summary?.recentAppointments?.map((appt) => (
                <tr
                  key={appt.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/appointments/${appt.id}`)}
                >
                  <Td>{appt.appointmentNumber}</Td>
                  <Td>{appt.patient.fullName}</Td>
                  <Td>{appt.doctor?.fullName ?? '—'}</Td>
                  <Td>{format(new Date(appt.appointmentDate), 'dd.MM.yyyy HH:mm')}</Td>
                  <Td>
                    <StatusBadge $status={appt.status}>
                      {t(`appointments.statuses.${appt.status}`, appt.status)}
                    </StatusBadge>
                  </Td>
                  <Td>{formatCurrency(Number(appt.totalAmount))}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </Page>
  );
}
