import { Stethoscope } from 'lucide-react';
import { type ChangeEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import type { ClinicSettingsDto } from '../../../shared/clinic';
import { useToast } from '../../context/ToastContext';
import { useAuthStore } from '../../store/auth-store';
import { ipcErrorKey } from '../../store/lan-store';

/**
 * Settings → Clinic: free follow-up window, the receptionist's discount limit, ticket after
 * payment. Everyone sees them; only a clinic admin changes them (main enforces).
 */
export function ClinicWorkflowSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const isAdmin = useAuthStore(
    (s) => s.user?.role === 'CLINIC_ADMIN' || s.user?.role === 'SUPER_ADMIN',
  );
  const [s, setS] = useState<ClinicSettingsDto | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.electronAPI.clinic
      .getSettings()
      .then(setS)
      .catch(() => setS(null));
  }, []);

  if (!s) return null;

  const save = async () => {
    setSaving(true);
    try {
      setS(await window.electronAPI.clinic.setSettings(s));
      toast.success(t('common.success'));
    } catch (e) {
      toast.error(t(ipcErrorKey(e, 'common.error')));
    } finally {
      setSaving(false);
    }
  };
  const num =
    (k: 'followUpFreeDays' | 'maxDiscountPercent') => (e: ChangeEvent<HTMLInputElement>) =>
      setS({ ...s, [k]: Math.max(0, parseInt(e.target.value, 10) || 0) });

  return (
    <Section>
      <SectionTitle>
        <Stethoscope size={16} />
        {t('clinicSettings.title')}
      </SectionTitle>
      <Card>
        <Grid>
          <label>
            {t('clinicSettings.followUpFreeDays')}
            <Input
              type="number"
              min={0}
              max={365}
              value={s.followUpFreeDays}
              onChange={num('followUpFreeDays')}
              disabled={!isAdmin}
            />
          </label>
          <label>
            {t('clinicSettings.maxDiscountPercent')}
            <Input
              type="number"
              min={0}
              max={100}
              value={s.maxDiscountPercent}
              onChange={num('maxDiscountPercent')}
              disabled={!isAdmin}
            />
          </label>
        </Grid>
        <Check>
          <input
            type="checkbox"
            checked={s.printTicketAfterPayment}
            onChange={(e) => setS({ ...s, printTicketAfterPayment: e.target.checked })}
            disabled={!isAdmin}
          />
          {t('clinicSettings.printTicketAfterPayment')}
        </Check>
        {isAdmin && (
          <Btn onClick={save} disabled={saving}>
            {saving ? t('common.processing') : t('common.save')}
          </Btn>
        )}
      </Card>
    </Section>
  );
}

const Section = styled.section`
  margin-bottom: 24px;
`;
const SectionTitle = styled.h2`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: ${({ theme }) => theme.colors.textSecondary};
  margin: 0 0 10px;
`;
const Card = styled.div`
  background: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 16px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;
const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  label {
    display: grid;
    gap: 4px;
  }
`;
const Input = styled.input`
  padding: 8px 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
`;
const Check = styled.label`
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
`;
const Btn = styled.button`
  margin-top: 12px;
  padding: 8px 14px;
  border: 0;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
  }
`;
