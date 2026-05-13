import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { Plus, Search, Eye, CreditCard } from 'lucide-react';
import { format } from 'date-fns';

interface Appointment {
  id: string;
  appointmentNumber: string;
  appointmentDate: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  patient: { fullName: string; phone: string };
  doctor: { fullName: string };
}

const Page = styled.div``;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const Controls = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  align-items: center;
`;

const SearchWrapper = styled.div`
  position: relative;
`;

const SearchInput = styled.input`
  padding: 8px 14px 8px 36px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  width: 260px;
  &:focus { outline: none; border-color: ${({ theme }) => theme.colors.primary}; }
`;

const SearchIcon = styled.span`
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textSecondary};
  display: flex;
`;

const AddBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:hover { opacity: 0.9; }
`;

const FilterTabs = styled.div`
  display: flex;
  gap: 4px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const FilterTab = styled.button<{ $active: boolean }>`
  padding: 8px 16px;
  border: none;
  background: none;
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.textSecondary)};
  cursor: pointer;
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : 'transparent')};
  margin-bottom: -1px;
  transition: all 0.15s;
`;

const TableWrapper = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  overflow: hidden;
  box-shadow: ${({ theme }) => theme.shadows.sm};
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
  cursor: pointer;
`;

const Badge = styled.span<{ $color: string }>`
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
`;

const ActionBtn = styled.button`
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-right: 4px;
  &:hover { color: ${({ theme }) => theme.colors.primary}; background: ${({ theme }) => theme.colors.background}; }
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 40px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

type FilterType = 'all' | 'today' | 'scheduled';

export function AppointmentList() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAppointments = useCallback(async (f: FilterType) => {
    setIsLoading(true);
    try {
      const filters: Record<string, unknown> = {};
      if (f === 'today') filters.today = true;
      if (f === 'scheduled') filters.status = 'SCHEDULED';
      const data = await window.electronAPI.appointments.getAll(filters);
      setAppointments(data as Appointment[]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAppointments(filter);
  }, [filter, loadAppointments]);

  const filteredAppointments = searchQuery
    ? appointments.filter(
        (a) =>
          a.appointmentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.patient.fullName.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : appointments;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED': return '#22c55e';
      case 'SCHEDULED': return '#0891b2';
      case 'CANCELLED': return '#ef4444';
      case 'NO_SHOW': return '#f59e0b';
      default: return '#6b7280';
    }
  };

  const getPaymentColor = (status: string) => {
    switch (status) {
      case 'PAID': return '#22c55e';
      case 'PARTIAL': return '#f59e0b';
      case 'PENDING': return '#ef4444';
      default: return '#6b7280';
    }
  };

  return (
    <Page>
      <Header>
        <Title>{t('appointments.title')}</Title>
        <Controls>
          <SearchWrapper>
            <SearchIcon><Search size={14} /></SearchIcon>
            <SearchInput
              placeholder={t('appointments.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </SearchWrapper>
          <AddBtn onClick={() => navigate('/appointments/new')}>
            <Plus size={16} />
            {t('appointments.newAppointment')}
          </AddBtn>
        </Controls>
      </Header>

      <FilterTabs>
        {(['all', 'today', 'scheduled'] as FilterType[]).map((f) => (
          <FilterTab key={f} $active={filter === f} onClick={() => setFilter(f)}>
            {t(`appointments.filter.${f}`)}
          </FilterTab>
        ))}
      </FilterTabs>

      <TableWrapper>
        {isLoading ? (
          <EmptyState>{t('common.loading')}</EmptyState>
        ) : filteredAppointments.length === 0 ? (
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
                <Th>{t('common.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {filteredAppointments.map((appt) => (
                <Tr key={appt.id} onClick={() => navigate(`/appointments/${appt.id}`)}>
                  <Td>{appt.appointmentNumber}</Td>
                  <Td>{appt.patient.fullName}</Td>
                  <Td>{appt.doctor.fullName}</Td>
                  <Td>{format(new Date(appt.appointmentDate), 'dd.MM.yyyy HH:mm')}</Td>
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
                  <Td>
                    <ActionBtn onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${appt.id}`); }}>
                      <Eye size={15} />
                    </ActionBtn>
                    {appt.paymentStatus !== 'PAID' && (
                      <ActionBtn onClick={(e) => { e.stopPropagation(); navigate(`/appointments/${appt.id}/checkout`); }}>
                        <CreditCard size={15} />
                      </ActionBtn>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </TableWrapper>
    </Page>
  );
}
