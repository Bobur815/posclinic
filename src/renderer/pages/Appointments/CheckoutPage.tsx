import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import { ArrowLeft, CheckCircle, Printer, Wallet } from 'lucide-react';
import { useDataVersion } from '../../hooks/useDataVersion';
import { ipcErrorKey } from '../../store/lan-store';
import { useToast } from '../../context/ToastContext';

interface AppointmentData {
  id: string;
  appointmentNumber: string;
  totalAmount: number;
  paidAmount: number;
  paymentStatus: string;
  patient: { fullName: string; phone: string };
  doctor: { fullName: string } | null;
  items: Array<{
    id: string;
    serviceName: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
}

const Page = styled.div`
  max-width: 680px;
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

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
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

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 8px 10px;
  font-size: 12px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Td = styled.td`
  padding: 9px 10px;
  font-size: 13px;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const TotalSection = styled.div`
  padding: 12px 10px 0;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  margin-top: 4px;
`;

const TotalRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0;
`;

const TotalLabel = styled.span`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const TotalValue = styled.span<{ $highlight?: boolean }>`
  font-size: ${({ $highlight }) => ($highlight ? '20px' : '14px')};
  font-weight: ${({ $highlight }) => ($highlight ? 700 : 500)};
  color: ${({ $highlight }) => ($highlight ? '#0891b2' : 'inherit')};
`;

const PaymentMethodGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const MethodBtn = styled.button<{ $active: boolean }>`
  padding: 14px;
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 2px solid ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.border)};
  background: ${({ $active, theme }) => ($active ? `${theme.colors.primary}15` : theme.colors.background)};
  color: ${({ $active, theme }) => ($active ? theme.colors.primary : theme.colors.text)};
  font-size: 14px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  transition: all 0.15s;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const InputGroup = styled.div`
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const Label = styled.label`
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 4px;
`;

const Input = styled.input`
  width: 100%;
  padding: 10px 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 16px;
  font-weight: 600;
  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const ChangeDisplay = styled.div<{ $positive: boolean }>`
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ $positive }) => ($positive ? '#22c55e15' : '#ef444415')};
  color: ${({ $positive }) => ($positive ? '#22c55e' : '#ef4444')};
  font-size: 14px;
  font-weight: 600;
`;

const ConfirmBtn = styled.button`
  width: 100%;
  padding: 14px;
  background: ${({ theme }) => theme.colors.primary};
  color: white;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  &:hover:not(:disabled) { opacity: 0.9; }
  &:disabled { opacity: 0.6; cursor: not-allowed; }
`;

/** v2.6: money is taken inside an open cash shift only (main refuses otherwise). */
const ShiftNotice = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  margin-bottom: ${({ theme }) => theme.spacing.md};
  border-radius: ${({ theme }) => theme.borderRadius};
  border: 1px solid ${({ theme }) => theme.colors.warning};
  background: ${({ theme }) => `${theme.colors.warning}18`};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 12px;
    border: 0;
    border-radius: 8px;
    background: ${({ theme }) => theme.colors.primary};
    color: #fff;
    cursor: pointer;
  }
`;

const SuccessCard = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.xl};
`;

const SuccessIcon = styled.div`
  color: #22c55e;
  display: flex;
  justify-content: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const SuccessTitle = styled.h2`
  font-size: 22px;
  font-weight: 700;
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 8px;
`;

const SuccessSubtitle = styled.p`
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin-bottom: ${({ theme }) => theme.spacing.lg};
`;

const SuccessActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.sm};
  justify-content: center;
`;

const ActionBtn = styled.button<{ $primary?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: ${({ $primary, theme }) => ($primary ? 'none' : `1px solid ${theme.colors.border}`)};
  background: ${({ $primary, theme }) => ($primary ? theme.colors.primary : theme.colors.background)};
  color: ${({ $primary }) => ($primary ? 'white' : 'inherit')};
  &:hover { opacity: 0.9; }
`;

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'INSURANCE';

export function CheckoutPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const toast = useToast();

  const [appointment, setAppointment] = useState<AppointmentData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [amountStr, setAmountStr] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [shiftOpen, setShiftOpen] = useState<boolean | null>(null);
  const shiftsVersion = useDataVersion(['shifts']);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reloads when a shift opens or closes
  useEffect(() => {
    window.electronAPI.shifts
      .getOpen()
      .then((s) => setShiftOpen(s !== null))
      .catch(() => setShiftOpen(null));
  }, [shiftsVersion]);

  useEffect(() => {
    if (!id) return;
    window.electronAPI.appointments.getById(id).then((data) => {
      const appt = data as AppointmentData;
      setAppointment(appt);
      const remaining = Number(appt.totalAmount) - Number(appt.paidAmount);
      setAmountStr(String(remaining));
      setIsLoading(false);
    });
  }, [id]);

  if (isLoading) return <Page>{t('common.loading')}</Page>;
  if (!appointment) return <Page>Not found</Page>;

  const remaining = Number(appointment.totalAmount) - Number(appointment.paidAmount);
  const enteredAmount = parseFloat(amountStr) || 0;
  const change = enteredAmount - remaining;

  const handleConfirm = async () => {
    if (!id || enteredAmount <= 0) return;
    setIsProcessing(true);
    try {
      await window.electronAPI.appointments.checkout(id, {
        paymentMethod,
        amount: enteredAmount,
      });
      setIsDone(true);
      // Optional queue ticket / receipt (Settings → Clinic). A printer problem never undoes
      // the payment; the receipt can still be printed from the done screen.
      const settings = await window.electronAPI.clinic.getSettings().catch(() => null);
      if (settings?.printTicketAfterPayment) {
        window.electronAPI.print.serviceReceipt(id).catch(() => undefined);
      }
    } catch (error) {
      // Licence refusals are already toasted by LicenseBanner; show every other reason here.
      const key = ipcErrorKey(error, 'common.error');
      if (!key.startsWith('license.')) toast.error(t(key));
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrint = async () => {
    if (!id) return;
    await window.electronAPI.print.serviceReceipt(id);
    toast.success(t('common.success'));
  };

  if (isDone) {
    return (
      <Page>
        <Card>
          <SuccessCard>
            <SuccessIcon><CheckCircle size={64} /></SuccessIcon>
            <SuccessTitle>{t('checkout.paymentSuccess')}</SuccessTitle>
            <SuccessSubtitle>{appointment.appointmentNumber} — {appointment.patient.fullName}</SuccessSubtitle>
            <SuccessActions>
              <ActionBtn $primary onClick={handlePrint}>
                <Printer size={15} />
                {t('appointments.printReceipt')}
              </ActionBtn>
              <ActionBtn onClick={() => navigate(`/appointments/${id}`)}>
                {t('appointments.viewDetails')}
              </ActionBtn>
              <ActionBtn onClick={() => navigate('/appointments')}>
                {t('common.back')}
              </ActionBtn>
            </SuccessActions>
          </SuccessCard>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <BackBtn onClick={() => navigate(`/appointments/${id}`)}>
        <ArrowLeft size={14} />
        {t('common.back')}
      </BackBtn>

      <Title>{t('appointments.checkout')} — {appointment.appointmentNumber}</Title>

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
        <TotalSection>
          <TotalRow>
            <TotalLabel>{t('common.total')}</TotalLabel>
            <TotalValue $highlight>
              {Number(appointment.totalAmount).toLocaleString()} {t('common.currency')}
            </TotalValue>
          </TotalRow>
          {Number(appointment.paidAmount) > 0 && (
            <TotalRow>
              <TotalLabel>{t('appointments.paidAmount')}</TotalLabel>
              <TotalValue style={{ color: '#22c55e' }}>
                {Number(appointment.paidAmount).toLocaleString()} {t('common.currency')}
              </TotalValue>
            </TotalRow>
          )}
          {remaining < Number(appointment.totalAmount) && (
            <TotalRow>
              <TotalLabel style={{ fontWeight: 600 }}>{t('checkout.remaining')}</TotalLabel>
              <TotalValue $highlight>
                {remaining.toLocaleString()} {t('common.currency')}
              </TotalValue>
            </TotalRow>
          )}
        </TotalSection>
      </Card>

      <Card>
        <SectionTitle>{t('checkout.selectPaymentMethod')}</SectionTitle>
        <PaymentMethodGrid>
          {(['CASH', 'CARD', 'TRANSFER', 'INSURANCE'] as PaymentMethod[]).map((m) => (
            <MethodBtn key={m} $active={paymentMethod === m} onClick={() => setPaymentMethod(m)}>
              {t(`appointments.paymentMethods.${m}`, m)}
            </MethodBtn>
          ))}
        </PaymentMethodGrid>
      </Card>

      {shiftOpen === false && (
        <ShiftNotice>
          <span>{t('shifts.neededForPayment')}</span>
          <button type="button" onClick={() => navigate('/shifts')}>
            <Wallet size={14} />
            {t('shifts.open')}
          </button>
        </ShiftNotice>
      )}

      <Card>
        <InputGroup>
          <Label>{t('checkout.enterAmount')}</Label>
          <Input
            type="number"
            min={0}
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            placeholder="0"
          />
          {amountStr && enteredAmount > 0 && (
            <ChangeDisplay $positive={change >= 0}>
              {change >= 0
                ? `${t('checkout.change')}: ${change.toLocaleString()} ${t('common.currency')}`
                : `${t('checkout.shortfall')}: ${Math.abs(change).toLocaleString()} ${t('common.currency')}`}
            </ChangeDisplay>
          )}
        </InputGroup>

        <ConfirmBtn
          onClick={handleConfirm}
          disabled={isProcessing || enteredAmount <= 0 || shiftOpen === false}
        >
          <CheckCircle size={18} />
          {isProcessing ? t('common.processing') : t('checkout.confirmPayment')}
        </ConfirmBtn>
      </Card>
    </Page>
  );
}
