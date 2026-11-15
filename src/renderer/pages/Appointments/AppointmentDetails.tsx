import React, { useEffect, useState } from 'react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, CreditCard, Printer, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { useToast } from '../../context/ToastContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';

interface AppointmentData {
  id: string;
  appointmentNumber: string;
  appointmentDate: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  totalAmount: number;
  paidAmount: number;
  diagnosis: string | null;
  prescription: string | null;
  notes: string | null;
  patient: { id: string; fullName: string; phone: string; patientCode: string };
  doctor: { fullName: string; specialty: string | null } | null;
  items: Array<{
    id: string;
    serviceName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

const Page = styled.div`
  max-width: 900px;
`;

const BackBtn = styled.button`
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  font-size: 13px;
  cursor: pointer;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const TitleBlock = styled.div``;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const Btn = styled.button<{ $variant?: 'primary' | 'danger' | 'secondary' }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: ${({ $variant, theme }) =>
    $variant === 'secondary' ? `1px solid ${theme.colors.border}` : 'none'};
  background: ${({ $variant, theme }) => {
    if ($variant === 'primary') return theme.colors.primary;
    if ($variant === 'danger') return theme.colors.error;
    return theme.colors.background;
  }};
  color: ${({ $variant, theme }) => ($variant === 'secondary' ? theme.colors.text : 'white')};
  &:hover { opacity: 0.9; }
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: ${({ theme }) => theme.spacing.md};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SectionTitle = styled.h3`
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const InfoItem = styled.div``;

const InfoLabel = styled.div`
  font-size: 11px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 2px;
`;

const InfoValue = styled.div`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
`;

const Badge = styled.span<{ $color: string }>`
  padding: 2px 10px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  background: ${({ $color }) => $color}20;
  color: ${({ $color }) => $color};
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
  padding: 9px 12px;
  font-size: 13px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 12px 12px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: 4px;
`;

const NoteText = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.text};
  line-height: 1.6;
`;

export function AppointmentDetails() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const dataVersion = useDataVersion(['appointments', 'patients', 'doctors']);
  const toast = useToast();
  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  useEffect(() => {
    if (!id) return;
    window.electronAPI.appointments.getById(id).then((data) => {
      setAppointment(data as AppointmentData);
      setIsLoading(false);
    });
  }, [id, dataVersion]);

  const handleCancel = async () => {
    if (!id) return;
    try {
      await window.electronAPI.appointments.update(id, { status: 'CANCELLED' });
      setAppointment((prev) => prev ? { ...prev, status: 'CANCELLED' } : null);
      toast.success(t('common.success'));
    } catch {
      toast.error(t('common.error'));
    }
    setShowCancelConfirm(false);
  };

  const handlePrintReceipt = async () => {
    if (!id) return;
    await window.electronAPI.print.serviceReceipt(id);
    toast.success(t('common.success'));
  };

  const handlePrintPrescription = async () => {
    if (!id) return;
    await window.electronAPI.print.prescription(id);
    toast.success(t('common.success'));
  };

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'COMPLETED': return '#22c55e';
      case 'SCHEDULED': return '#0891b2';
      case 'CANCELLED': return '#ef4444';
      default: return '#f59e0b';
    }
  };

  const getPaymentColor = (s: string) => {
    switch (s) {
      case 'PAID': return '#22c55e';
      case 'PARTIAL': return '#f59e0b';
      default: return '#ef4444';
    }
  };

  if (isLoading) return <Page>{t('common.loading')}</Page>;
  if (!appointment) return <Page>Not found</Page>;

  return (
    <Page>
      {showCancelConfirm && (
        <ConfirmDialog
          title={t('appointments.cancelAppointment')}
          message={t('appointments.cancelConfirm')}
          confirmLabel={t('appointments.cancelAppointment')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleCancel}
          onCancel={() => setShowCancelConfirm(false)}
        />
      )}

      <BackBtn onClick={() => navigate('/appointments')}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>

      <Header>
        <TitleBlock>
          <Title>{appointment.appointmentNumber}</Title>
        </TitleBlock>
        <Actions>
          {appointment.paymentStatus !== 'PAID' && appointment.status !== 'CANCELLED' && (
            <Btn $variant="primary" onClick={() => navigate(`/appointments/${id}/checkout`)}>
              <CreditCard size={15} />
              {t('appointments.checkout')}
            </Btn>
          )}
          <Btn $variant="secondary" onClick={handlePrintReceipt}>
            <Printer size={15} />
            {t('appointments.printReceipt')}
          </Btn>
          <Btn $variant="secondary" onClick={handlePrintPrescription}>
            <Printer size={15} />
            {t('appointments.printPrescription')}
          </Btn>
          {appointment.status === 'SCHEDULED' && (
            <Btn $variant="danger" onClick={() => setShowCancelConfirm(true)}>
              <XCircle size={15} />
              {t('appointments.cancelAppointment')}
            </Btn>
          )}
        </Actions>
      </Header>

      <Card>
        <Grid>
          <InfoItem>
            <InfoLabel>{t('appointments.patient')}</InfoLabel>
            <InfoValue
              style={{ cursor: 'pointer', color: 'inherit' }}
              onClick={() => navigate(`/patients/${appointment.patient.id}`)}
            >
              {appointment.patient.fullName}
            </InfoValue>
            <InfoValue style={{ fontSize: '12px', opacity: 0.7 }}>{appointment.patient.phone}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('appointments.doctor')}</InfoLabel>
            <InfoValue>{appointment.doctor?.fullName ?? '—'}</InfoValue>
            {appointment.doctor?.specialty && (
              <InfoValue style={{ fontSize: '12px', opacity: 0.7 }}>{appointment.doctor.specialty}</InfoValue>
            )}
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('appointments.appointmentDate')}</InfoLabel>
            <InfoValue>{format(new Date(appointment.appointmentDate), 'dd.MM.yyyy HH:mm')}</InfoValue>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('appointments.status')}</InfoLabel>
            <Badge $color={getStatusColor(appointment.status)}>
              {t(`appointments.statuses.${appointment.status}`, appointment.status)}
            </Badge>
          </InfoItem>
          <InfoItem>
            <InfoLabel>{t('appointments.paymentStatus')}</InfoLabel>
            <Badge $color={getPaymentColor(appointment.paymentStatus)}>
              {t(`appointments.paymentStatuses.${appointment.paymentStatus}`, appointment.paymentStatus)}
            </Badge>
          </InfoItem>
          {appointment.paymentMethod && (
            <InfoItem>
              <InfoLabel>{t('checkout.selectPaymentMethod')}</InfoLabel>
              <InfoValue>{t(`appointments.paymentMethods.${appointment.paymentMethod}`, appointment.paymentMethod)}</InfoValue>
            </InfoItem>
          )}
        </Grid>
      </Card>

      <Card>
        <SectionTitle>{t('appointments.services')}</SectionTitle>
        <Table>
          <thead>
            <tr>
              <Th>{t('services.name')}</Th>
              <Th>{t('appointments.quantity')}</Th>
              <Th>{t('appointments.unitPrice')}</Th>
              <Th>{t('appointments.subtotal')}</Th>
            </tr>
          </thead>
          <tbody>
            {appointment.items.map((item) => (
              <tr key={item.id}>
                <Td>{item.serviceName}</Td>
                <Td>{item.quantity}</Td>
                <Td>{Number(item.unitPrice).toLocaleString()} {t('common.currency')}</Td>
                <Td>{Number(item.total).toLocaleString()} {t('common.currency')}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <TotalRow>
          <span style={{ fontWeight: 600 }}>{t('common.total')}:</span>
          <span style={{ fontWeight: 700, fontSize: '18px', color: '#0891b2' }}>
            {Number(appointment.totalAmount).toLocaleString()} {t('common.currency')}
          </span>
        </TotalRow>
        {Number(appointment.paidAmount) > 0 && (
          <TotalRow>
            <span style={{ fontWeight: 600 }}>{t('appointments.paidAmount')}:</span>
            <span style={{ fontWeight: 600, color: '#22c55e' }}>
              {Number(appointment.paidAmount).toLocaleString()} {t('common.currency')}
            </span>
          </TotalRow>
        )}
      </Card>

      {(appointment.diagnosis || appointment.prescription) && (
        <Card>
          <SectionTitle>{t('appointments.diagnosis')}</SectionTitle>
          {appointment.diagnosis && <NoteText>{appointment.diagnosis}</NoteText>}
          {appointment.prescription && (
            <>
              <SectionTitle style={{ marginTop: '16px' }}>{t('appointments.prescription')}</SectionTitle>
              <NoteText>{appointment.prescription}</NoteText>
            </>
          )}
        </Card>
      )}

      {appointment.notes && (
        <Card>
          <SectionTitle>{t('common.notes')}</SectionTitle>
          <NoteText>{appointment.notes}</NoteText>
        </Card>
      )}
    </Page>
  );
}
