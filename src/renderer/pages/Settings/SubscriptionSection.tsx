import { CheckCircle2, Clock, CreditCard, RefreshCw, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { LICENSE_FEATURES, UPCOMING_FEATURES } from '../../../shared/license';
import { useToast } from '../../context/ToastContext';
import { useLicenseStore } from '../../store/license-store';

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
`;

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 0;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.text};
`;

const Label = styled.span`
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Plan = styled.span`
  font-weight: 700;
  color: ${({ theme }) => theme.colors.primary};
`;

const Features = styled.ul`
  list-style: none;
  padding: 0;
  margin: 8px 0 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 6px;
`;

const Feature = styled.li<{ $on: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: ${({ $on, theme }) => ($on ? theme.colors.text : theme.colors.textSecondary)};
`;

const Soon = styled.span`
  font-size: 11px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Error = styled.div`
  margin-top: 8px;
  font-size: 12px;
  color: ${({ theme }) => theme.colors.error};
`;

const Btn = styled.button`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 8px 14px;
  border: none;
  border-radius: ${({ theme }) => theme.borderRadius};
  background: ${({ theme }) => theme.colors.primary};
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : '—');

/** Settings → Subscription: what the posgro licence says, and a manual check-in. */
export function SubscriptionSection() {
  const { t } = useTranslation();
  const toast = useToast();
  const { status, checking, checkNow } = useLicenseStore();
  if (!status) return null;

  const limit = (n: number | null) => (n === null ? t('license.unlimited') : String(n));

  const onCheck = async () => {
    const s = await checkNow();
    if (s && !s.lastError) toast.success(t('license.checked'));
    else if (s?.lastError) toast.error(t(s.lastError));
  };

  return (
    <Section>
      <SectionTitle>
        <CreditCard size={15} />
        {t('license.title')}
      </SectionTitle>
      <Card>
        <Row>
          <Label>{t('license.plan')}</Label>
          <Plan>{status.plan ? t(`license.plans.${status.plan}`) : '—'}</Plan>
        </Row>
        <Row>
          <Label>{t('license.status')}</Label>
          <span>
            {t(`license.reasons.${status.reason}`)}
            {status.daysLeft !== null && ` · ${t('license.daysLeft', { count: status.daysLeft })}`}
          </span>
        </Row>
        <Row>
          <Label>{t('license.expires')}</Label>
          <span>{status.expiresAt ? fmt(status.expiresAt) : t('license.never')}</span>
        </Row>
        <Row>
          <Label>{t('license.limits.staff')}</Label>
          <span>{limit(status.limits.staff)}</span>
        </Row>
        <Row>
          <Label>{t('license.limits.monthlyVisits')}</Label>
          <span>{limit(status.limits.monthlyVisits)}</span>
        </Row>
        <Row>
          <Label>
            <Clock size={12} /> {t('license.lastCheckin')}
          </Label>
          <span>{fmt(status.lastCheckinAt)}</span>
        </Row>
        <Row>
          <Label>{t('license.checkinBy')}</Label>
          <span>{fmt(status.checkinBy)}</span>
        </Row>

        <Label>{t('license.features')}</Label>
        <Features>
          {LICENSE_FEATURES.map((f) => {
            const on = status.features.includes(f);
            return (
              <Feature key={f} $on={on}>
                {on ? <CheckCircle2 size={14} color="#10b981" /> : <XCircle size={14} />}
                {t(`license.featureName.${f}`)}
                {UPCOMING_FEATURES.includes(f) && <Soon>({t('license.comingSoon')})</Soon>}
              </Feature>
            );
          })}
        </Features>

        {status.lastError && <Error>{t(status.lastError)}</Error>}

        <Btn onClick={onCheck} disabled={checking}>
          <RefreshCw
            size={14}
            style={{ animation: checking ? 'spin 1s linear infinite' : 'none' }}
          />
          {checking ? t('license.checking') : t('license.checkNow')}
        </Btn>
      </Card>
    </Section>
  );
}
