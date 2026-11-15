import { AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useToast } from '../../context/ToastContext';
import { useLicenseStore } from '../../store/license-store';

const Bar = styled.div<{ $severe: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  margin-bottom: 16px;
  border-radius: ${({ theme }) => theme.borderRadius};
  font-size: 13px;
  font-weight: 500;
  color: ${({ $severe, theme }) => ($severe ? theme.colors.error : theme.colors.warning)};
  background: ${({ $severe, theme }) => ($severe ? theme.colors.error : theme.colors.warning)}18;
  border: 1px solid
    ${({ $severe, theme }) => ($severe ? theme.colors.error : theme.colors.warning)}55;
`;

/**
 * Keeps the licence status fresh (main broadcasts `license:changed`), toasts every refusal main
 * reports, and warns when the subscription is ending or the till is read-only.
 */
export function LicenseBanner() {
  const { t } = useTranslation();
  const { error: toastError } = useToast();
  const { status, refresh } = useLicenseStore();

  useEffect(() => {
    void refresh();
    const offChanged = window.electronAPI.license.onChanged(() => void refresh());
    const offRefused = window.electronAPI.license.onRefused((key) => toastError(t(key)));
    return () => {
      offChanged();
      offRefused();
    };
  }, [refresh, toastError, t]);

  if (!status) return null;
  let text: string | null = null;
  if (status.mode === 'readonly') {
    text = t('license.banner.readonly', { reason: t(`license.reasons.${status.reason}`) });
  } else if (status.reason === 'warning' || status.reason === 'grace') {
    text = t(`license.banner.${status.reason}`, { count: status.daysLeft ?? 0 });
  }
  if (!text) return null;

  return (
    <Bar $severe={status.mode === 'readonly' || status.reason === 'grace'} role="status">
      <AlertTriangle size={16} />
      {text}
    </Bar>
  );
}
